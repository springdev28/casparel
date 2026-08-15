import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { Check, Crown, Sparkles } from "lucide-react";
import { usePlan } from "@/lib/use-plan";

function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const unlimited = limit == null;
  const pct = !unlimited && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const included = unlimited || limit > 0;
  const nearLimit = !unlimited && included && used >= limit;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={
            nearLimit ? "font-medium text-destructive-text" : "text-muted-foreground"
          }
        >
          {unlimited
            ? "Unlimited"
            : included
              ? `${used} / ${limit} today`
              : "Not included"}
        </span>
      </div>
      {!unlimited && included ? (
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
          <div
            className={
              "h-full rounded " + (nearLimit ? "bg-destructive" : "bg-primary")
            }
            style={{ width: pct + "%" }}
          />
        </div>
      ) : null}
    </div>
  );
}

function useUpgradePrompt() {
  return function handleUpgrade() {
    toast({
      title: "Upgrade in the Casparel mobile app",
      description:
        "Subscriptions are purchased in the Casparel mobile app. Open Profile then Plan to choose Plus or Pro.",
    });
  };
}

/** Shared body: usage meters + upgrade CTA, or the unlocked confirmation. */
function PlanDetails({ compact = false }: { compact?: boolean }) {
  const plan = usePlan();
  const handleUpgrade = useUpgradePrompt();

  return (
    <>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {plan.aiEnabled ? <Check className="size-4 text-primary-text" /> : null}
        {plan.unlimited
          ? "Unlimited account-level AI research and discovery is unlocked."
          : plan.tier === "plus"
            ? "AI discovery and deep research are active with plan allowances."
            : "Free includes core learning tools, with no AI features."}
      </p>
      <div className={"mt-3 grid gap-2.5" + (compact ? "" : " max-w-sm")}>
        <UsageMeter
          label="AI source research"
          used={plan.deepResearch.used}
          limit={plan.deepResearch.limit}
        />
        <UsageMeter
          label="AI discovery"
          used={plan.aiSearch.used}
          limit={plan.aiSearch.limit}
        />
      </div>
      {!compact ? (
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <b>Free</b>
            <p className="mt-1 text-muted-foreground">Library, classes, schedules, citations, and manual seating. No AI.</p>
          </div>
          <div className="rounded-lg border border-primary/30 p-3">
            <b>Plus</b>
            <p className="mt-1 text-muted-foreground">AI discovery and cited deep research with allowances.</p>
          </div>
          <div className="rounded-lg border border-primary/50 bg-primary/5 p-3">
            <b>Pro</b>
            <p className="mt-1 text-muted-foreground">Unlimited AI plus explainable seating-plan suggestions.</p>
          </div>
        </div>
      ) : null}
      {compact ? (
        plan.tier === "free" || plan.tier === "plus" ? (
          <Button onClick={handleUpgrade} className="mt-4 w-full gap-2">
            <Sparkles className="size-4" />
            {plan.tier === "plus" ? "Upgrade to Pro" : "See Plus and Pro"}
          </Button>
        ) : null
      ) : null}
    </>
  );
}

function PlanBadge() {
  const plan = usePlan();
  return (
    <span
      className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary-text"
      data-testid="plan-badge"
    >
      {plan.label}
    </span>
  );
}

/**
 * Plan / subscription row for the web Settings page. Shows the current plan
 * and AI usage from /users/me/usage.
 * Purchases happen in the mobile app (RevenueCat IAP), so the web surfaces
 * status and directs users there to upgrade.
 */
export function PlanSection() {
  const plan = usePlan();
  const handleUpgrade = useUpgradePrompt();

  return (
    <section className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
      <div className="flex min-w-0 gap-3">
        <Crown className="mt-0.5 size-5 shrink-0 text-primary-text" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Plan</h2>
            <PlanBadge />
          </div>
          <PlanDetails />
        </div>
      </div>

      {plan.tier === "free" || plan.tier === "plus" ? (
        <Button onClick={handleUpgrade} className="gap-2">
          <Sparkles className="size-4" />
          {plan.tier === "plus" ? "Upgrade to Pro" : "See plans"}
        </Button>
      ) : null}
    </section>
  );
}

/**
 * Card-shaped variant of the same plan surface, for the Profile page, so the
 * plan lives in the same place on web as it does on mobile (Profile then Plan).
 */
export function PlanCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Crown size={16} className="text-primary-text" />
          Plan
          <PlanBadge />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <PlanDetails compact />
      </CardContent>
    </Card>
  );
}
