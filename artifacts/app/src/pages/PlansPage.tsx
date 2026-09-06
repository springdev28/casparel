/**
 * @fileOverview Web screen role: renders the Plans Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
/**
 * /plans — the standalone plans and checkout page.
 *
 * Deliberately NOT inside the app shell: plans are an account decision, not a
 * workspace tab, so the page stands on its own with a minimal header, the way
 * the landing page does. The sidebar reaches it from the current-plan card.
 *
 * Plans are buyable from everywhere: in the mobile app through Apple/Google
 * billing, and here by card through RevenueCat Web Billing when the
 * deployment carries a Web Billing public key (see lib/webBilling.ts). Both
 * paths land on the same server webhook with the same entitlement ids, so one
 * purchase pipeline serves every store.
 *
 * Signed-out visitors see live prices through an anonymous RevenueCat
 * identity; pressing Subscribe sends them through sign-in with ?next=/plans and straight back
 * here. Without the key — or before the dashboard has offerings — the page
 * degrades to comparison plus buy-on-mobile instructions, never a broken
 * checkout.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  CreditCard,
  Check,
  Crown,
  Loader2,
  Mail,
  Smartphone,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMeQueryKey,
  getGetMyUsageQueryKey,
  useGetMe,
} from "@workspace/api-client-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import BrandIcon from "../components/BrandIcon";
import { brandHomePath } from "../lib/brand-navigation";
import { downloadTargets } from "../lib/downloads";
import { useSystemDark } from "../hooks/use-system-dark";
import { usePlan, type PlanTier } from "../lib/use-plan";
import {
  INSTITUTIONAL_PLAN,
  TIER_CARDS,
  type TierCard,
} from "../lib/plan-copy";
import { readSessionClaims } from "../lib/session";
import {
  fetchWebPackages,
  fetchWebSubscriptionState,
  loadWebBilling,
  purchaseWebPackage,
  webBillingConfigured,
  webPackageAction,
  webPackagesForRole,
  type WebPackageAction,
  type WebPlanContext,
  type WebPlanPackage,
  type WebSubscriptionState,
} from "../lib/webBilling";

const SALES_EMAIL = "support@casparel.com";
const ANDROID_APP_URL =
  downloadTargets.find((target) => target.id === "android")?.href ?? "/download";

type PlanView = "generic" | "institutional";

type CheckoutState =
  | { status: "unavailable" }
  | { status: "loading" }
  | {
      status: "ready";
      packages: WebPlanPackage[];
      subscription: WebSubscriptionState | null;
    }
  | { status: "error" };

/**
 * Load the card-checkout packages — for the signed-in account, or through an
 * anonymous identity so visitors still see prices. Everything here degrades
 * to "unavailable", which renders the buy-on-mobile instructions: a missing
 * key, a dashboard without offerings, or a network failure must never leave
 * the page worse than it was before card checkout existed.
 */
