/**
 * @fileOverview Client integration role: implements Index for browser/React access to OpenAI-backed capabilities.
 * System connection: exposes reusable client hooks/utilities while keeping provider-specific behavior outside product pages.
 */
export { decodePCM16ToFloat32, createAudioPlaybackContext } from "./audio/audio-utils";
export { useVoiceRecorder, type RecordingState } from "./audio/useVoiceRecorder";
export { useAudioPlayback, type PlaybackState } from "./audio/useAudioPlayback";
export { useVoiceStream } from "./audio/useVoiceStream";
