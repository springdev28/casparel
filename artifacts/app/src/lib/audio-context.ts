/** Unlock audio synchronously during a gesture; lazy sound recipes share this context. */
/** Keeps celebration cues under speech level even with several voices. */
const MASTER_GAIN = 0.16;
/**
 * How long a cue waiting on a suspended context stays worth playing. resume()
 * only settles once the page has a user gesture, so a cue queued before that
 * (a failed request toasting on load, say) would otherwise fire minutes later
 * on the first click, stacked with whatever that click plays.
 */
const RESUME_GRACE_MS = 400;

let context: AudioContext | null = null;
let master: GainNode | null = null;

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
export function withRunningContext(play: (ctx: AudioContext) => void): void {
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

/** Unlock during pointer/key activation, before asynchronous work drops the gesture. */
export function prepareAudio(): void {
  try { const ctx = ensureContext(); if (ctx?.state === 'suspended') void ctx.resume().catch(() => {}); } catch {}
}


export function masterGain(): GainNode | null { return master; }
