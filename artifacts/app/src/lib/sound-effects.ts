/**
 * @fileOverview Web domain role: centralizes Sound Effects state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */

/**
 * Synthesized UI sounds — no audio files, no library.
 *
 * Every cue is a handful of oscillator voices with gain envelopes, built at
 * call time from one lazily created AudioContext. Shipping even a small set of
 * .mp3 assets would cost more bytes than this whole module, and the landing
 * bundle was deliberately cut to ~490KB (see LetterDrop for the same
 * philosophy applied to physics). This module is only ever loaded through a
 * dynamic import in lib/feedback.ts, so pages that never make a sound never
 * pay for it.
 *
 * Autoplay policy: an AudioContext constructed outside a user gesture starts
 * suspended. Every play call here happens in (or immediately after) a click
 * handler, so the context is created on first use and resumed then; a cue that
 * arrives with no gesture behind it is skipped rather than scheduled, because
 * a suspended context stores what it is given and plays all of it at once on
 * the next resume. Nothing in this module may throw to the caller: a blocked
 * or missing Web Audio implementation must never take down a page.
 */

export type SoundKind =
  | "tick" // tiny neutral blip — checking a box, a matched pair
  | "pop" // short pluck, pitch scalable — star ratings, small removals
  | "success" // soft rising pair — an action worked
  | "error" // low, muted pair — an action failed; deliberately unpunishing
  | "chime" // warm dyad — something meaningful was saved
  | "notify" // very quiet single tone — background confirmations (toasts)
  | "fanfare"; // rising arpeggio + chord — a milestone, pairs with confetti

/** Keeps celebration cues under speech level even with several voices. */
const MASTER_GAIN = 0.16;
/** A cue re-triggered faster than this is a bounce or a re-render, not intent. */
const MIN_REPLAY_MS = 90;
/**
 * How long a cue waiting on a suspended context stays worth playing. resume()
 * only settles once the page has a user gesture, so a cue queued before that
 * (a failed request toasting on load, say) would otherwise fire minutes later
 * on the first click, stacked with whatever that click plays.
 */
const RESUME_GRACE_MS = 400;

let context: AudioContext | null = null;
let master: GainNode | null = null;
const lastPlayed = new Map<SoundKind, number>();

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) {
    context = new Ctor();
    master = context.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(context.destination);
  }
  return context;
}

/**
 * Run a cue against a context that is actually playing.
 *
 * A suspended context does not drop what is scheduled on it: currentTime is
 * frozen, the nodes sit in the graph, and they all sound at once whenever the
 * context resumes. So nothing is scheduled while suspended — resume() is
 * requested instead (it only settles inside a user gesture) and the cue plays
 * only if that lands promptly. A cue that had to wait longer than the grace
 * window has been overtaken by events and is dropped, which is what the
 * caller expects: sounds are moments, not a queue.
 */
function withRunningContext(play: (ctx: AudioContext) => void): void {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === "running") {
    play(ctx);
    return;
  }
  const requestedAt = performance.now();
  void ctx
    .resume()
    .then(() => {
      // Outside playTone's try/catch by now, so it carries its own.
      try {
        if (performance.now() - requestedAt <= RESUME_GRACE_MS) play(ctx);
      } catch {
        // Audio is decoration; a failure here must never surface.
      }
    })
    .catch(() => {});
}

interface Voice {
  /** Oscillator frequency in Hz at note start. */
  freq: number;
  /** Optional frequency to glide to over the note's duration. */
  glideTo?: number;
  type?: OscillatorType;
  /** Seconds after the cue starts before this voice sounds. */
  at?: number;
  /** Envelope length in seconds. */
  duration: number;
  /** Peak of this voice's own envelope, 0..1 (scaled by the master gain). */
  peak: number;
}

function playVoices(ctx: AudioContext, voices: Voice[]): void {
  if (!master) return;
  const now = ctx.currentTime;
  for (const v of voices) {
    const start = now + (v.at ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = v.type ?? "sine";
    osc.frequency.setValueAtTime(v.freq, start);
    if (v.glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, v.glideTo),
        start + v.duration,
      );
    }
    // Fast attack, exponential release — clickless at both ends.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(v.peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + v.duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + v.duration + 0.05);
  }
}

/** Frequency for a scalable pluck: 0 → low C, 1 → about an octave up. */
function popFrequency(pitch: number): number {
  const clamped = Math.min(1, Math.max(0, pitch));
  return 392 * Math.pow(2, clamped); // G4 up to G5
}

const RECIPES: Record<SoundKind, (pitch: number) => Voice[]> = {
  tick: () => [{ freq: 1245, type: "triangle", duration: 0.06, peak: 0.5 }],
  pop: (pitch) => [
    {
      freq: popFrequency(pitch),
      glideTo: popFrequency(pitch) * 0.92,
      type: "triangle",
      duration: 0.12,
      peak: 0.7,
    },
  ],
  success: () => [
    { freq: 659.25, duration: 0.16, peak: 0.55 }, // E5
    { freq: 880, at: 0.09, duration: 0.22, peak: 0.55 }, // A5
  ],
  error: () => [
    { freq: 233.08, type: "triangle", duration: 0.16, peak: 0.4 }, // B♭3
    { freq: 207.65, type: "triangle", at: 0.1, duration: 0.22, peak: 0.4 }, // A♭3
  ],
  chime: () => [
    { freq: 523.25, duration: 0.5, peak: 0.45 }, // C5
    { freq: 659.25, at: 0.06, duration: 0.5, peak: 0.4 }, // E5
    { freq: 1046.5, at: 0.06, duration: 0.4, peak: 0.12 }, // C6 sheen
  ],
  notify: () => [{ freq: 987.77, duration: 0.14, peak: 0.3 }], // B5, very soft
  fanfare: () => [
    { freq: 523.25, type: "triangle", duration: 0.14, peak: 0.5 }, // C5
    { freq: 659.25, type: "triangle", at: 0.09, duration: 0.14, peak: 0.5 }, // E5
    { freq: 783.99, type: "triangle", at: 0.18, duration: 0.14, peak: 0.5 }, // G5
    { freq: 1046.5, type: "triangle", at: 0.27, duration: 0.34, peak: 0.55 }, // C6
    // Closing chord under the top note.
    { freq: 523.25, at: 0.27, duration: 0.42, peak: 0.28 },
    { freq: 659.25, at: 0.27, duration: 0.42, peak: 0.28 },
    { freq: 783.99, at: 0.27, duration: 0.42, peak: 0.22 },
  ],
};

/**
 * Play one synthesized cue. Never throws; a browser without Web Audio, a
 * suspended context, or a rapid re-trigger all end in silence, not an error.
 */
export function playTone(kind: SoundKind, opts?: { pitch?: number }): void {
  try {
    const now = performance.now();
    const last = lastPlayed.get(kind);
    if (last !== undefined && now - last < MIN_REPLAY_MS) return;
    lastPlayed.set(kind, now);
    const voices = RECIPES[kind](opts?.pitch ?? 0.5);
    withRunningContext((ctx) => playVoices(ctx, voices));
  } catch {
    // Audio is decoration; a failure here must never surface.
  }
}
