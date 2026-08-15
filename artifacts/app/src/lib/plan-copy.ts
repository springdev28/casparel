/**
 * The one place plan copy lives on the web. The Settings plan section shows
 * `name` + `blurb`; the /plans page renders the full bullet lists. Numbers
 * must match CAPACITY_BY_TIER and AI_RATES_BY_TIER on the server — the client
 * cannot import server code, so this file is the hand-kept mirror, and a
 * number changed there must be changed here in the same commit.
 *
 * Wording rules that already burned this product once each:
 * - Nothing here may say "unlimited": only administrator accounts are
 *   uncapped, and none of these cards are for administrators.
 * - The seating planner is rule-based; it must never be described as AI.
 */
import type { PlanTier } from "./use-plan";

export interface TierCard {
  tier: PlanTier;
  name: string;
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
      blurb:
        "The adaptive study dashboard, 25 activities, 10 goals, 5 lists and 3 canvases, plus a daily AI taste: 2 discovery searches and 1 deep report (2 per month).",
      workspace: [
        "25 study activities",
        "10 learning goals",
        "5 resource lists",
        "3 canvases",
      ],
      ai: [
        "2 AI discovery searches a day",
        "1 deep research report a day, 2 per 30 days",
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
        "8 deep research reports a day, 80 per 30 days",
      ],
      extras: ["Everything in Free"],
    },
    {
      tier: "student-pro",
      name: "Student Pro",
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
        "25 deep research reports a day, 250 per 30 days",
      ],
      extras: ["Everything in Student Plus"],
    },
  ],
  teacher: [
    {
      tier: "free",
      name: "Free",
      blurb:
        "One class of up to 30 with manual seating, student seating suggestions and private notes, plus a daily AI taste: 2 discovery searches and 1 deep report (2 per month).",
      workspace: [
        "1 class, up to 30 members",
        "25 study activities",
        "10 learning goals",
        "5 resource lists",
        "3 canvases",
      ],
      ai: [
        "2 AI discovery searches a day",
        "1 deep research report a day, 2 per 30 days",
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
        "5 deep research reports a day, 50 per 30 days",
      ],
      extras: ["Everything in Free"],
    },
    {
      tier: "teacher-pro",
      name: "Teacher Pro",
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
        "15 deep research reports a day, 150 per 30 days",
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
        "1 deep research report a day, 2 per 30 days",
      ],
      extras: ["Adaptive study dashboard", "Manual Classroom Designer"],
    },
    {
      tier: "plus",
      name: "Plus",
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
        "5 deep research reports a day, 50 per 30 days",
      ],
      extras: ["Everything in Free"],
    },
    {
      tier: "pro",
      name: "Pro",
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
        "15 deep research reports a day, 150 per 30 days",
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
