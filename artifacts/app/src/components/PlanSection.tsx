import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { Check, Crown, Sparkles } from "lucide-react";
import {
  CAPACITY_LABELS,
  usePlan,
  type PlanCapacityKey,
} from "@/lib/use-plan";

/**
 * Roster size is a property of each class rather than a running account total,
 * so it is described in a sentence below instead of being given a meter that
 * would always read 0.
 */
const WORKSPACE_METERS: PlanCapacityKey[] = [
  "classesOwned",
  "studyActivities",
  "resourceLists",
  "learningGoals",
  "canvases",
];

/**
 * The three plans this account can actually be on, worded for its role.
 * Student and teacher plans never mix: a student is never sold a roster and a
 * teacher is never sold a bigger flashcard box as the headline. The generic
 * cards remain for admin/unknown roles and for legacy Plus/Pro holders.
 * Numbers must match CAPACITY_BY_TIER and AI_RATES_BY_TIER on the server.
 */
const TIER_CARDS: Record<
  "student" | "teacher" | "generic",
  { name: string; body: string }[]
> = {
  student: [
    {
      name: "Free",
      body: "The adaptive study dashboard, 25 activities, 10 goals, 5 lists and 3 canvases, plus a daily AI taste: 2 discovery searches and 1 deep report (2 per month).",
    },
    {
      name: "Student Plus",
      body: "400 activities, 150 goals, 75 lists and 40 canvases, with 30 AI discovery searches and 8 deep reports a day.",
    },
    {
      name: "Student Pro",
      body: "1,500 activities, 500 goals, 300 lists and 150 canvases, with 90 AI discovery searches and 25 deep reports a day.",
    },
  ],
  teacher: [
    {
      name: "Free",
      body: "One class of up to 30 with manual seating, student seating suggestions and private notes, plus a daily AI taste: 2 discovery searches and 1 deep report (2 per month).",
    },
    {
      name: "Teacher Plus",
      body: "8 classes of up to 150, with 250 activities and 20 AI discovery searches and 5 deep reports a day.",
    },
    {
      name: "Teacher Pro",
      body: "25 classes of up to 400, the explainable seating planner, and 60 AI discovery searches and 15 deep reports a day.",
    },
  ],
  generic: [
    {
      name: "Free",
      body: "One class of 30, 25 activities, 10 goals and 5 lists, plus a small daily taste of AI discovery and deep research.",
    },
    {
      name: "Plus",
      body: "5 classes of 100, 250 activities, 100 goals and 50 lists, with 20 AI discovery searches and 5 deep reports a day.",
    },
    {
      name: "Pro",
      body: "20 classes of 300, 1,000 activities and 400 goals, the seating planner, and 60 discovery searches and 15 deep reports a day.",
    },
  ],
};

function UsageMeter({
  label,
  used,
  limit,
  /**
   * AI counters reset daily; stored-data allowances do not. Saying "today" on a
   * class or activity count would suggest a limit that clears overnight.
   */
  period = "today",
}: {
  label: string;
  used: number;
  limit: number | null;
  period?: "today" | "stored";
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
              ? `${used} / ${limit}${period === "today" ? " today" : ""}`
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
        {plan.level !== "free" ? (
          <Check className="size-4 text-primary-text" />
        ) : null}
        {plan.unlimited
          ? "Administrator account: AI usage is uncapped."
          : plan.level === "free"
            ? "Free includes the core tools and a small daily taste of AI."
            : "AI discovery and deep research are active with plan allowances."}
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
      {/*
        Workspace allowances are only rendered once the server has answered.
        While `pending`, every limit is null, which the meter would show as
        "Unlimited" , the one reading a free account must never be given.
      */}
      {!plan.pending ? (
        <div className={"mt-3 grid gap-2.5" + (compact ? "" : " max-w-sm")}>
          <p className="text-xs font-medium text-muted-foreground">
            Workspace
          </p>
          {WORKSPACE_METERS.filter(
            (key) => key !== "classesOwned" || plan.accountRole !== "student",
          ).map((key) => (
            <UsageMeter
              key={key}
              label={CAPACITY_LABELS[key]}
              used={plan.capacity[key].used}
              limit={plan.capacity[key].limit}
              period="stored"
            />
          ))}
          {plan.accountRole !== "student" ? (
            <p className="text-xs text-muted-foreground">
              {plan.capacity.classMembers.limit == null
                ? "Class rosters are uncapped on this account."
                : `Each class you own holds up to ${plan.capacity.classMembers.limit} members.`}
            </p>
          ) : null}
        </div>
      ) : null}
      {!compact ? (
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          {TIER_CARDS[plan.accountRole === "teacher" ? "teacher" : plan.accountRole === "student" ? "student" : "generic"].map(
            (card, index) => (
              <div
                key={card.name}
                className={
                  index === 0
                    ? "rounded-lg border p-3"
                    : index === 1
                      ? "rounded-lg border border-primary/30 p-3"
                      : "rounded-lg border border-primary/50 bg-primary/5 p-3"
                }
              >
                <b>{card.name}</b>
                <p className="mt-1 text-muted-foreground">{card.body}</p>
              </div>
            ),
          )}
        </div>
      ) : null}
      {compact ? (
        plan.tier !== "administrator" && plan.level !== "pro" ? (
          <Button onClick={handleUpgrade} className="mt-4 w-full gap-2">
            <Sparkles className="size-4" />
            {plan.level === "plus" ? "Upgrade to Pro" : "See plans"}
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

      {plan.tier !== "administrator" && plan.level !== "pro" ? (
        <Button onClick={handleUpgrade} className="gap-2">
          <Sparkles className="size-4" />
          {plan.level === "plus" ? "Upgrade to Pro" : "See plans"}
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
