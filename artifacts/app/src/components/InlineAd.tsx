/**
 * @fileOverview Web UI role: renders one clearly-labelled inline advertisement inside page content.
 * System connection: eligibility comes from lib/webAds and lib/ad-consent; the
 * slot is an ordinary block element in the document flow, never an overlay.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { X } from "lucide-react";
import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { usePlan } from "../lib/use-plan";
import { readSessionClaims } from "../lib/session";
import { useUserPreferences } from "../lib/user-preferences";
import {
  ADSENSE_CLIENT_ID,
  ADSENSE_INLINE_SLOT,
  loadAdSense,
  mayShowWebAd,
  pathAllowsWebAd,
  webAdsConfigured,
} from "../lib/webAds";
import { readAdConsent, subscribeToAdConsent } from "../lib/ad-consent";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const NATIVE_AD_SLOT_HEIGHT = 300;
const NATIVE_AD_SAFE_TOP = 72;

function nativeAdsEligible(): boolean {
  try {
    return localStorage.getItem("casparel_native_ads_eligible") === "true";
  } catch {
    return false;
  }
}

function postToNative(message: Record<string, unknown>): void {
  const bridge = (
    window as Window & {
      ReactNativeWebView?: { postMessage: (value: string) => void };
    }
  ).ReactNativeWebView;
  bridge?.postMessage(JSON.stringify(message));
}

/**
 * A compact sponsored block for a main content page.
 *
 * It is an inline element: it participates in the page's normal flow, scrolls
 * with everything else, and never covers navigation or content. When it
 * cannot render — no configuration, no consent, an ineligible route, a Pro
 * account with ads off, a blocked script — it returns null and the page
 * closes up around it rather than leaving a hole.
 */
export function InlineAd({ className }: { className?: string }) {
  const [location] = useLocation();
  const signedIn = Boolean(readSessionClaims());
  const { data: me } = useGetMe({
    query: { enabled: signedIn, queryKey: getGetMeQueryKey() },
  });
  const plan = usePlan(signedIn);
  const preferences = useUserPreferences(Boolean(me));
  const consent = useSyncExternalStore(
    subscribeToAdConsent,
    readAdConsent,
    () => "unknown" as const,
  );

  const slot = useRef<HTMLModElement>(null);
  const nativeSlot = useRef<HTMLElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [nativeEligible, setNativeEligible] = useState(nativeAdsEligible);

  const nativeShell = (() => {
    try {
      return localStorage.getItem("casparel_native_shell") === "true";
    } catch {
      return false;
    }
  })();

  const canDisableAds =
    !plan.pending &&
    (plan.level === "pro" ||
      plan.tier === "institutional" ||
      plan.tier === "administrator");

  useEffect(() => {
    setDismissed(false);
  }, [location]);

  useEffect(() => {
    const update = () => setNativeEligible(nativeAdsEligible());
    const dismiss = (event: Event) => {
      const placement = (event as CustomEvent<string>).detail;
      if (placement === `inline:${location}`) setDismissed(true);
    };
    window.addEventListener("casparel-native-ads-eligibility-change", update);
    window.addEventListener("casparel-native-ad-dismiss", dismiss);
    return () => {
      window.removeEventListener(
        "casparel-native-ads-eligibility-change",
        update,
      );
      window.removeEventListener("casparel-native-ad-dismiss", dismiss);
    };
  }, [location]);

  const nativePlacementEligible =
    nativeShell && nativeEligible && pathAllowsWebAd(location) && !dismissed;

  useEffect(() => {
    if (!nativePlacementEligible || !nativeSlot.current) return;
    const placementId = `inline:${location}`;
    let frame = 0;
    const publish = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const element = nativeSlot.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const visible =
          rect.top >= NATIVE_AD_SAFE_TOP && rect.bottom <= window.innerHeight;
        postToNative({
          type: "native-ad-placement",
          id: placementId,
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          visible,
        });
      });
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(publish);
    observer?.observe(nativeSlot.current);
    window.addEventListener("scroll", publish, true);
    window.addEventListener("resize", publish);
    publish();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", publish, true);
      window.removeEventListener("resize", publish);
      postToNative({
        type: "native-ad-placement",
        id: placementId,
        top: 0,
        left: 0,
        width: 1,
        height: NATIVE_AD_SLOT_HEIGHT,
        visible: false,
      });
    };
  }, [location, nativePlacementEligible]);

  const eligible =
    pathAllowsWebAd(location) &&
    mayShowWebAd({
      configured: webAdsConfigured(),
      nativeShell,
      adsDisabled: preferences.data?.adPreferences?.adsDisabled ?? false,
      canDisableAds,
      consent,
      // Wait for the plan before showing anything: an ad shown to a Pro
      // account for the half-second before their plan resolves is exactly
      // the thing they are paying not to see.
      pending: signedIn && (plan.pending || preferences.isLoading),
    });

  useEffect(() => {
    if (!eligible || dismissed || loaded) return;
    let cancelled = false;
    void loadAdSense().then((ready) => {
      if (cancelled || !ready || !slot.current) return;
      try {
        (window.adsbygoogle = window.adsbygoogle ?? []).push({});
        setLoaded(true);
      } catch {
        // A duplicate push or a refused fill: leave the slot empty rather
        // than retrying into an error loop.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dismissed, eligible, loaded]);

  if (nativeShell) {
    if (!nativePlacementEligible) return null;
    return (
      <aside
        ref={nativeSlot}
        aria-label="Advertisement"
        data-testid="native-inline-ad-placeholder"
        data-native-ad-placement={`inline:${location}`}
        className={"my-4 w-full min-w-0 max-w-full " + (className ?? "")}
        style={{ height: NATIVE_AD_SLOT_HEIGHT }}
      >
        <span className="sr-only">Advertisement</span>
      </aside>
    );
  }

  if (!eligible || dismissed) return null;

  return (
    <aside
      // Labelled for both readers and assistive technology, as ad policy and
      // plain honesty both require.
      aria-label="Advertisement"
      data-testid="inline-ad"
      className={
        "my-4 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-card p-3 " +
        (className ?? "")
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Advertisement
        </span>
        <button
          type="button"
          // Closing this placement hides this one slot for this page view. It
          // deliberately does not turn advertising off everywhere: that is the
          // Disable ads setting, and it belongs to a paid plan.
          onClick={() => setDismissed(true)}
          aria-label="Close this advertisement"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <ins
        ref={slot}
        className="adsbygoogle block w-full"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT_ID ?? undefined}
        data-ad-slot={ADSENSE_INLINE_SLOT ?? undefined}
        data-ad-format="fluid"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
