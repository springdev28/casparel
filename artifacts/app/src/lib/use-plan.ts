import {
  getGetMyUsageQueryKey,
  useGetMe,
  useGetMyUsage,
  UserRole,
} from "@workspace/api-client-react";
import { readSessionClaims } from "./session";

/**
 * One answer to "what plan is this account on", for every surface that shows it.
 *
 * The sidebar and the profile card used to each work this out for themselves,
 * and they disagreed: the sidebar fell back to the account role when
 * `/users/me/usage` was unavailable, the profile card fell back to "Free". An
 * admin therefore saw "Administrator, Unlimited" and "Free, 0/2 today" on the
 * same screen. Both now read this hook, so they cannot drift apart again.
 *
 * The role fallback also covers the token, so a slow or failing `/users/me`
 * does not silently downgrade the display to Free either.
 */
export interface PlanState {
  /** Label to show: "Administrator", "Pro", "Plus" or "Free". */
  label: string;
  tier: "free" | "plus" | "pro" | "administrator";
  /** True when AI usage is uncapped (admins and Pro accounts). */
  unlimited: boolean;
  aiEnabled: boolean;
  seatingPlanner: boolean;
  aiSearch: { used: number; limit: number | null };
  deepResearch: { used: number; limit: number | null };
  /**
   * Stored-data allowances. A plan is not only a rate of AI calls, it is also
   * how much of the workspace an account may keep, so these travel with the
   * per-day counters rather than being fetched separately.
   */
  capacity: Record<PlanCapacityKey, { used: number; limit: number | null }>;
  /** True while we still only have the fallback, not the server's answer. */
  pending: boolean;
}

export type PlanCapacityKey =
  | "classesOwned"
  | "classMembers"
  | "studyActivities"
  | "resourceLists"
  | "learningGoals"
  | "canvases";

export const CAPACITY_LABELS: Record<PlanCapacityKey, string> = {
  classesOwned: "Classes",
  classMembers: "Members per class",
  studyActivities: "Study activities",
  resourceLists: "Resource lists",
  learningGoals: "Learning goals",
  canvases: "Canvases",
};

const FALLBACK_SEARCH_LIMIT = 0;
const FALLBACK_DEEP_LIMIT = 0;

export function usePlan(enabled = true): PlanState {
  const { data: me } = useGetMe();
  const { data: usage } = useGetMyUsage({
    query: {
      enabled,
      refetchInterval: 60_000,
      queryKey: getGetMyUsageQueryKey(),
    },
  });

  const role = me?.role ?? readSessionClaims()?.accountRole;
  const isAdmin = role === UserRole.admin;
  // Label and caps must come from the same source or they contradict each
  // other: reading `unlimited` from the role while the label came from the
  // server produced a badge saying "Free" above meters saying "Unlimited".
  // The server is authoritative whenever it answers, since it is what actually
  // enforces the limits; the role is the fallback for when it does not, which
  // is the case that used to downgrade the whole display to Free.
  const unlimited = usage ? usage.unlimited === true : isAdmin;
  const label = usage?.plan ?? (isAdmin ? "Administrator" : "Free");
  const tier =
    label === "Administrator"
      ? "administrator"
      : label === "Pro" || label === "Premium"
        ? "pro"
        : label === "Plus"
          ? "plus"
          : "free";

  // Every field is read defensively, including the nested ones. This hook feeds
  // the sidebar, which renders on every signed-in page, so a usage response
  // that is served but malformed (an object missing `aiSearch`, or an error
  // body returned with a 200) must not be able to throw. It did once:
  // `usage?.aiSearch` guarded the response but not the field inside it, and
  // one such response took down the whole app, not just the plan card.
  return {
    label,
    tier,
    unlimited,
    aiEnabled: tier !== "free",
    seatingPlanner: tier === "pro" || tier === "administrator",
    aiSearch: {
      used: usage?.aiSearch?.used ?? 0,
      limit: unlimited ? null : (usage?.aiSearch?.limit ?? FALLBACK_SEARCH_LIMIT),
    },
    deepResearch: {
      used: usage?.deepResearch?.used ?? 0,
      limit: unlimited
        ? null
        : (usage?.deepResearch?.limit ?? FALLBACK_DEEP_LIMIT),
    },
    // Read field by field, like the counters above: a malformed usage body must
    // not be able to throw out of a hook the whole signed-in shell depends on.
    // `limit: null` reads as "unlimited", so callers must check `pending`
    // before rendering these rather than trusting a not-yet-loaded response.
    capacity: {
      classesOwned: readCapacity(usage?.capacity?.classesOwned),
      classMembers: readCapacity(usage?.capacity?.classMembers),
      studyActivities: readCapacity(usage?.capacity?.studyActivities),
      resourceLists: readCapacity(usage?.capacity?.resourceLists),
      learningGoals: readCapacity(usage?.capacity?.learningGoals),
      canvases: readCapacity(usage?.capacity?.canvases),
    },
    pending: usage === undefined,
  };
}

function readCapacity(entry: { used?: number; limit?: number | null } | undefined) {
  return { used: entry?.used ?? 0, limit: entry?.limit ?? null };
}
