/**
 * @fileOverview Web domain role: centralizes Dashboard Goal state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
export function dashboardGoalKey(userId: number, role: string) {
  return `schoolar_dashboard_goal:${userId}:${role}`;
}

export function getDashboardGoalId(userId?: number, role?: string): number | null {
  if (!userId || !role) return null;
  const value = Number(localStorage.getItem(dashboardGoalKey(userId, role)));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function setDashboardGoalId(userId: number, role: string, goalId: number) {
  localStorage.setItem(dashboardGoalKey(userId, role), String(goalId));
  window.dispatchEvent(new CustomEvent("schoolar-dashboard-goal", { detail: goalId }));
}

export function pendingCheckInKey(userId: number, role: string, goalId: number) {
  return `schoolar_pending_checkin:${userId}:${role}:${goalId}`;
}
