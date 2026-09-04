/**
 * @fileOverview Web UI role: provides the reusable Feedback Toaster component or bridge.
 * System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.
 */
import { useEffect, useRef } from "react";
import { Toaster } from "@workspace/edu-ds/components/ui/toaster";
import { useToast } from "@workspace/edu-ds/hooks/use-toast";

import { CelebrationOverlay } from "./CelebrationOverlay";
import { playToastCue } from "../lib/feedback";

/**
 * The app's toast mount, with ears: renders the design-system Toaster plus the
 * celebration layer, and plays a quiet tone whenever a toast appears — the
 * error tone for destructive toasts, a soft notify blip otherwise. Watching
 * the toast store instruments every existing toast() call site at once
 * without touching any of them, and keeps audio code out of the design
 * system, which is shared with the audio-less mobile app.
 *
 * Toasts are diffed strictly by unseen id: the store keeps TOAST_LIMIT=1 and
 * replaces in place, and toast() hands back update handles, so keying on
 * array shape or UPDATE_TOAST-driven renders would replay tones. A short
 * debounce keeps a rapid replacement chain to one sound, and playToastCue
 * itself stays silent when the page just played a richer cue for the same
 * action.
 */

/** Rapid replacements of the same kind (validation sweeps, bulk failures) get one tone. */
const DEBOUNCE_MS = 300;
/** Seen-id cap; ids are monotonic counter strings, so old ones never return. */
const MAX_SEEN = 200;

export function FeedbackToaster() {
  const { toasts } = useToast();
  const seenIds = useRef<Set<string>>(new Set());
  const lastCueAt = useRef(0);
  const lastCueVariant = useRef<"default" | "destructive" | null>(null);

  useEffect(() => {
    for (const toast of toasts) {
      if (seenIds.current.has(toast.id)) continue;
      seenIds.current.add(toast.id);
      if (seenIds.current.size > MAX_SEEN) {
        seenIds.current = new Set(toasts.map((t) => t.id));
      }
      const variant =
        toast.variant === "destructive" ? "destructive" : "default";
      const now = Date.now();
      // The debounce only collapses a run of like-sounding toasts. A failure
      // arriving right behind a success still gets the error tone, or the
      // louder half of the news would be the half that goes unheard.
      if (
        now - lastCueAt.current < DEBOUNCE_MS &&
        variant === lastCueVariant.current
      ) {
        continue;
      }
      lastCueAt.current = now;
      lastCueVariant.current = variant;
      playToastCue(variant);
    }
  }, [toasts]);

  return (
    <>
      <Toaster />
      <CelebrationOverlay />
    </>
  );
}
