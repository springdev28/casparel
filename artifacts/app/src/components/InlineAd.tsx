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
  ADSENSE_INLINE_FORMAT,
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
    casparelNativeAdReadiness?: boolean;
    casparelNativeAdClipping?: boolean;
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

  const nativeSlot = useRef<HTMLElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const [nativeEligible, setNativeEligible] = useState(nativeAdsEligible);
  const [nativeClippingSupported, setNativeClippingSupported] = useState(() => window.casparelNativeAdClipping === true);
  const [nativeHeight, setNativeHeight] = useState(NATIVE_AD_SLOT_HEIGHT);
  const [nativeCreativeReady, setNativeCreativeReady] = useState(false);
  const [nativeReadinessSupported, setNativeReadinessSupported] = useState(() => window.casparelNativeAdReadiness === true);
  // Older installed builds do not publish creative readiness. Keep their
  // existing placement contract until the native update is installed.
  const nativeSlotReady = !nativeReadinessSupported || nativeCreativeReady;

  useEffect(() => {
    const update = () => {
      setNativeReadinessSupported(window.casparelNativeAdReadiness === true);
      setNativeClippingSupported(window.casparelNativeAdClipping === true);
    };
    window.addEventListener('casparel-native-ad-support', update);
    return () => window.removeEventListener('casparel-native-ad-support', update);
  }, []);

  useEffect(() => {
    setNativeCreativeReady(false);
    const update = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== 'object' || !('id' in detail) || !('ready' in detail)) return;
      if (detail.id === `inline:${location}` && typeof detail.ready === 'boolean') {
        setNativeCreativeReady(detail.ready);
      }
      if (detail.id === `inline:${location}` && "height" in detail && typeof detail.height === "number" && detail.height >= 48 && detail.height <= 800) {
        setNativeHeight(detail.height);
      }
    };
    window.addEventListener('casparel-native-ad-ready', update);
    return () => window.removeEventListener('casparel-native-ad-ready', update);
  }, [location]);

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
        const main = element.closest('main');
        const toolbar = main?.querySelector('[data-native-ad-boundary]')?.getBoundingClientRect();
        const header = document.querySelector('[data-native-ad-header]')?.getBoundingClientRect();
        const safeTop = Math.max(toolbar?.bottom ?? NATIVE_AD_SAFE_TOP, header?.bottom ?? 0);
        const clipTop = Math.max(0, Math.min(nativeHeight, safeTop - rect.top));
        const clipBottom = Math.max(0, Math.min(nativeHeight - clipTop, rect.top + nativeHeight - window.innerHeight));
        const blocked = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"], [data-radix-popper-content-wrapper]'))
          .some(node => node instanceof HTMLElement && node.getBoundingClientRect().height > 0 && getComputedStyle(node).visibility !== 'hidden');
        const visible = nativeSlotReady && !document.hidden && !blocked && clipTop + clipBottom < nativeHeight && (nativeClippingSupported || clipTop + clipBottom === 0);
        postToNative({
          type: "native-ad-placement",
          id: placementId,
          top: rect.top,
          left: rect.left,
          width: rect.width,
          // Keep a valid offscreen loading surface without reserving a blank
          // card in the page. Native reports when a real creative is ready.
          height: nativeHeight,
          clipTop,
          clipBottom,
          visible,
        });
      });
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(publish);
    observer?.observe(nativeSlot.current);
    // Native views cannot participate in DOM z-index. Remove their visible
    // surface while a sidebar, menu or dialog covers the web content.
    const overlays = new MutationObserver(publish);
    overlays.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state', 'aria-hidden', 'style'] });
    window.addEventListener('visibilitychange', publish);
    window.addEventListener("scroll", publish, true);
    window.addEventListener("resize", publish);
    publish();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      overlays.disconnect();
      window.removeEventListener("visibilitychange", publish);
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
  }, [location, nativePlacementEligible, nativeSlotReady, nativeHeight, nativeClippingSupported]);

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
      pending: signedIn && (plan.pending || !me || !preferences.data || preferences.isError),
    });

  if (nativeShell) {
    if (!nativePlacementEligible) return null;
    return (
      <aside
        ref={nativeSlot}
        aria-label={nativeSlotReady ? "Advertisement" : undefined}
        aria-hidden={!nativeSlotReady}
        data-testid="native-inline-ad-placeholder"
        data-native-ad-placement={`inline:${location}`}
        className={"w-full min-w-0 max-w-full " + (className ?? "")}
        style={{ height: nativeSlotReady ? nativeHeight : 0, marginBlock: nativeSlotReady ? 16 : 0 }}
      >
        <span className="sr-only">Advertisement</span>
      </aside>
    );
  }

  return eligible ? <AdSlot key={location} className={className} /> : null;
}

/** One SDK push per DOM slot; eligibility changes unmount the slot completely. */
function AdSlot({ className }: { className?: string }) {
  const [cycle, setCycle] = useState(0);
  return <AdSenseCreative key={cycle} className={className} onNext={() => setCycle(value => value + 1)} />;
}

function AdSenseCreative({ className, onNext }: { className?: string; onNext: () => void }) {
  const slot = useRef<HTMLModElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (failed) return;
    let cancelled = false;
    void loadAdSense().then((ready) => {
      if (cancelled || !slot.current) return;
      if (!ready) { setFailed(true); return; }
      if (slot.current.dataset.casparelRequested) return;
      try {
        (window.adsbygoogle = window.adsbygoogle ?? []).push({});
        slot.current.dataset.casparelRequested = "true";
      } catch {
        setFailed(true);
      }
    });
    const observer = new MutationObserver(() => {
      if (slot.current?.dataset.adStatus === "unfilled") setFailed(true);
    });
    if (slot.current) observer.observe(slot.current, { attributes: true, attributeFilter: ["data-ad-status"] });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [failed]);

  if (failed) return null;

  return (
    <aside
      // Labelled for both readers and assistive technology, as ad policy and
      // plain honesty both require.
      aria-label="Advertisement"
      data-testid="inline-ad"
      className={
        "mx-auto my-3 w-full min-w-0 max-w-3xl overflow-hidden rounded-lg border border-border bg-card p-2 " +
        (className ?? "")
      }
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Advertisement
        </span>
        <button
          type="button"
          // AdSense refreshes only on an explicit user request, never on a timer.
          onClick={onNext}
          aria-label="Close this ad and show the next"
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
        data-ad-format={ADSENSE_INLINE_FORMAT}
        data-full-width-responsive="false"
      />
    </aside>
  );
}
