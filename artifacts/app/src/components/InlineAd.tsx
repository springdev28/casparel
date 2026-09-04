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
import {
  readAdConsent,
  subscribeToAdConsent,
} from "../lib/ad-consent";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
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
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
