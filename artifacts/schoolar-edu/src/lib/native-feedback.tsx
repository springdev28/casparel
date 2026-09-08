/** The native host supplies optional sound playback without coupling the design system to an audio SDK. */
export type NativeFeedbackKind = 'tick' | 'success' | 'error';
let handler: ((kind: NativeFeedbackKind) => void) | undefined;
export function installNativeFeedback(next: (kind: NativeFeedbackKind) => void) {
  handler = next;
  return () => { if (handler === next) handler = undefined; };
}
export function nativeFeedback(kind: NativeFeedbackKind) { handler?.(kind); }
