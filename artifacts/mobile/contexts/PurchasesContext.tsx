/**
 * @fileOverview Mobile state role: owns the app-wide Purchases Context context and lifecycle.
 * System connection: installed by app/_layout.tsx and consumed by screens/components that need shared account state.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  googleProductChangeFor,
  hasPremium,
  loadPurchases,
  purchasesSupported,
  RC_API_KEY,
  subscriptionTier,
  tierForPackage,
  tierLevel,
  type SubscriptionTier,
  type TierLevel,
  type PurchasesModule,
  classifyPurchaseError,
  defaultOffering,
  type PurchaseFailure,
  type RCCustomerInfo,
  type RCOffering,
  type RCPackage,
} from '@/utils/revenuecat';
import { useAuth } from '@/contexts/AuthContext';

/**
 * How a purchase ended.
 *
 * This was 'success' | 'cancelled' | 'error' | 'unsupported', which meant the
 * paywall could only ever say "Something went wrong. Please try again." to
 * somebody whose purchase is pending a parent's approval, or who has already
 * paid and needs a restore. See PurchaseFailure for why each of these is
 * worth telling apart.
 */
export type PurchaseResult =
  | 'success'
  | 'unsupported'
  | Exclude<PurchaseFailure, never>;

export type PurchaseAvailabilityIssue =
  | 'unsupported-platform'
  | 'missing-key'
  | 'missing-native-sdk'
  | 'configuration-error'
  | 'no-offering'
  | null;

interface PurchasesContextValue {
  /** The SDK finished its first load (configured or definitively unavailable). */
  ready: boolean;
  /** RevenueCat is configured and usable on this device. */
  available: boolean;
  /** Why plans cannot be shown, when known. Never silently collapse this to free. */
  availabilityIssue: PurchaseAvailabilityIssue;
  /** Compatibility flag: the user holds any paid entitlement. */
  isPremium: boolean;
  /** RevenueCat's active self-serve tier. */
  tier: SubscriptionTier;
  /** The tier's price level, which is what upgrade decisions care about. */
  level: TierLevel;
  isPlus: boolean;
  isPro: boolean;
  /** The current offering's purchasable packages (empty when unavailable). */
  packages: RCPackage[];
  currentOffering: RCOffering | null;
  customerInfo: RCCustomerInfo | null;
  purchase: (pkg: RCPackage) => Promise<PurchaseResult>;
  restore: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

const PurchasesContext = createContext<PurchasesContextValue | null>(null);

export function PurchasesProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  // Refs mirror auth state for the configure effect, which runs once and must
  // not re-run (RevenueCat allows a single configure per process).
  const userIdRef = useRef<number | null>(user?.id ?? null);
  const isAuthenticatedRef = useRef(isAuthenticated);
  userIdRef.current = user?.id ?? null;
  isAuthenticatedRef.current = isAuthenticated;

  const purchasesRef = useRef<PurchasesModule | null>(null);
  /** The Casparel user id RevenueCat is currently logged in as, or null. */
  const identityRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(false);
  const [availabilityIssue, setAvailabilityIssue] =
    useState<PurchaseAvailabilityIssue>(null);
  const [customerInfo, setCustomerInfo] = useState<RCCustomerInfo | null>(null);
  const [currentOffering, setCurrentOffering] = useState<RCOffering | null>(null);

  const applyCustomerInfo = useCallback((info: RCCustomerInfo | null) => {
    setCustomerInfo(info);
  }, []);

  // Configure the SDK once, as early as possible.
  useEffect(() => {
    let cancelled = false;
    let listener: ((info: RCCustomerInfo) => void) | null = null;

    (async () => {
      if (!purchasesSupported) {
        setAvailabilityIssue('unsupported-platform');
        setAvailable(false);
        setReady(true);
        return;
      }
      if (!RC_API_KEY) {
        setAvailabilityIssue('missing-key');
        setAvailable(false);
        setReady(true);
        return;
      }

      const Purchases = await loadPurchases();
      if (cancelled) return;
      if (!Purchases) {
        setAvailabilityIssue('missing-native-sdk');
        setAvailable(false);
        setReady(true);
        return;
      }

      try {
        // Configure straight onto the signed-in identity when it is already
        // restored. Configuring anonymously and logging in later left a
        // window in which a purchase could attach to an anonymous alias.
        const knownUserId =
          isAuthenticatedRef.current && userIdRef.current != null
            ? String(userIdRef.current)
            : null;
        Purchases.configure({ apiKey: RC_API_KEY, appUserID: knownUserId });
        identityRef.current = knownUserId;
        purchasesRef.current = Purchases;
        setAvailable(true);
        setAvailabilityIssue(null);

        listener = (info: RCCustomerInfo) => applyCustomerInfo(info);
        Purchases.addCustomerInfoUpdateListener(listener);

        const [info, offerings] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ]);
        if (cancelled) return;
        applyCustomerInfo(info);
        const offering = defaultOffering(offerings);
        setCurrentOffering(offering);
        setAvailabilityIssue(
          offering?.availablePackages.length ? null : 'no-offering',
        );
      } catch {
        setAvailable(false);
        setAvailabilityIssue('configuration-error');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      const Purchases = purchasesRef.current;
      if (Purchases && listener) {
        try {
          Purchases.removeCustomerInfoUpdateListener(listener);
        } catch {
          // ignore
        }
      }
    };
  }, [applyCustomerInfo]);

