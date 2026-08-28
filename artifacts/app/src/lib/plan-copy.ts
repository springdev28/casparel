/**
 * @fileOverview Web domain role: centralizes Plan Copy state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
/**
 * The one place plan copy lives on the web. The Settings plan section shows
 * `name` + `blurb`; the /plans page renders the full bullet lists. Numbers
 * come from @workspace/plan-economics, the runtime-neutral source shared with
 * the server and mobile app. Workspace prose remains presentation copy.
 *
 * Prices are USD reference prices from the shared catalog. Stores localise
 * currency on their own; checkout always shows the store-localised value.
 *
 * The ladder prices the costs, not just the value: deep research reports are
 * the dominant per-user cost (LLM + search API per report), so each step's
 * price scales with its deep-report ceiling; store commissions (15–30%) and
 * card fees are covered by the margin; storage rows are cheap and the
 * capacity columns exist to bound database growth rather than to be priced
 * per row. Role plans undercut the generic plan of the same level — they are
 * specialised, not premium; the generic plans carry a small flexibility
 * premium for working on any account role.
 *
 * Wording rules that already burned this product once each:
 * - Nothing here may say "unlimited": only administrator accounts are
 *   uncapped, and none of these cards are for administrators.
 * - The seating planner is rule-based; it must never be described as AI.
 */
import type { PlanTier } from "./use-plan";
import {
  INSTITUTIONAL_STARTER,
  PLAN_CATALOG,
  formatStorage,
  formatUsd,
  type SubscriptionTier,
} from "@workspace/plan-economics";

export interface TierPrice {
  /** e.g. "US$4.99" — reference price, see the header comment. */
  monthly: string;
  /** e.g. "US$53.99" — economically safe against twelve full months. */
  annual: string;
  /** Rounded reduction against paying the monthly price twelve times. */
  annualSavingsPercent: number;
}

export interface TierCard {
  tier: PlanTier;
  name: string;
  /** Reference prices; null on the Free card. */
  price: TierPrice | null;
  /** One-sentence summary, used by the compact Settings cards. */
  blurb: string;
  /** Stored-workspace allowances. */
  workspace: string[];
  /** Per-account AI allowances. */
  ai: string[];
  /** Features that are not a number. */
  extras: string[];
}

export type PlanAudience = "student" | "teacher" | "generic";

function tierPrice(tier: Exclude<SubscriptionTier, "free">): TierPrice {
  const price = PLAN_CATALOG[tier].price;
  if (!price) throw new Error(`${tier} has no price`);
  return {
    monthly: formatUsd(price.monthlyUsd),
    annual: formatUsd(price.annualUsd),
    annualSavingsPercent: Math.round(
      (1 - price.annualUsd / (price.monthlyUsd * 12)) * 100,
    ),
  };
}

function aiLines(tier: SubscriptionTier): string[] {
  const limits = PLAN_CATALOG[tier].ai;
  const searchNoun = limits.searchPerDay === 1 ? "search" : "searches";
  const reportNoun = limits.deepPerDay === 1 ? "report" : "reports";
  return [
    `${limits.searchPerDay} AI discovery ${searchNoun} a day, up to ${limits.searchPerMonth} per 30 days`,
    `${limits.deepPerDay} deep research ${reportNoun} a day, up to ${limits.deepPerMonth} per 30 days`,
  ];
}

function storageLine(tier: SubscriptionTier): string {
  return `${formatStorage(PLAN_CATALOG[tier].storageBytes)} stored uploads`;
}

