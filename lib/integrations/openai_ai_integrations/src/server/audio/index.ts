/**
 * @fileOverview Server integration role: implements Index for trusted backend access to OpenAI-backed capabilities.
 * System connection: used behind API boundaries so credentials and provider operations never move into browser code.
 */
export { registerAudioRoutes } from "./routes";
export {
  openai,
  detectAudioFormat,
  convertToWav,
  ensureCompatibleFormat,
  type AudioFormat,
  voiceChat,
  voiceChatStream,
  textToSpeech,
  textToSpeechStream,
  speechToText,
  speechToTextStream,
} from "./client";
