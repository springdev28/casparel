export type ResourceWorkflowSteps = {
  reviewed: boolean;
  saved: boolean;
  activityCreated: boolean;
  classShared: boolean;
};

export type ResourceWorkflowAction =
  | "review"
  | "save"
  | "create_activity"
  | "share_class"
  | "complete";

export function nextResourceWorkflowAction(
  steps: ResourceWorkflowSteps,
): ResourceWorkflowAction {
  if (!steps.reviewed) return "review";
  if (!steps.saved) return "save";
  if (!steps.activityCreated) return "create_activity";
  if (!steps.classShared) return "share_class";
  return "complete";
}