function useWebCheckout(userId: number | null, enabled: boolean) {
  const [state, setState] = useState<CheckoutState>({
    status: webBillingConfigured() ? "loading" : "unavailable",
  });

  useEffect(() => {
    if (!webBillingConfigured() || !enabled) {
      setState({ status: "unavailable" });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const purchases = await loadWebBilling(userId);
        if (!purchases) {
          if (!cancelled) setState({ status: "unavailable" });
          return;
        }
        const [packages, subscription] = await Promise.all([
          fetchWebPackages(purchases),
          userId != null
            ? fetchWebSubscriptionState(purchases).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const forRole = webPackagesForRole(packages, null);
        setState(
          forRole.length > 0
            ? { status: "ready", packages: forRole, subscription }
            : { status: "unavailable" },
        );
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);

  return state;
}

function buttonLabel(action: WebPackageAction, pkg: WebPlanPackage): string {
  if (action === "switch-tier") {
    return `Switch to ${pkg.tier === "pro" ? "Pro" : "Plus"} · ${pkg.price}`;
  }
  if (action === "switch-period") {
    return `Change billing period · ${pkg.price}`;
  }
  return pkg.period === "annual"
    ? `Subscribe yearly · ${pkg.price}`
    : pkg.period === "monthly"
      ? `Subscribe monthly · ${pkg.price}`
      : `Subscribe · ${pkg.price}`;
}

function TierColumn({
  card,
  isCurrent,
  highlight,
  packages,
  actionFor,
  busyPackageId,
  onBuy,
  mobilePurchaseHref,
}: {
  card: TierCard;
  isCurrent: boolean;
  highlight: boolean;
  /** Card-checkout packages selling this tier; empty when checkout is off. */
  packages: WebPlanPackage[];
  /** What the control on each package should do for this account. */
  actionFor: (pkg: WebPlanPackage) => WebPackageAction;
  busyPackageId: string | null;
  onBuy: (pkg: WebPlanPackage) => void;
  /** Store route used while card checkout is intentionally unavailable. */
  mobilePurchaseHref: string | null;
}) {
  const hasWebControl = packages.some(
    (pkg) =>
      actionFor(pkg) !== "hidden" && actionFor(pkg) !== "app-managed",
  );

  return (
    <Card
      className={
        highlight
          ? "border-primary/50 bg-primary/5"
          : isCurrent
            ? "border-primary/40"
            : undefined
      }
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          {card.name}
          {isCurrent ? (
            <span
              className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary-text"
              data-testid={`current-plan-${card.tier}`}
            >
              Current plan
            </span>
          ) : null}
        </CardTitle>
        {/* Reference prices in USD; live checkout buttons below show the
            store's localised price, which is the one actually charged. */}
        {card.price ? (
          <p className="text-sm text-muted-foreground">
            <span className="text-lg font-semibold text-foreground">
              {card.price.monthly}
            </span>{" "}
            / month
            <span className="block text-xs">
              or {card.price.annual} / year, save{" "}
              {card.price.annualSavingsPercent}%
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="text-lg font-semibold text-foreground">US$0</span>{" "}
            free forever
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Workspace
          </h3>
          <ul className="mt-1.5 space-y-1">
            {card.workspace.map((line) => (
              <li key={line} className="flex items-start gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary-text" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI allowances
          </h3>
          <ul className="mt-1.5 space-y-1">
            {card.ai.map((line) => (
              <li key={line} className="flex items-start gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary-text" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Also included
          </h3>
          <ul className="mt-1.5 space-y-1">
            {card.extras.map((line) => (
              <li key={line} className="flex items-start gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary-text" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
        {hasWebControl ? (
          <section className="space-y-2 border-t pt-3">
            {packages.map((pkg) => {
              const action = actionFor(pkg);
              if (action === "hidden" || action === "app-managed") return null;
              if (action === "current") {
                return (
                  <Button
                    key={pkg.id}
                    className="w-full gap-2"
                    variant="outline"
                    disabled
                    data-testid={`current-package-${pkg.id}`}
                  >
                    <Check className="size-4" />
                    {pkg.period === "annual"
                      ? "Your plan, billed yearly"
                      : "Your plan, billed monthly"}
                  </Button>
                );
              }
              return (
                <Button
                  key={pkg.id}
                  className="w-full min-w-0 gap-2"
                  variant={pkg.period === "annual" ? "default" : "outline"}
                  disabled={busyPackageId !== null}
                  onClick={() => onBuy(pkg)}
                  data-testid={`buy-${pkg.id}`}
                >
                  {busyPackageId === pkg.id ? (
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                  ) : (
                    <CreditCard className="size-4 shrink-0" />
                  )}
                  <span className="truncate">{buttonLabel(action, pkg)}</span>
                </Button>
              );
            })}
            <p className="text-[11px] text-muted-foreground">
              Card checkout, billed by RevenueCat. Renews automatically; cancel
              any time from Manage billing. Changing plan replaces your current
              subscription, so you are never billed for two at once.
            </p>
          </section>
        ) : card.tier !== "free" && mobilePurchaseHref ? (
          <section className="space-y-2 border-t pt-3">
            <Button className="w-full gap-2" asChild>
              <a
                href={mobilePurchaseHref}
                target="_blank"
                rel="noreferrer"
                data-testid={`android-subscribe-${card.tier}`}
              >
                <Smartphone className="size-4 shrink-0" />
                Subscribe in the Android app
              </a>
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Google Play checkout opens inside Casparel. Install or update the
              app, then choose this plan under Profile → Plan.
            </p>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function PlansPage() {
  const dark = useSystemDark();
  const [, setLocation] = useLocation();
  const isLoggedIn = Boolean(readSessionClaims());
  const plan = usePlan(isLoggedIn);
  const { data: me } = useGetMe({
    query: { enabled: isLoggedIn, queryKey: getGetMeQueryKey() },
  });
  const queryClient = useQueryClient();
  const isAdmin = plan.tier === "administrator";

  const [audience, setAudience] = useState<PlanView>("generic");
  const cards = audience === "institutional" ? [] : TIER_CARDS[audience];

  const checkout = useWebCheckout(
    isLoggedIn && !isAdmin ? (me?.id ?? null) : null,
    !isAdmin,
  );
  const subscription =
    checkout.status === "ready" ? checkout.subscription : null;
  const planContext: WebPlanContext = {
    signedIn: isLoggedIn,
    isAdmin,
    pending: plan.pending,
    currentLevel: plan.level,
    institutional: plan.tier === "institutional",
    subscription,
  };
  const appManaged =
    isLoggedIn &&
    !isAdmin &&
    !plan.pending &&
    plan.level !== "free" &&
    plan.tier !== "institutional" &&
    (subscription === null || subscription.entitlementStore === "app-store");
  const [busyPackageId, setBusyPackageId] = useState<string | null>(null);
  const [purchaseNote, setPurchaseNote] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const handleBuy = useCallback(
    async (pkg: WebPlanPackage) => {
      // Buying needs an account: the purchase must attach to a Casparel user.
      // Sign-in (or registration) bounces straight back to this page.
      if (!isLoggedIn) {
        setLocation("/auth/login?next=/plans");
        return;
      }
      if (checkout.status !== "ready") return;
      setBusyPackageId(pkg.id);
      setPurchaseNote(null);
      const purchases = me?.id != null ? await loadWebBilling(me.id) : null;
      const outcome = purchases
        ? await purchaseWebPackage(purchases, pkg)
        : "error";
      setBusyPackageId(null);
      if (outcome === "success") {
        setPurchaseNote({
          kind: "success",
          text: "Payment complete. Your plan activates on your account within a few seconds.",
        });
        // The entitlement is granted by the server when RevenueCat's webhook
        // arrives, not by this client — refetch now and again shortly after.
        void queryClient.invalidateQueries({
          queryKey: getGetMyUsageQueryKey(),
        });
        setTimeout(() => {
          void queryClient.invalidateQueries({
            queryKey: getGetMyUsageQueryKey(),
          });
        }, 5000);
      } else if (outcome === "error") {
        setPurchaseNote({
          kind: "error",
          text: "The purchase could not be completed. You have not been charged twice; try again or use the mobile app.",
        });
      }
    },
    [isLoggedIn, setLocation, checkout.status, me?.id, queryClient],
  );

  return (
    <div
      className={`${dark ? "dark " : ""}min-h-[100dvh] bg-background text-foreground`}
      style={{ colorScheme: dark ? "dark" : "light" }}
    >
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4">
          <Link
            href={brandHomePath(false)}
            className="flex min-w-0 items-center text-primary-text"
            aria-label="Casparel home"
            data-testid="plans-brand-home"
          >
            <BrandIcon className="mr-1.5 h-7 w-7 shrink-0 sm:mr-2 sm:h-8 sm:w-8" />
            <span className="text-base font-bold tracking-tight text-foreground sm:text-lg">
              Casparel
            </span>
          </Link>
          <nav className="flex min-w-0 shrink items-center gap-1 sm:shrink-0 sm:gap-2">
            {isLoggedIn ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">
                  {/* Two whole strings, not one split around a breakpoint:
                      the translation bridge matches complete sentences. */}
                  <span className="sm:hidden">Dashboard</span>
                  <span className="hidden sm:inline">
                    Back to your dashboard
                  </span>
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/auth/login?next=/plans">Sign in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/auth/register?next=/plans">Create account</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex items-start gap-3">
          <Crown className="mt-1 size-6 shrink-0 text-primary-text" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Casparel plans
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {audience === "institutional"
                ? "Institutional licensing gives schools and academies one annual, per-seat plan for teachers and students, with priority support."
                : "Plus and Pro fit any account: the same subscription, products, and allowances apply whether your role is student or teacher."}
            </p>
            {isLoggedIn && !isAdmin ? (
              /*
               * Two whole sentences, not one sentence with a name in the
               * middle of it.
               *
               * This read "You are on <b>Free</b>. Your live usage and
               * allowances are in Settings → Plan." -- which JSX splits into
               * "You are on", the plan name, ". Your live usage and allowances
               * are in", a link, and a full stop. The bridge matches whole
               * strings, so a sentence broken around an interpolation can
               * never be translated, and no word order but English survives it
               * anyway: Turkish puts the plan name first.
               */
              <p className="mt-1 text-sm text-muted-foreground">
                <span>Your current plan:</span>{" "}
                <b translate="no" className="text-foreground">
                  {plan.label}
                </b>
                {" · "}
                <Link
                  href="/settings"
                  className="text-primary-text hover:underline"
                >
                  See your live usage and allowances
                </Link>
              </p>
            ) : null}
            {isAdmin ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Administrator accounts are uncapped and never need a plan; use
                the sections below to review Plus, Pro, and Institutional.
              </p>
            ) : null}
          </div>
        </div>

        <div
          className="mt-5 inline-flex flex-wrap rounded-lg border border-border p-1"
          role="group"
          aria-label="Choose which plans to view"
        >
          {(["generic", "institutional"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={audience === tab}
              onClick={() => setAudience(tab)}
              data-testid={`plans-tab-${tab}`}
              className={
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors " +
                (audience === tab
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {/*
                  "For schools", not "Institutional". The other three tabs
                  name an audience; this one named the plan, so beside three
                  translated phrases it sat there in English -- and the
                  translation audit could not say so, because "Institutional"
                  is a product name it is told to leave alone. The card below
                  still carries the plan's name.
                */}
              {tab === "generic" ? "For everyone" : "For schools"}
            </button>
          ))}
        </div>

        {isAdmin && !webBillingConfigured() ? (
          /* Administrators get the exact missing configuration, users never
             do: a visitor cannot act on a variable name, an admin can. */
          <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-foreground">
            <b>Administrator note:</b> web card checkout is disabled because{" "}
            <code>VITE_REVENUECAT_WEB_API_KEY</code> is not set in the frontend
            build environment (GitHub → Settings → Secrets and variables →
            Actions → Variables, read by deploy-frontend.yml). Set it to the
            RevenueCat Web Billing public key (<code>rcb_…</code>) for the app
            whose <code>default</code> offering carries the four
            casparel_plus/pro packages, then redeploy.
          </p>
        ) : null}
        {isAdmin && webBillingConfigured() && checkout.status === "error" ? (
          <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-foreground">
            <b>Administrator note:</b> the RevenueCat Web Billing SDK failed to
            load offerings. Check that the <code>default</code> offering exists
            with the casparel_plus/pro packages and that the key in{" "}
            <code>VITE_REVENUECAT_WEB_API_KEY</code> belongs to this project.
          </p>
        ) : null}
        {purchaseNote ? (
          <p
            role="status"
            className={
              "mt-4 rounded-lg border p-3 text-sm " +
              (purchaseNote.kind === "success"
                ? "border-primary/40 bg-primary/5 text-foreground"
                : "border-destructive/40 bg-destructive/5 text-destructive-text")
            }
          >
            {purchaseNote.text}
          </p>
        ) : null}

        {audience === "institutional" ? (
          <Card
            className={
              "mt-6 " +
              (isLoggedIn && plan.tier === "institutional"
                ? "border-primary/50 bg-primary/5"
                : "")
            }
          >
            <CardHeader className="pb-2">
              {/* A real h2, not CardTitle's div: the audit checks heading order. */}
              <h2 className="flex items-center justify-between gap-2 text-base font-semibold leading-none tracking-tight">
                <span className="flex items-center gap-2">
                  <Building2 className="size-4 text-primary-text" />
                  {INSTITUTIONAL_PLAN.name}, for schools and academies
                </span>
                {isLoggedIn && plan.tier === "institutional" ? (
                  <span
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary-text"
                    data-testid="current-plan-institutional"
                  >
                    Current plan
                  </span>
                ) : null}
              </h2>
              <p className="text-sm text-muted-foreground">
                <span className="text-lg font-semibold text-foreground">
                  {INSTITUTIONAL_PLAN.priceLine}
                </span>
                <span className="block text-xs">
                  {INSTITUTIONAL_PLAN.priceNote}
                </span>
              </p>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                {INSTITUTIONAL_PLAN.blurb}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Workspace, per seat
                  </h3>
                  <ul className="mt-1.5 space-y-1">
                    {INSTITUTIONAL_PLAN.workspace.map((line) => (
                      <li key={line} className="flex items-start gap-1.5">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-primary-text" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    AI allowances, per seat
                  </h3>
                  <ul className="mt-1.5 space-y-1">
                    {INSTITUTIONAL_PLAN.ai.map((line) => (
                      <li key={line} className="flex items-start gap-1.5">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-primary-text" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Also included
                  </h3>
                  <ul className="mt-1.5 space-y-1">
                    {INSTITUTIONAL_PLAN.extras.map((line) => (
                      <li key={line} className="flex items-start gap-1.5">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-primary-text" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                <Button asChild>
                  <a
                    href={`mailto:${SALES_EMAIL}?subject=Casparel%20Institutional%20licence`}
                  >
                    <Mail className="size-4" />
                    Contact us for a quote
                  </a>
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Tell us roughly how many teacher and student seats you need —
                  we reply from {SALES_EMAIL} and activate seats on your
                  existing accounts, so nobody re-registers.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <h2 className="mt-6 text-lg font-semibold">Compare plans</h2>
            {appManaged ? (
              <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                Your subscription is billed by Google Play or the App Store, so
                plan changes and cancellation happen there: open the Casparel
                app and go to Plans, or use your store&apos;s subscription
                settings.
              </p>
            ) : null}
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              {cards.map((card, index) => (
                <TierColumn
                  key={card.tier}
                  card={card}
                  isCurrent={isLoggedIn && plan.tier === card.tier}
                  highlight={index === 2}
                  packages={
                    checkout.status === "ready"
                      ? checkout.packages.filter(
                          (pkg) => pkg.tier === card.tier,
                        )
                      : []
                  }
                  actionFor={(pkg) => webPackageAction(pkg, planContext)}
                  busyPackageId={busyPackageId}
                  onBuy={handleBuy}
                  mobilePurchaseHref={
                    !isAdmin && checkout.status !== "loading"
                      ? ANDROID_APP_URL
                      : null
                  }
                />
              ))}
            </div>
          </>
        )}

        <Card className="mt-6">
          <CardHeader className="pb-2">
            <h2 className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
              <Smartphone className="size-4 text-primary-text" />
              How upgrading works
            </h2>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {checkout.status === "ready" ? (
              <p>
                Subscribe right here with a card. Checkout is handled by
                RevenueCat{!isLoggedIn ? " after you sign in" : ""}. Or use the
                Casparel mobile app billed by Apple or Google (
                <b className="text-foreground">Profile → Plan</b>). Either way
                the subscription attaches to your Casparel account and works on
                every device the moment the purchase completes.
              </p>
            ) : (
              <p>
                Subscriptions are purchased in the Casparel mobile app and
                billed by Apple or Google: open the app on your phone, go to{" "}
                <b className="text-foreground">Profile → Plan</b>, and choose
                your plan.
                {webBillingConfigured()
                  ? " Card checkout on the web is temporarily unavailable; please try again shortly."
                  : " Card checkout on the web is not configured on this deployment."}{" "}
                Your subscription follows your Casparel account, so it works
                here on the web the moment the purchase completes.
              </p>
            )}
            {subscription?.manageUrl && isLoggedIn && plan.level !== "free" ? (
              <p>
                <a
                  href={subscription.manageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-text hover:underline"
                >
                  Manage billing
                </a>{" "}
                covers invoices, card details and cancellation for a
                subscription bought on the web.
              </p>
            ) : null}
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Plus and Pro work the same on every account role: student and
                teacher buy the same products. The Institutional licence covers
                whole schools, staff and students alike, and is arranged by
                email rather than checkout.
              </li>
              <li>
                Prices on this page are USD reference prices; the checkout
                button and the app stores show your local currency, which is the
                amount actually charged.
              </li>
              <li>
                Every allowance on every plan is finite; no subscription is
                unlimited. What you see on this page is exactly what is
                enforced.
              </li>
              <li>
                If a subscription ends, nothing you created is deleted or
                hidden. You keep everything and simply cannot add more of a kind
                you are over the limit on until there is room again.
              </li>
              <li>
                Cancelling, in the App Store or Google Play for phone purchases,
                or from Manage billing for card purchases, stops the next
                renewal; it does not refund the period already paid. See the{" "}
                <Link
                  href="/terms"
                  className="text-primary-text hover:underline"
                >
                  Terms
                </Link>{" "}
                for the full wording.
              </li>
            </ul>
          </CardContent>
        </Card>

        {!isLoggedIn ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href="/auth/register?next=/plans">
                Create your free account
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/auth/login?next=/plans">Sign in</Link>
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
