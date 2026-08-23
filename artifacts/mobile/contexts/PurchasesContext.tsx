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
  reconcileMyEntitlements,
  type EntitlementReconciliationPlan,
} from '@workspace/api-client-react';
import {
  hasPremium,
  loadPurchases,
  purchasesSupported,
  RC_API_KEY,
  subscriptionTier,
  tierForPackage,
  type SubscriptionTier,
  type PurchasesModule,
  type RCCustomerInfo,
  type RCOffering,
  type RCPackage,
} from '@/utils/revenuecat';
import { useAuth } from '@/contexts/AuthContext';

export type PurchaseResult =
  | 'success'
  | 'sync_pending'
  | 'identity_not_ready'
  | 'cancelled'
  | 'error'
  | 'unsupported';
export type RestoreResult =
  | 'restored'
  | 'not_found'
  | 'sync_pending'
  | 'identity_not_ready'
  | 'error'
  | 'unsupported';

interface PurchasesContextValue {
  /** The SDK finished its first load (configured or definitively unavailable). */
  ready: boolean;
  /** RevenueCat is configured and usable on this device. */
  available: boolean;
  /** The SDK is associated with the authenticated numeric Casparel account. */
  identityReady: boolean;
  /** Compatibility flag: the user holds either paid entitlement. */
  isPremium: boolean;
  /** RevenueCat's active Free, Plus, or Pro tier. */
  tier: SubscriptionTier;
  isPlus: boolean;
  isPro: boolean;
  /** The current offering's purchasable packages (empty when unavailable). */
  packages: RCPackage[];
  currentOffering: RCOffering | null;
  customerInfo: RCCustomerInfo | null;
  purchase: (pkg: RCPackage) => Promise<PurchaseResult>;
  restore: () => Promise<RestoreResult>;
  refresh: () => Promise<void>;
}

const PurchasesContext = createContext<PurchasesContextValue | null>(null);

export function PurchasesProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();

  const purchasesRef = useRef<PurchasesModule | null>(null);
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(false);
  const [identityReady, setIdentityReady] = useState(false);
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
        setIdentityReady(false);
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
    setIdentityReady(false);

    (async () => {
      try {
        if (isAuthenticated && user?.id != null) {
          const { customerInfo: info } = await Purchases.logIn(String(user.id));
          if (!cancelled) {
            applyCustomerInfo(info);
            setIdentityReady(true);
          }
        } else {
          const info = await Purchases.logOut();
          if (!cancelled) {
            applyCustomerInfo(info);
            setIdentityReady(true);
          }
        }
      } catch {
        // Do not enable purchase/restore on an anonymous or stale alias while
        // a Casparel account is signed in. That purchase would not map to the
        // numeric user id consumed by the server webhook and reconciliation.
        if (!cancelled) setIdentityReady(false);
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
      // A retry also re-establishes the numeric RevenueCat alias. Merely
      // refetching Customer Info could leave a signed-in user stuck on the
      // anonymous identity after a transient logIn failure.
      setIdentityReady(false);
      const info =
        isAuthenticated && user?.id != null
          ? (await Purchases.logIn(String(user.id))).customerInfo
          : await Purchases.getCustomerInfo();
      const offerings = await Purchases.getOfferings();
      applyCustomerInfo(info);
      setCurrentOffering(offerings.current ?? null);
      setIdentityReady(true);
    } catch {
      setIdentityReady(false);
    }
  }, [applyCustomerInfo, isAuthenticated, user?.id]);

  const purchase = useCallback(
    async (pkg: RCPackage): Promise<PurchaseResult> => {
      const Purchases = purchasesRef.current;
      if (!Purchases) return 'unsupported';
      if (!identityReady || !isAuthenticated || user?.id == null) {
        return 'identity_not_ready';
      }
      const expectedTier = tierForPackage(pkg);
      if (!expectedTier) return 'error';
      try {
        const { customerInfo: info } = await Purchases.purchasePackage(pkg);
        applyCustomerInfo(info);
        try {
          const serverPlan = await reconcileMyEntitlements();
          const localTier = subscriptionTier(info);
          const rank: Record<SubscriptionTier | EntitlementReconciliationPlan, number> = {
            free: 0,
            plus: 1,
            pro: 2,
          };
          // A purchase is fully complete only after the API authority has at
          // least the same access observed by the native store SDK.
          return rank[serverPlan.plan] >= rank[expectedTier] &&
            rank[localTier] >= rank[expectedTier]
            ? 'success'
            : 'sync_pending';
        } catch {
          // The App Store/Play transaction already succeeded. Never call it a
          // failed purchase or encourage a duplicate charge because a later
          // server synchronization request had a transient failure.
          return 'sync_pending';
        }
      } catch (e) {
        if (e && typeof e === 'object' && (e as { userCancelled?: boolean }).userCancelled) {
          return 'cancelled';
        }
        return 'error';
      }
    },
    [applyCustomerInfo, identityReady, isAuthenticated, user?.id],
  );

  const restore = useCallback(async (): Promise<RestoreResult> => {
    const Purchases = purchasesRef.current;
    if (!Purchases) return 'unsupported';
    if (!identityReady || !isAuthenticated || user?.id == null) {
      return 'identity_not_ready';
    }
    try {
      const info = await Purchases.restorePurchases();
      applyCustomerInfo(info);
      const localHasPremium = hasPremium(info);
      try {
        const serverPlan = await reconcileMyEntitlements();
        if (serverPlan.plan !== 'free') return 'restored';
        return localHasPremium ? 'sync_pending' : 'not_found';
      } catch {
        return localHasPremium ? 'sync_pending' : 'error';
      }
    } catch {
      return 'error';
    }
  }, [applyCustomerInfo, identityReady, isAuthenticated, user?.id]);

  const value = useMemo<PurchasesContextValue>(() => {
    // Customer Info loaded before logIn belongs to an anonymous or previous
    // SDK identity. Do not use it to unlock the signed-in account.
    const tier = identityReady ? subscriptionTier(customerInfo) : 'free';
    return {
      ready,
      available,
      identityReady,
      tier,
      isPremium: tier !== 'free',
      isPlus: tier === 'plus',
      isPro: tier === 'pro',
      packages: currentOffering?.availablePackages ?? [],
      currentOffering,
      customerInfo,
      purchase,
      restore,
      refresh,
    };
  },
    [ready, available, identityReady, customerInfo, currentOffering, purchase, restore, refresh],
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
