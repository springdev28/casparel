/**
 * The one place plan copy lives on the web. The Settings plan section shows
 * `name` + `blurb`; the /plans page renders the full bullet lists. Numbers
 * must match CAPACITY_BY_TIER and AI_RATES_BY_TIER on the server — the client
 * cannot import server code, so this file is the hand-kept mirror, and a
 * number changed there must be changed here in the same commit.
 *
 * Prices are USD reference prices and are the source of truth for what the
 * RevenueCat dashboard (Web Billing products, App Store and Play Console
 * prices) must be configured to. Stores localise currency on their own; when
 * checkout is live the buttons show the store's localised price, and these
 * strings remain the comparison-table reference. Change a price here and in
 * the dashboards together.
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

export interface TierPrice {
  /** e.g. "US$4.99" — reference price, see the header comment. */
  monthly: string;
  /** e.g. "US$49.99" — two months free against 12× monthly. */
  annual: string;
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

export const TIER_CARDS: Record<PlanAudience, TierCard[]> = {
  student: [
    {
      tier: "free",
      name: "Free",
      price: null,
      blurb:
        "The adaptive study dashboard, 25 activities, 10 goals, 5 lists and 3 canvases, plus an AI taste: 2 discovery searches a day and 2 deep reports per 30 days.",
      workspace: [
        "25 study activities",
        "10 learning goals",
        "5 resource lists",
        "3 canvases",
      ],
      ai: [
        "2 AI discovery searches a day",
        "2 deep research reports per 30 days",
      ],
      extras: [
        "Adaptive study dashboard",
        "Quick source check (registry-based, no AI)",
        "Join any class you are invited to",
      ],
    },
    {
      tier: "student-plus",
      name: "Student Plus",
      price: { monthly: "US$2.99", annual: "US$29.99" },
      blurb:
        "400 activities, 150 goals, 75 lists and 40 canvases, with 30 AI discovery searches and 8 deep reports a day.",
      workspace: [
        "400 study activities",
        "150 learning goals",
        "75 resource lists",
        "40 canvases",
      ],
      ai: [
        "30 AI discovery searches a day",
        "8 deep research reports a day, up to 80 per 30 days",
      ],
      extras: ["Everything in Free"],
    },
    {
      tier: "student-pro",
      name: "Student Pro",
      price: { monthly: "US$6.99", annual: "US$69.99" },
      blurb:
        "1,500 activities, 500 goals, 300 lists and 150 canvases, with 90 AI discovery searches and 25 deep reports a day.",
      workspace: [
        "1,500 study activities",
        "500 learning goals",
        "300 resource lists",
        "150 canvases",
      ],
      ai: [
        "90 AI discovery searches a day",
        "25 deep research reports a day, up to 250 per 30 days",
      ],
      extras: ["Everything in Student Plus"],
    },
  ],
  teacher: [
    {
      tier: "free",
      name: "Free",
      price: null,
      blurb:
        "One class of up to 30 with manual seating, student seating suggestions and private notes, plus an AI taste: 2 discovery searches a day and 2 deep reports per 30 days.",
      workspace: [
        "1 class, up to 30 members",
        "25 study activities",
        "10 learning goals",
        "5 resource lists",
        "3 canvases",
      ],
      ai: [
        "2 AI discovery searches a day",
        "2 deep research reports per 30 days",
      ],
      extras: [
        "Manual Classroom Designer",
        "Student seating suggestions",
        "Private per-student notes",
      ],
    },
    {
      tier: "teacher-plus",
      name: "Teacher Plus",
      price: { monthly: "US$4.99", annual: "US$49.99" },
      blurb:
        "8 classes of up to 150 members, 250 activities, and 20 AI discovery searches with 5 deep reports a day.",
      workspace: [
        "8 classes, up to 150 members each",
        "250 study activities",
        "100 learning goals",
        "50 resource lists",
        "30 canvases",
      ],
      ai: [
        "20 AI discovery searches a day",
        "5 deep research reports a day, up to 50 per 30 days",
      ],
      extras: ["Everything in Free"],
    },
    {
      tier: "teacher-pro",
      name: "Teacher Pro",
      price: { monthly: "US$11.99", annual: "US$119.99" },
      blurb:
        "25 classes of up to 400, the explainable seating planner, and 60 AI discovery searches with 15 deep reports a day.",
      workspace: [
        "25 classes, up to 400 members each",
        "1,000 study activities",
        "400 learning goals",
        "200 resource lists",
        "100 canvases",
      ],
      ai: [
        "60 AI discovery searches a day",
        "15 deep research reports a day, up to 150 per 30 days",
      ],
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
        "One class of 30, 25 activities, 10 goals and 5 lists, plus a small daily taste of AI discovery and deep research.",
      workspace: [
        "1 class, up to 30 members",
        "25 study activities",
        "10 learning goals",
        "5 resource lists",
        "3 canvases",
      ],
      ai: [
        "2 AI discovery searches a day",
        "2 deep research reports per 30 days",
      ],
      extras: ["Adaptive study dashboard", "Manual Classroom Designer"],
    },
    {
      tier: "plus",
      name: "Plus",
      price: { monthly: "US$5.99", annual: "US$59.99" },
      blurb:
        "5 classes of 100, 250 activities, 100 goals and 50 lists, with 20 AI discovery searches and 5 deep reports a day.",
      workspace: [
        "5 classes, up to 100 members each",
        "250 study activities",
        "100 learning goals",
        "50 resource lists",
        "30 canvases",
      ],
      ai: [
        "20 AI discovery searches a day",
        "5 deep research reports a day, up to 50 per 30 days",
      ],
      extras: ["Everything in Free"],
    },
    {
      tier: "pro",
      name: "Pro",
      price: { monthly: "US$13.99", annual: "US$139.99" },
      blurb:
        "20 classes of 300, 1,000 activities and 400 goals, the seating planner, and 60 discovery searches and 15 deep reports a day.",
      workspace: [
        "20 classes, up to 300 members each",
        "1,000 study activities",
        "400 learning goals",
        "200 resource lists",
        "100 canvases",
      ],
      ai: [
        "60 AI discovery searches a day",
        "15 deep research reports a day, up to 150 per 30 days",
      ],
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
    "A per-seat licence for schools and academies: every licensed account — teacher or student — gets allowances above every other plan, still finite.",
  priceLine: "US$1.50 per seat / month, billed annually",
  priceNote: "30-seat minimum · invoiced, not card checkout",
  workspace: [
    "50 classes, up to 500 members each",
    "2,500 study activities",
    "800 learning goals",
    "500 resource lists",
    "250 canvases",
  ],
  ai: [
    "120 AI discovery searches a day",
    "30 deep research reports a day, up to 300 per 30 days",
  ],
  extras: [
    "Applies to any account role — one licence covers staff and students",
    "Explainable seating planner (rule-based) on every licensed teacher seat",
    "Priority email support",
  ],
};
