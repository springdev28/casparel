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
  type PurchaseFailure,
  type RCCustomerInfo,
  type RCOffering,
  type RCPackage,
} from '@/utils/revenuecat';
import { useAuth } from '@/contexts/AuthContext';
import { reviewerSubscriptionTier } from '@/utils/reviewer-entitlement';

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

interface PurchasesContextValue {
  /** The SDK finished its first load (configured or definitively unavailable). */
  ready: boolean;
  /** RevenueCat is configured and usable on this device. */
  available: boolean;
  /** Compatibility flag: the user holds any paid entitlement. */
  isPremium: boolean;
  /** RevenueCat's active tier, including the role-specific plans. */
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

  const purchasesRef = useRef<PurchasesModule | null>(null);
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(false);
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
      const Purchases = await loadPurchases();
      if (cancelled) return;

      if (!Purchases || !purchasesSupported || !RC_API_KEY) {
        // Web, Expo Go, or missing keys, degrade to a free-only experience.
        setAvailable(false);
        setReady(true);
        return;
      }

      try {
        Purchases.configure({ apiKey: RC_API_KEY });
        purchasesRef.current = Purchases;
        setAvailable(true);

        listener = (info: RCCustomerInfo) => applyCustomerInfo(info);
        Purchases.addCustomerInfoUpdateListener(listener);

        const [info, offerings] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ]);
        if (cancelled) return;
        applyCustomerInfo(info);
        setCurrentOffering(offerings.current ?? null);
      } catch {
        setAvailable(false);
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
          const { customerInfo: info } = await Purchases.logIn(String(user.id));
          if (!cancelled) applyCustomerInfo(info);
        } else {
          const info = await Purchases.logOut();
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
      setCurrentOffering(offerings.current ?? null);
    } catch {
      // ignore transient errors
    }
  }, [applyCustomerInfo]);

  const purchase = useCallback(
    async (pkg: RCPackage): Promise<PurchaseResult> => {
      const Purchases = purchasesRef.current;
      if (!Purchases) return 'unsupported';
      try {
        const { customerInfo: info } = await Purchases.purchasePackage(pkg);
        applyCustomerInfo(info);
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
    [applyCustomerInfo, refresh],
  );

  const restore = useCallback(async (): Promise<boolean> => {
    const Purchases = purchasesRef.current;
    if (!Purchases) return false;
    try {
      const info = await Purchases.restorePurchases();
      applyCustomerInfo(info);
      return hasPremium(info);
    } catch {
      return false;
    }
  }, [applyCustomerInfo]);

  const value = useMemo<PurchasesContextValue>(() => {
    // Google Play's reviewer uses a deliberately provisioned Institutional
    // seat, not a store purchase. The exact-account override is presentation
    // only; the API applies and enforces the same exception independently.
    const tier =
      reviewerSubscriptionTier(user?.email) ?? subscriptionTier(customerInfo);
    const level = tierLevel(tier);
    return {
      ready,
      available,
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
      customerInfo,
      currentOffering,
      purchase,
      restore,
      refresh,
      user?.email,
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
