/**
 * @fileOverview Server integration role: implements Index for trusted backend access to OpenAI-backed capabilities.
 * System connection: used behind API boundaries so credentials and provider operations never move into browser code.
 */
export { registerImageRoutes } from "./routes";
export { openai, generateImageBuffer, editImages } from "./client";
