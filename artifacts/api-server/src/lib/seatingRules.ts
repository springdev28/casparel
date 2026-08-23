/**
 * @fileOverview Backend domain role: centralizes Seating Rules logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
export type SeatingNoteSignals = {
  wantsFront: boolean;
  wantsBack: boolean;
  wantsQuiet: boolean;
};

function normalizeNote(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function parseSeatingNote(value: string | null | undefined) {
  const note = normalizeNote(value ?? "");
  const frontRequest =
    /\b(?:front(?:\s+rows?)?|near(?:er)?\s+(?:the\s+)?(?:front|board|teacher)|close(?:r)?\s+to\s+(?:the\s+)?(?:board|teacher))\b/.test(
      note,
    ) || /\b(?:vision|hearing)\b/.test(note);
  const backRequest =
    /\b(?:back(?:\s+rows?)?|at\s+(?:the\s+)?back|towards?\s+(?:the\s+)?back|farther\s+from\s+(?:the\s+)?front)\b/.test(
      note,
    );
  const negatedFront =
    /\b(?:not|never|avoid)\b[^.!?]{0,30}\b(?:front|board|teacher)\b/.test(
      note,
    );
  const negatedBack =
    /\b(?:not|never|avoid)\b[^.!?]{0,30}\bback(?:\s+rows?)?\b/.test(note);

  return {
    wantsFront: frontRequest && !negatedFront,
    wantsBack: backRequest && !negatedBack && !(frontRequest && !negatedFront),
    wantsQuiet:
      /\b(?:quiet(?:er)?|independent(?:ly)?|self-directed|work(?:s)?\s+better\s+alone|fewer\s+distractions?)\b/.test(
        note,
      ),
  } satisfies SeatingNoteSignals;
}

export function relativeFrontDepth(
  front: number,
  minimumFront: number,
  maximumFront: number,
) {
  const range = maximumFront - minimumFront;
  if (range <= 0.001) return 0.5;
  return Math.max(0, Math.min(1, (front - minimumFront) / range));
}

export function depthPreferenceScore(
  front: number,
  minimumFront: number,
  maximumFront: number,
  signals: SeatingNoteSignals,
) {
  const depth = relativeFrontDepth(front, minimumFront, maximumFront) * 100;
  if (signals.wantsFront) return depth * 4;
  if (signals.wantsBack) return (100 - depth) * 4;
  return Math.abs(depth - 50);
}

export function describeSeatDepth(
  front: number,
  minimumFront: number,
  maximumFront: number,
) {
  if (maximumFront - minimumFront <= 0.001) return "in the only available row";
  const depth = relativeFrontDepth(front, minimumFront, maximumFront);
  if (depth <= 0.25) return "near the front";
  if (depth >= 0.75) return "toward the back";
  return "in the middle area";
}

export function seatingPreferenceReasons(signals: SeatingNoteSignals) {
  const reasons: string[] = [];
  if (signals.wantsFront) {
    reasons.push("The private note explicitly requests a front-area seat.");
  }
  if (signals.wantsBack) {
    reasons.push("The private note explicitly requests a back-area seat.");
  }
  if (signals.wantsQuiet) {
    reasons.push(
      "The private note requests a quieter or more independent placement.",
    );
  }
  return reasons;
}
