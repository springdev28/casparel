/**
 * /plans — the web paywall, including card checkout.
 *
 * Plans are buyable from everywhere: in the mobile app through Apple/Google
 * billing, and here by card through RevenueCat Web Billing when the
 * deployment carries a Web Billing public key (see lib/webBilling.ts). Both
 * paths land on the same server webhook with the same entitlement ids, so
 * one purchase pipeline serves every store. Without the key — or before the
 * dashboard has offerings — the page degrades to role-aware comparison plus
 * buy-on-mobile instructions, never a broken checkout.
 *
 * Signed-out visitors get the generic cards and a create-account CTA; the
 * page renders inside PublicShell for them and inside the AppShell sidebar
 * for signed-in users (see PublicRoute in App.tsx).
 */
import { useCallback, useEffect, useState } from "react";
import { CreditCard, Check, Crown, Loader2, Smartphone } from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMeQueryKey,
  getGetMyUsageQueryKey,
  useGetMe,
} from "@workspace/api-client-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/edu-ds/components/ui/card";
import { usePlan, type PlanTier } from "../lib/use-plan";
import { audienceForRole, TIER_CARDS, type TierCard } from "../lib/plan-copy";
import { readSessionClaims } from "../lib/session";
import {
  fetchWebPackages,
  loadWebBilling,
  managementUrl,
  purchaseWebPackage,
  webBillingConfigured,
  webPackagesForRole,
  type WebPlanPackage,
} from "../lib/webBilling";

const LEVEL_RANK: Record<"free" | "plus" | "pro", number> = {
  free: 0,
  plus: 1,
  pro: 2,
};

function levelOfTier(tier: PlanTier): "free" | "plus" | "pro" {
  if (tier === "free") return "free";
  if (tier === "plus" || tier === "student-plus" || tier === "teacher-plus")
    return "plus";
  return "pro";
}

type CheckoutState =
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "ready"; packages: WebPlanPackage[]; manageUrl: string | null }
  | { status: "error" };

/**
 * Load the card-checkout packages for the signed-in account. Everything here
 * degrades to "unavailable", which renders the buy-on-mobile instructions —
 * a missing key, a dashboard without offerings, or a network failure must
 * never leave the page worse than it was before card checkout existed.
 */
