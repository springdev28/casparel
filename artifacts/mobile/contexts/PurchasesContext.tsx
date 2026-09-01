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
  hasPremium,
  loadPurchases,
  purchasesSupported,
  RC_API_KEY,
  subscriptionTier,
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
import { useQueryClient } from '@tanstack/react-query';
import { getGetMyUsageQueryKey } from '@workspace/api-client-react';

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
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const purchasesRef = useRef<PurchasesModule | null>(null);
  const identifiedUserRef = useRef<string | null>(null);
  const customerInfoListenerRef = useRef<((info: RCCustomerInfo) => void) | null>(null);
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

    (async () => {
      // Never create an anonymous RevenueCat customer while a restored
      // Casparel session is still being read from secure storage.
      if (authLoading || (isAuthenticated && user?.id == null)) return;
      if (purchasesRef.current) {
        setReady(true);
        return;
      }
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
        const initialAppUserID = isAuthenticated && user?.id != null
          ? String(user.id)
          : null;
        Purchases.configure(
          initialAppUserID
            ? { apiKey: RC_API_KEY, appUserID: initialAppUserID }
            : { apiKey: RC_API_KEY },
        );
        purchasesRef.current = Purchases;
        identifiedUserRef.current = initialAppUserID;
        setAvailable(true);
        setAvailabilityIssue(null);

        const listener = (info: RCCustomerInfo) => applyCustomerInfo(info);
        customerInfoListenerRef.current = listener;
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
    };
  }, [applyCustomerInfo, authLoading, isAuthenticated, user?.id]);

  useEffect(() => () => {
    const Purchases = purchasesRef.current;
    const listener = customerInfoListenerRef.current;
    if (Purchases && listener) {
      try {
        Purchases.removeCustomerInfoUpdateListener(listener);
      } catch {
        // ignore teardown failures
      }
    }
  }, []);

  // Associate RevenueCat's identity with the signed-in Casparel user so that
  // entitlements follow the account across devices.
  useEffect(() => {
    const Purchases = purchasesRef.current;
    if (!Purchases || !available) return;
    let cancelled = false;

    (async () => {
      try {
        if (isAuthenticated && user?.id != null) {
          const appUserID = String(user.id);
          if (identifiedUserRef.current === appUserID) return;
          const { customerInfo: info } = await Purchases.logIn(appUserID);
          identifiedUserRef.current = appUserID;
          if (!cancelled) applyCustomerInfo(info);
        } else {
          if (identifiedUserRef.current === null) return;
          const info = await Purchases.logOut();
          identifiedUserRef.current = null;
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

  const ensureIdentified = useCallback(async () => {
    const Purchases = purchasesRef.current;
    if (!Purchases || !isAuthenticated || user?.id == null) return null;
    const appUserID = String(user.id);
    if (identifiedUserRef.current === appUserID) return Purchases;
    const { customerInfo: info } = await Purchases.logIn(appUserID);
    identifiedUserRef.current = appUserID;
    applyCustomerInfo(info);
    return Purchases;
  }, [applyCustomerInfo, isAuthenticated, user?.id]);

  const refreshServerEntitlement = useCallback(() => {
    const queryKey = getGetMyUsageQueryKey();
    const sync = () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.refetchQueries({ queryKey, type: 'active' });
    };
    sync();
    // RevenueCat webhooks are asynchronous. Two bounded follow-ups cover the
    // normal delivery window without leaving a poller running indefinitely.
    setTimeout(sync, 2_500);
    setTimeout(sync, 6_000);
  }, [queryClient]);

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

  const purchase = useCallback(
    async (pkg: RCPackage): Promise<PurchaseResult> => {
      try {
        const Purchases = await ensureIdentified();
        if (!Purchases) return 'unsupported';
        const { customerInfo: info } = await Purchases.purchasePackage(pkg);
        applyCustomerInfo(info);
        refreshServerEntitlement();
        return 'success';
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
    [applyCustomerInfo, ensureIdentified, refresh, refreshServerEntitlement],
  );

  const restore = useCallback(async (): Promise<boolean> => {
    try {
      const Purchases = await ensureIdentified();
      if (!Purchases) return false;
      const info = await Purchases.restorePurchases();
      applyCustomerInfo(info);
      refreshServerEntitlement();
      return hasPremium(info);
    } catch {
      return false;
    }
  }, [applyCustomerInfo, ensureIdentified, refreshServerEntitlement]);

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
    [ready, available, availabilityIssue, customerInfo, currentOffering, purchase, restore, refresh],
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
