/**
 * @fileOverview Backend domain role: centralizes Workflow State logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
export type ResourceWorkflowSteps = {
  reviewed: boolean;
  saved: boolean;
  activityCreated: boolean;
  classShared: boolean;
  assignmentCreated: boolean;
};

export type ResourceWorkflowAction =
  | "review"
  | "save"
  | "create_activity"
  | "share_class"
  | "assign_class"
  | "complete";

export function nextResourceWorkflowAction(
  steps: ResourceWorkflowSteps,
  assignmentRequired = false,
): ResourceWorkflowAction {
  if (!steps.reviewed) return "review";
  if (!steps.saved) return "save";
  if (!steps.activityCreated) return "create_activity";
  if (!steps.classShared) return "share_class";
  if (assignmentRequired && !steps.assignmentCreated) return "assign_class";
  return "complete";
}