  // Associate RevenueCat's identity with the signed-in Casparel user so that
  // entitlements follow the account across devices.
  useEffect(() => {
    const Purchases = purchasesRef.current;
    if (!Purchases || !available) return;
    let cancelled = false;

    (async () => {
      try {
        if (isAuthenticated && user?.id != null) {
          if (identityRef.current === String(user.id)) return;
          const { customerInfo: info } = await Purchases.logIn(String(user.id));
          identityRef.current = String(user.id);
          if (!cancelled) applyCustomerInfo(info);
        } else if (identityRef.current !== null) {
          const info = await Purchases.logOut();
          identityRef.current = null;
          if (!cancelled) applyCustomerInfo(info);
        }
      } catch {
        // Non-fatal: the anonymous RevenueCat user still works.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [available, isAuthenticated, user?.id, applyCustomerInfo]);

  const refresh = useCallback(async () => {
    const Purchases = purchasesRef.current;
    if (!Purchases) return;
    try {
      const [info, offerings] = await Promise.all([
        Purchases.getCustomerInfo(),
        Purchases.getOfferings(),
      ]);
      applyCustomerInfo(info);
      const offering = defaultOffering(offerings);
      setCurrentOffering(offering);
      setAvailabilityIssue(
        offering?.availablePackages.length ? null : 'no-offering',
      );
    } catch {
      // ignore transient errors
    }
  }, [applyCustomerInfo]);

  /**
   * Make sure RevenueCat is acting as the signed-in Casparel account before
   * money moves. Without this, a purchase begun in the moment between
   * configure() and the login effect attached to an anonymous alias.
   */
  const ensureIdentity = useCallback(async (): Promise<void> => {
    const Purchases = purchasesRef.current;
    if (!Purchases) return;
    const userId =
      isAuthenticatedRef.current && userIdRef.current != null
        ? String(userIdRef.current)
        : null;
    if (userId === null || identityRef.current === userId) return;
    const { customerInfo: info } = await Purchases.logIn(userId);
    identityRef.current = userId;
    applyCustomerInfo(info);
  }, [applyCustomerInfo]);

  const purchase = useCallback(
    async (pkg: RCPackage): Promise<PurchaseResult> => {
      const Purchases = purchasesRef.current;
      if (!Purchases) return 'unsupported';
      try {
        await ensureIdentity();
        // A plan or billing-period switch must replace the existing Google
        // Play subscription, never run beside it.
        const productChange = googleProductChangeFor(
          customerInfo?.activeSubscriptions ?? [],
          pkg,
        );
        const { customerInfo: info } = await Purchases.purchasePackage(
          pkg,
          null,
          productChange,
        );
        applyCustomerInfo(info);
        // Success is only what the store's customer record confirms. A
        // deferred/approval-pending purchase resolves without an error but
        // without the entitlement; reporting it as success would show a
        // welcome screen for a plan the account does not have.
        const purchasedTier = tierForPackage(pkg);
        const confirmed =
          purchasedTier !== null &&
          info.entitlements.active[purchasedTier]?.isActive === true;
        return confirmed ? 'success' : 'pending';
      } catch (e) {
        const failure = classifyPurchaseError(e);
        // A pending purchase may complete on its own once a parent or a bank
        // approves it, and an already-owned one is already paid for. Refresh
        // so the app notices either without the person doing anything.
        if (failure === 'pending' || failure === 'already-owned') {
          void refresh();
        }
        return failure;
      }
    },
    [applyCustomerInfo, customerInfo, ensureIdentity, refresh],
  );

  const restore = useCallback(async (): Promise<boolean> => {
    const Purchases = purchasesRef.current;
    if (!Purchases) return false;
    try {
      await ensureIdentity();
      const info = await Purchases.restorePurchases();
      applyCustomerInfo(info);
      return hasPremium(info);
    } catch {
      return false;
    }
  }, [applyCustomerInfo, ensureIdentity]);

  const value = useMemo<PurchasesContextValue>(() => {
    const tier = subscriptionTier(customerInfo);
    const level = tierLevel(tier);
    return {
      ready,
      available,
      availabilityIssue,
      tier,
      level,
      isPremium: tier !== 'free',
      isPlus: level === 'plus',
      isPro: level === 'pro',
      packages: currentOffering?.availablePackages ?? [],
      currentOffering,
      customerInfo,
      purchase,
      restore,
      refresh,
    };
  },
    [
      ready,
      available,
      availabilityIssue,
      customerInfo,
      currentOffering,
      purchase,
      restore,
      refresh,
    ],
  );

  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
}

export function usePurchases(): PurchasesContextValue {
  const ctx = useContext(PurchasesContext);
  if (!ctx) throw new Error('usePurchases must be used within a PurchasesProvider');
  return ctx;
}

/** Convenience gate hook: whether the current user has premium access. */
export function usePremium(): boolean {
  return usePurchases().isPremium;
}