function useWebCheckout(userId: number | undefined, role: "student" | "teacher" | null) {
  const [state, setState] = useState<CheckoutState>({
    status: webBillingConfigured() ? "loading" : "unavailable",
  });

  useEffect(() => {
    if (!webBillingConfigured() || userId == null) {
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
        const [packages, manageUrl] = await Promise.all([
          fetchWebPackages(purchases),
          managementUrl(purchases),
        ]);
        if (cancelled) return;
        const forRole = webPackagesForRole(packages, role);
        setState(
          forRole.length > 0
            ? { status: "ready", packages: forRole, manageUrl }
            : { status: "unavailable" },
        );
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, role]);

  return state;
}

function TierColumn({
  card,
  isCurrent,
  highlight,
  packages,
  buyable,
  busyPackageId,
  onBuy,
}: {
  card: TierCard;
  isCurrent: boolean;
  highlight: boolean;
  /** Card-checkout packages selling this tier; empty when checkout is off. */
  packages: WebPlanPackage[];
  /** False when this tier is not an upgrade for the account. */
  buyable: boolean;
  busyPackageId: string | null;
  onBuy: (pkg: WebPlanPackage) => void;
}) {
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
        {buyable && packages.length > 0 ? (
          <section className="space-y-2 border-t pt-3">
            {packages.map((pkg) => (
              <Button
                key={pkg.id}
                className="w-full gap-2"
                variant={pkg.period === "annual" ? "default" : "outline"}
                disabled={busyPackageId !== null}
                onClick={() => onBuy(pkg)}
              >
                {busyPackageId === pkg.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CreditCard className="size-4" />
                )}
                {pkg.period === "annual"
                  ? `Subscribe yearly · ${pkg.price}`
                  : pkg.period === "monthly"
                    ? `Subscribe monthly · ${pkg.price}`
                    : `Subscribe · ${pkg.price}`}
              </Button>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Card checkout, billed by RevenueCat. Renews automatically; cancel
              any time from Manage billing.
            </p>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function PlansPage() {
  const isLoggedIn = Boolean(readSessionClaims());
  const plan = usePlan(isLoggedIn);
  const { data: me } = useGetMe({
    query: { enabled: isLoggedIn, queryKey: getGetMeQueryKey() },
  });
  const queryClient = useQueryClient();
  const audience = isLoggedIn ? audienceForRole(plan.accountRole) : "generic";
  const cards = TIER_CARDS[audience];
  const isAdmin = plan.tier === "administrator";

  const checkout = useWebCheckout(
    isLoggedIn && !isAdmin ? me?.id : undefined,
    plan.accountRole === "admin" ? null : plan.accountRole,
  );
  const [busyPackageId, setBusyPackageId] = useState<string | null>(null);
  const [purchaseNote, setPurchaseNote] = useState<
    { kind: "success" | "error"; text: string } | null
  >(null);

  const handleBuy = useCallback(
    async (pkg: WebPlanPackage) => {
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
        void queryClient.invalidateQueries({ queryKey: getGetMyUsageQueryKey() });
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
    [checkout.status, me?.id, queryClient],
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex items-start gap-3">
        <Crown className="mt-1 size-6 shrink-0 text-primary-text" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Casparel plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {audience === "teacher"
              ? "Teacher plans grow your classroom: more classes, bigger rosters, and the explainable seating planner on Teacher Pro."
              : audience === "student"
                ? "Student plans grow your study space: more activities, goals, lists and canvases, and larger AI research allowances."
                : "Plans grow your workspace and your AI research allowances. Student and teacher accounts see plans specialised for their role."}
          </p>
          {isLoggedIn && !isAdmin ? (
            <p className="mt-1 text-sm text-muted-foreground">
              You are on <b className="text-foreground">{plan.label}</b>. Your
              live usage and allowances are in{" "}
              <Link href="/settings" className="text-primary-text hover:underline">
                Settings → Plan
              </Link>
              .
            </p>
          ) : null}
          {isAdmin ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Administrator accounts are uncapped and never need a plan; this
              page shows what other accounts are offered.
            </p>
          ) : null}
        </div>
      </div>

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

      <h2 className="mt-6 text-lg font-semibold">Compare plans</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {cards.map((card, index) => (
          <TierColumn
            key={card.tier}
            card={card}
            isCurrent={isLoggedIn && plan.tier === card.tier}
            highlight={index === 2}
            packages={
              checkout.status === "ready"
                ? checkout.packages.filter((pkg) => pkg.tier === card.tier)
                : []
            }
            buyable={
              isLoggedIn &&
              !isAdmin &&
              !plan.pending &&
              LEVEL_RANK[levelOfTier(card.tier)] > LEVEL_RANK[plan.level]
            }
            busyPackageId={busyPackageId}
            onBuy={handleBuy}
          />
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          {/* A real h2, not CardTitle's div: the audit checks heading order. */}
          <h2 className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
            <Smartphone className="size-4 text-primary-text" />
            How upgrading works
          </h2>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {checkout.status === "ready" ? (
            <p>
              Subscribe right here with a card — checkout is handled by
              RevenueCat — or in the Casparel mobile app billed by Apple or
              Google (<b className="text-foreground">Profile → Plan</b>).
              Either way the subscription attaches to your Casparel account
              and works on every device the moment the purchase completes.
            </p>
          ) : (
            <p>
              Subscriptions are purchased in the Casparel mobile app and billed
              by Apple or Google: open the app on your phone, go to{" "}
              <b className="text-foreground">Profile → Plan</b>, and choose
              your plan.
              {webBillingConfigured()
                ? " Card checkout on the web is temporarily unavailable; please try again shortly."
                : " Card checkout on the web is coming and will appear on this page."}{" "}
              Your subscription follows your Casparel account, so it works here
              on the web the moment the purchase completes.
            </p>
          )}
          {checkout.status === "ready" && checkout.manageUrl && plan.level !== "free" ? (
            <p>
              <a
                href={checkout.manageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary-text hover:underline"
              >
                Manage billing
              </a>{" "}
              — invoices, card details and cancellation for a subscription
              bought on the web.
            </p>
          ) : null}
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Plans match your account role: a student plan does nothing on a
              teacher account and the other way round, and the app only offers
              plans for your role.
            </li>
            <li>
              Every allowance on every plan is finite; no subscription is
              unlimited. What you see on this page is exactly what is enforced.
            </li>
            <li>
              If a subscription ends, nothing you created is deleted or hidden.
              You keep everything and simply cannot add more of a kind you are
              over the limit on until there is room again.
            </li>
            <li>
              Cancelling — in the App Store or Google Play for phone purchases,
              or from Manage billing for card purchases — stops the next
              renewal; it does not refund the period already paid. See the{" "}
              <Link href="/terms" className="text-primary-text hover:underline">
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
            <Link href="/auth/register">Create your free account</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </div>
      ) : null}
    </main>
  );
}
