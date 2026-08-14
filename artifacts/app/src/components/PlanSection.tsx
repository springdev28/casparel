import { useGetMyUsage } from "@workspace/api-client-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { Check, Crown, Sparkles } from "lucide-react";

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
            nearLimit ? "font-medium text-destructive" : "text-muted-foreground"
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

/**
 * Plan / subscription section for the web Settings page. Mirrors the mobile
 * PremiumCard: shows the current plan and AI usage from /users/me/usage.
 * Purchases happen in the mobile app (RevenueCat IAP), so the web surfaces
 * status and directs users there to upgrade.
 */
export function PlanSection() {
  const { data: usage } = useGetMyUsage();
  const unlimited = usage?.unlimited === true;
  const planName = usage?.plan ?? "Free";

  function handleUpgrade() {
    toast({
      title: "Upgrade in the Casparel mobile app",
      description:
        "Premium is purchased in the app. Sign in with the same account, then open Profile → Plan to unlock unlimited AI.",
    });
  }

  return (
    <section className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
      <div className="flex min-w-0 gap-3">
        <Crown className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Plan</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {planName}
            </span>
          </div>

          {unlimited ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="size-4 text-primary" />
              Unlimited AI research and discovery is unlocked.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Premium unlocks unlimited AI source research and discovery. The
                core library stays free.
              </p>
              <div className="mt-3 grid max-w-sm gap-2.5">
                <UsageMeter
                  label="AI source research"
                  used={usage?.deepResearch.used ?? 0}
                  limit={usage?.deepResearch.limit ?? 2}
                />
                <UsageMeter
                  label="AI discovery"
                  used={usage?.aiSearch.used ?? 0}
                  limit={usage?.aiSearch.limit ?? 3}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {!unlimited ? (
        <Button onClick={handleUpgrade} className="gap-2">
          <Sparkles className="size-4" />
          Get Premium
        </Button>
      ) : null}
    </section>
  );
}