export const TIER_CARDS: Record<PlanAudience, TierCard[]> = {
  student: [
    {
      tier: "free",
      name: "Free",
      price: null,
      blurb:
        "The adaptive study dashboard and a tightly capped taste of AI discovery and deep research.",
      workspace: [
        "25 study activities",
        "10 learning goals",
        "5 resource lists",
        "3 canvases",
        storageLine("free"),
      ],
      ai: aiLines("free"),
      extras: [
        "Adaptive study dashboard",
        "Quick source check (registry-based, no AI)",
        "Join any class you are invited to",
      ],
    },
    {
      tier: "student-plus",
      name: "Student Plus",
      price: tierPrice("student-plus"),
      blurb:
        "More study workspace plus a safe monthly pool for regular AI discovery and deep research.",
      workspace: [
        "400 study activities",
        "150 learning goals",
        "75 resource lists",
        "40 canvases",
        storageLine("student-plus"),
      ],
      ai: aiLines("student-plus"),
      extras: ["Everything in Free"],
    },
    {
      tier: "student-pro",
      name: "Student Pro",
      price: tierPrice("student-pro"),
      blurb:
        "A large personal study workspace and heavier, still finite AI research pools.",
      workspace: [
        "1,500 study activities",
        "500 learning goals",
        "300 resource lists",
        "150 canvases",
        storageLine("student-pro"),
      ],
      ai: aiLines("student-pro"),
      extras: ["Everything in Student Plus"],
    },
  ],
  teacher: [
    {
      tier: "free",
      name: "Free",
      price: null,
      blurb:
        "One class with manual seating and private notes, plus a tightly capped AI taste.",
      workspace: [
        "1 class, up to 30 members",
        "25 study activities",
        "10 learning goals",
        "5 resource lists",
        "3 canvases",
        storageLine("free"),
      ],
      ai: aiLines("free"),
      extras: [
        "Manual Classroom Designer",
        "Student seating suggestions",
        "Private per-student notes",
      ],
    },
    {
      tier: "teacher-plus",
      name: "Teacher Plus",
      price: tierPrice("teacher-plus"),
      blurb:
        "A practical classroom workspace with monthly AI discovery and research pools.",
      workspace: [
        "8 classes, up to 150 members each",
        "250 study activities",
        "100 learning goals",
        "50 resource lists",
        "30 canvases",
        storageLine("teacher-plus"),
      ],
      ai: aiLines("teacher-plus"),
      extras: ["Everything in Free"],
    },
    {
      tier: "teacher-pro",
      name: "Teacher Pro",
      price: tierPrice("teacher-pro"),
      blurb:
        "Large classes, the explainable seating planner, and heavier finite AI pools.",
      workspace: [
        "25 classes, up to 400 members each",
        "1,000 study activities",
        "400 learning goals",
        "200 resource lists",
        "100 canvases",
        storageLine("teacher-pro"),
      ],
      ai: aiLines("teacher-pro"),
      extras: [
        "Explainable seating planner (rule-based)",
        "Everything in Teacher Plus",
      ],
    },
  ],
  generic: [
    {
      tier: "free",
      name: "Free",
      price: null,
      blurb:
        "One class of 30, 25 activities, 10 goals and 5 lists, plus a small taste of AI discovery and deep research.",
      workspace: [
        "1 class, up to 30 members",
        "25 study activities",
        "10 learning goals",
        "5 resource lists",
        "3 canvases",
        storageLine("free"),
      ],
      ai: aiLines("free"),
      extras: ["Adaptive study dashboard", "Manual Classroom Designer"],
    },
    {
      tier: "plus",
      name: "Plus",
      price: tierPrice("plus"),
      blurb:
        "A flexible workspace with practical monthly AI discovery and research pools.",
      workspace: [
        "5 classes, up to 100 members each",
        "250 study activities",
        "100 learning goals",
        "50 resource lists",
        "30 canvases",
        storageLine("plus"),
      ],
      ai: aiLines("plus"),
      extras: ["Everything in Free"],
    },
    {
      tier: "pro",
      name: "Pro",
      price: tierPrice("pro"),
      blurb:
        "The largest self-serve flexible workspace, seating planner, and heavier finite AI pools.",
      workspace: [
        "20 classes, up to 300 members each",
        "1,000 study activities",
        "400 learning goals",
        "200 resource lists",
        "100 canvases",
        storageLine("pro"),
      ],
      ai: aiLines("pro"),
      extras: [
        "Explainable seating planner (rule-based)",
        "Everything in Plus",
      ],
    },
  ],
};

export function audienceForRole(
  role: "student" | "teacher" | "admin" | null,
): PlanAudience {
  if (role === "teacher") return "teacher";
  if (role === "student") return "student";
  return "generic";
}

/**
 * The school licence. Sales-led, per-seat and invoiced — never a checkout
 * package, which is why it is not a TIER_CARDS column: the /plans page
 * renders it in its own peer tab with a contact action instead of a Subscribe
 * button. Numbers mirror CAPACITY_BY_TIER.institutional and
 * AI_RATES_BY_TIER.institutional on the server, same rule as the cards above.
 */
export const INSTITUTIONAL_PLAN = {
  tier: "institutional" as PlanTier,
  name: "Institutional",
  blurb:
    "A 30-seat annual school licence with shared AI and storage pools, so one seat cannot create unbounded contract exposure.",
  priceLine: `Starting from ${formatUsd(INSTITUTIONAL_STARTER.seatMonthlyUsdRange.minimum)}–${formatUsd(INSTITUTIONAL_STARTER.seatMonthlyUsdRange.maximum)} per seat / month`,
  priceNote:
    `Billed annually · ${INSTITUTIONAL_STARTER.includedSeats}-seat minimum · contact us for a quote`,
  workspace: [
    "50 classes, up to 500 members each",
    "2,500 study activities",
    "800 learning goals",
    "500 resource lists",
    "250 canvases",
    `${formatStorage(INSTITUTIONAL_STARTER.storageBytes)} shared stored uploads`,
  ],
  ai: [
    `${INSTITUTIONAL_STARTER.searchPerMonth} shared AI discovery searches per 30 days`,
    `${INSTITUTIONAL_STARTER.deepPerMonth} shared deep research reports per 30 days`,
  ],
  extras: [
    "Applies to any account role — one licence covers staff and students",
    "Explainable seating planner (rule-based) on every licensed teacher seat",
    "Priority email support",
  ],
};
