/**
 * @fileOverview Web domain role: centralizes Class Api state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
import { authedRequest } from "./api-request";

export type ClassInvitation = {
  id: number;
  classId: number;
  userId: number;
  invitedById: number;
  role: "student" | "teacher";
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  respondedAt: string | null;
  class: { id: number; name: string };
  inviter: { id: number; name: string };
  invitee: { id: number; name: string; email: string };
};

/**
 * Kept for its existing callers. The behaviour lives in authedRequest, which
 * is the same thing under a name that is not about classes.
 */
export async function classRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return authedRequest<T>(path, init);
}
