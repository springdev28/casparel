/**
 * /plans — the web paywall.
 *
 * The web cannot take the payment itself: subscriptions are bought in the
 * mobile app through Apple or Google billing, and the store builds are not
 * published yet. What this page therefore must do is everything except the
 * charge — show the plans for *this* account's role, mark the one the account
 * is on, and say plainly how buying works — so every "upgrade" affordance in
 * the product has somewhere real to land instead of a toast.
 *
 * Signed-out visitors get the generic cards and a create-account CTA; the
 * page renders inside PublicShell for them and inside the AppShell sidebar
 * for signed-in users (see PublicRoute in App.tsx).
 */
import { Check, Crown, Smartphone } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/edu-ds/components/ui/card";
import { usePlan } from "../lib/use-plan";
import { audienceForRole, TIER_CARDS, type TierCard } from "../lib/plan-copy";
import { readSessionClaims } from "../lib/session";

function TierColumn({
  card,
  isCurrent,
  highlight,
}: {
  card: TierCard;
  isCurrent: boolean;
  highlight: boolean;
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
      </CardContent>
    </Card>
  );
}

export default function PlansPage() {
  const isLoggedIn = Boolean(readSessionClaims());
  const plan = usePlan(isLoggedIn);
  const audience = isLoggedIn ? audienceForRole(plan.accountRole) : "generic";
  const cards = TIER_CARDS[audience];
  const isAdmin = plan.tier === "administrator";

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

      <h2 className="mt-6 text-lg font-semibold">Compare plans</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {cards.map((card, index) => (
          <TierColumn
            key={card.tier}
            card={card}
            isCurrent={isLoggedIn && plan.tier === card.tier}
            highlight={index === 2}
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
          <p>
            Subscriptions are purchased in the Casparel mobile app and billed
            by Apple or Google: open the app on your phone, go to{" "}
            <b className="text-foreground">Profile → Plan</b>, and choose your
            plan. Your subscription follows your Casparel account, so it works
            here on the web the moment the purchase completes.
          </p>
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
              Cancelling in the App Store or Google Play stops the next
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
