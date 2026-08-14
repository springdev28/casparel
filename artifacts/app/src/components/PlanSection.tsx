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
  const nearLimit = !unlimited && used >= limit;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span
          className={
            nearLimit ? "font-medium text-destructive-text" : "text-muted-foreground"
          }
        >
          {unlimited ? "Unlimited" : `${used} / ${limit} today`}
        </span>
      </div>
      {!unlimited ? (
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
        "Premium is purchased in the app. Sign in with the same account, then open Profile then Plan to unlock unlimited AI.",
    });
  };
}

/** Shared body: usage meters + upgrade CTA, or the unlocked confirmation. */
function PlanDetails({ compact = false }: { compact?: boolean }) {
  const plan = usePlan();
  const handleUpgrade = useUpgradePrompt();

  if (plan.unlimited) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Check className="size-4 text-primary-text" />
        Unlimited AI research and discovery is unlocked.
      </p>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Premium unlocks unlimited AI source research and discovery. The core
        library stays free.
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
      {compact ? (
        <Button onClick={handleUpgrade} className="mt-4 w-full gap-2">
          <Sparkles className="size-4" />
          Get Premium
        </Button>
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
 * Plan / subscription row for the web Settings page. Mirrors the mobile
 * PremiumCard: shows the current plan and AI usage from /users/me/usage.
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

      {!plan.unlimited ? (
        <Button onClick={handleUpgrade} className="gap-2">
          <Sparkles className="size-4" />
          Get Premium
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
