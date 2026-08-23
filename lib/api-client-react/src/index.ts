/**
 * @fileOverview Repository role: implements or configures Index.
 * System connection: see docs/codebase-guide.md and docs/source-file-index.md for its package boundary and consumers.
 */
export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
