/**
 * @fileOverview Web UI role: asks once whether advertising is allowed, and remembers the answer.
 * System connection: writes lib/ad-consent, which every ad slot reads; renders
 * nothing at all on a deployment with no advertising configured.
 */
import { useSyncExternalStore } from "react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Link } from "wouter";
import {
  consentRequiredHere,
  readAdConsent,
  subscribeToAdConsent,
  writeAdConsent,
} from "../lib/ad-consent";
import { webAdsConfigured } from "../lib/webAds";

/**
 * The one place a visitor can say no to advertising.
 *
 * Shown only when this deployment actually serves ads and the visitor has not
 * answered yet. Declining is a single click, exactly as prominent as
 * accepting: a banner where "no" is harder to find than "yes" is not consent.
 */
export function AdConsentBanner() {
  const consent = useSyncExternalStore(
    subscribeToAdConsent,
    readAdConsent,
    () => "unknown" as const,
  );

  if (!webAdsConfigured()) return null;
  if (consent !== "unknown") return null;
  if (!consentRequiredHere()) return null;

  return (
    <div
      role="dialog"
      aria-label="Advertising choices"
      data-testid="ad-consent-banner"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-background/95 p-4 backdrop-blur"
    >
      <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 text-sm text-muted-foreground">
          Casparel shows a small number of ads to keep the library free. May we
          show them on this device?{" "}
          <Link href="/privacy" className="text-primary-text hover:underline">
            How we handle your data
          </Link>
        </p>
        <div className="flex w-full shrink-0 gap-2 sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => writeAdConsent("denied")}
          >
            No thanks
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            onClick={() => writeAdConsent("granted")}
          >
            Allow ads
          </Button>
        </div>
      </div>
    </div>
  );
}
