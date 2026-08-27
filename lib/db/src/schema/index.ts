/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Index domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
export * from "./users";
export * from "./classes";
export * from "./classMembers";
export * from "./classInvitations";
export * from "./userPreferences";
export * from "./resources";
export * from "./reviews";
export * from "./resourceLists";
export * from "./scheduleBlocks";
export * from "./activityLog";
export * from "./googleTokens";
export * from "./studySessions";
export * from "./calendarTokens";
export * from "./learningGoals";
export * from "./userSafety";
export * from "./learningEvidence";
export * from "./sourceReviewCache";
export * from "./classResourceRecommendations";
export * from "./forum";
export * from "./assignments";
export * from "./catalogResources";
export * from "./canvases";
export * from "./directMessages";
export * from "./workflowEvents";
export * from "./webhookEvents";
export * from "./supportRequests";
