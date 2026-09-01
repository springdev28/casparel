/**
 * One restrained AdSense placement for signed-in Free dashboards.
 *
 * Casparel never supplies profile, class, message, search, or study data to
 * advertising. The request is always non-personalized and is not made until
 * the reader has accepted the advertising privacy notice on this device.
 */
import { useEffect, useState } from 'react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { useGetMe } from '@workspace/api-client-react';
import { usePlan } from '@/lib/use-plan';
import {
  loadWebBilling,
  webBillingConfigured,
  webBillingEntitlementState,
} from '@/lib/webBilling';

const CONSENT_KEY = 'casparel_contextual_ads_v1';
const CLIENT = String(import.meta.env.VITE_ADSENSE_CLIENT_ID ?? '').trim();
const SLOT = String(import.meta.env.VITE_ADSENSE_DASHBOARD_SLOT ?? '').trim();
const CONFIGURED = /^ca-pub-\d{16}$/.test(CLIENT) && /^\d{5,20}$/.test(SLOT);

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>> & {
      requestNonPersonalizedAds?: number;
    };
  }
}

type Consent = 'accepted' | 'declined' | null;
type BillingState = 'loading' | 'free' | 'paid' | 'unavailable';

function storedConsent(): Consent {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === 'accepted' || value === 'declined' ? value : null;
  } catch {
    return null;
  }
}

function storeConsent(value: Exclude<Consent, null>): boolean {
  try {
    localStorage.setItem(CONSENT_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function isNativeShell(): boolean {
  try {
    return localStorage.getItem('casparel_native_shell') === 'true';
  } catch {
    // Storage is required for the WebView session bridge, so fail closed.
    return true;
  }
}

export function WebAdSlot() {
  const plan = usePlan();
  const { data: me } = useGetMe();
  const [consent, setConsent] = useState<Consent>(storedConsent);
  const [failed, setFailed] = useState(false);
  const [billingState, setBillingState] = useState<BillingState>('loading');
  // Android uses its native AdMob placement and UMP consent. Never load the
  // web provider inside the authenticated native WebView shell.
  const nativeShell = isNativeShell();
  const eligible =
    CONFIGURED &&
    !nativeShell &&
    !plan.pending &&
    plan.tier === 'free' &&
    me?.role !== 'admin' &&
    billingState === 'free';

  useEffect(() => {
    let cancelled = false;
    if (nativeShell || !CONFIGURED || !webBillingConfigured() || me?.id == null) {
      setBillingState('unavailable');
      return;
    }
    setBillingState('loading');
    void loadWebBilling(me.id)
      .then((purchases) => purchases ? webBillingEntitlementState(purchases) : 'unavailable')
      .then((state) => {
        if (!cancelled) setBillingState(state);
      })
      .catch(() => {
        if (!cancelled) setBillingState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [me?.id, nativeShell]);

  useEffect(() => {
    if (!eligible || consent !== 'accepted' || failed) return;
    const scriptId = 'casparel-adsense';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    const requestAd = () => {
      try {
        const queue = (window.adsbygoogle = window.adsbygoogle ?? []);
        // Every request stays contextual/non-personalized, including adults.
        queue.requestNonPersonalizedAds = 1;
        queue.push({});
      } catch {
        setFailed(true);
      }
    };
    if (script) {
      requestAd();
      return;
    }
    script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CLIENT)}`;
    script.addEventListener('load', requestAd, { once: true });
    script.addEventListener('error', () => setFailed(true), { once: true });
    document.head.appendChild(script);
  }, [consent, eligible, failed]);

  if (!eligible || consent === 'declined' || failed) return null;

  if (consent !== 'accepted') {
    return (
      <aside className="mx-auto mt-4 flex max-w-7xl flex-col gap-3 rounded-xl border bg-card p-4 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Advertising privacy choice">
        <div>
          <p className="font-semibold">Privacy-safe advertising on Free</p>
          <p className="mt-1 text-muted-foreground">
            Casparel can show one contextual, non-personalized education ad on
            the dashboard. We never use your profile, searches, classes,
            messages, or study work to target it.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              storeConsent('declined');
              setConsent('declined');
            }}
          >
            No ads
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setConsent(storeConsent('accepted') ? 'accepted' : 'declined');
            }}
          >
            Allow contextual ad
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="mx-auto mt-4 max-w-7xl overflow-hidden rounded-xl border bg-card p-3" aria-label="Advertisement">
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Advertisement
      </p>
      <ins
        className="adsbygoogle block min-h-[90px]"
        data-ad-client={CLIENT}
        data-ad-slot={SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
        data-npa="1"
      />
    </aside>
  );
}
