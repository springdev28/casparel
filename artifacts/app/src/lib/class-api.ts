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

export async function classRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${localStorage.getItem("schoolar_token")}`,
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (payload as { error?: string }).error ?? "Class request failed",
    );
  }
  return payload as T;
}
