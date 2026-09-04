/**
 * @fileOverview Web domain role: centralizes Feedback state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */

import type { SoundKind } from "./sound-effects";

/**
 * The one place pages ask for sensory feedback: a synthesized sound, a
 * confetti celebration, or both. Everything funnels through here so the rules
 * live in one file — the persisted mute setting, the reduced-motion guard,
 * and the arbitration that keeps a page's own cue from stacking on top of the
 * generic toast tone a moment later.
 *
 * The synthesizer itself (lib/sound-effects.ts) is loaded with a dynamic
 * import on the first audible call, so the slimmed landing bundle and muted
 * sessions never carry it.
 */

export type { SoundKind } from "./sound-effects";
export type CelebrationIntensity = "burst" | "full";
export interface CelebrationEvent {
  intensity: CelebrationIntensity;
}

/**
 * Absent (or anything but "off") means enabled, so first-run users get sound
 * without a write — pages must not write to /api or storage on mount, and the
 * account-reset sweep can clear the key mid-session without breaking anything.
 */
const SOUND_KEY = "schoolar_sound_effects";

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
  } catch {
    // Storage can be blocked entirely; the toggle then only lasts the session.
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

/**
 * When a page plays an explicit cue and then raises a toast about the same
 * action, the generic toast tone would land ~a render later and double the
 * sound. Explicit plays stamp this; the toast cue defers to it.
 */
let lastExplicitPlayAt = 0;
const TOAST_DEFERENCE_MS = 400;

/** Fire-and-forget: mute, missing Web Audio, and load failures all no-op. */
export function playFeedback(kind: SoundKind, opts?: { pitch?: number }): void {
  if (typeof window === "undefined" || !isSoundEnabled()) return;
  lastExplicitPlayAt = Date.now();
  void import("./sound-effects")
    .then((m) => m.playTone(kind, opts))
    .catch(() => {});
}

/**
 * The generic tone for a toast appearing, used only by FeedbackToaster.
 * Quieter than page-level cues and silent when the page just played its own.
 */
export function playToastCue(variant: "default" | "destructive"): void {
  if (typeof window === "undefined" || !isSoundEnabled()) return;
  if (Date.now() - lastExplicitPlayAt < TOAST_DEFERENCE_MS) return;
  void import("./sound-effects")
    .then((m) => m.playTone(variant === "destructive" ? "error" : "notify"))
    .catch(() => {});
}

type CelebrationListener = (event: CelebrationEvent) => void;
const celebrationListeners: CelebrationListener[] = [];

/** Subscribed by CelebrationOverlay; returns an unsubscribe function. */
export function onCelebration(listener: CelebrationListener): () => void {
  celebrationListeners.push(listener);
  return () => {
    const index = celebrationListeners.indexOf(listener);
    if (index > -1) celebrationListeners.splice(index, 1);
  };
}

/**
 * Throw confetti. Reserved for real milestones — a completed goal, a cleared
 * board, a perfect score — never ordinary saves or checkboxes. Reduced motion
 * turns it into a silent no-op; the calling page's static feedback (toast,
 * checkmark, banner) is the accessible fallback.
 */
export function celebrate(intensity: CelebrationIntensity = "burst"): void {
  if (prefersReducedMotion()) return;
  for (const listener of [...celebrationListeners]) {
    try {
      listener({ intensity });
    } catch {
      // One bad subscriber must not stop the rest.
    }
  }
}
