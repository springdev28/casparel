/**
 * @fileOverview Backend domain role: centralizes Step Activity logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */

/**
 * What to actually do with a path step.
 *
 * The workflow specification lists eight kinds of study activity — reading or
 * watching, active recall, quiz, practice problems, explain-back, reflection,
 * source comparison, review checkpoint — and says to choose according to the
 * material and the goal. Choosing needs facts about both, and this product has
 * exactly three: what the material is (its format), what the learner said it
 * was for (the role they gave it in the list the path came from), and whether
 * they have a study set in the subject.
 *
 * So this decides between five things it can actually offer, and each branch
 * rests on one of those three facts. It does not invent a curriculum: there is
 * no branch here for "explain-back" or "source comparison", because nothing in
 * the product produces either and naming one would be a screen telling
 * somebody to do a thing that is not there.
 *
 * "Do not equate opening a resource with learning" is the specification's
 * warning and this is where it bites: the suggestion is what to do, and the
 * step is finished by the learner saying so, not by the resource opening.
 */

export type StepActivityKind =
  /** A video: watch it. */
  | "watch"
  /** A podcast: listen to it. */
  | "listen"
  /** Something interactive, or something the learner marked as practice. */
  | "practise"
  /** An article, a PDF, anything else with a resource on it: read it. */
  | "read"
  /** No resource on the step: its query is a search, so go and find one. */
  | "find";

export type StepActivitySuggestion = {
  kind: StepActivityKind;
  /** Why this kind, so a screen can be honest about the reason. */
  because: "role" | "format" | "no_resource";
  /** A study set of the learner's in the same subject, when they have one. */
  recallActivityId: number | null;
};

export type StepActivityFacts = {
  /** The format of the step's resource, when the step has one. */
  format?: string | null;
  /** What the learner said the resource was for, in the list it came from. */
  role?: string | null;
  /** The learner's own study set in this goal's subject, if any. */
  recallActivityId?: number | null;
};

export function suggestStepActivity(
  facts: StepActivityFacts,
): StepActivitySuggestion {
  const recallActivityId = facts.recallActivityId ?? null;

  // Nothing attached: the step is a search intent, and the honest next move is
  // to go and find something rather than to pretend there is material here.
  if (!facts.format) {
    return { kind: "find", because: "no_resource", recallActivityId };
  }

  // What the learner said wins over what the catalogue recorded. They labelled
  // this resource as the thing to practise on; the format is only evidence
  // about the file.
  if (facts.role === "practice") {
    return { kind: "practise", because: "role", recallActivityId };
  }

  const byFormat: Record<string, StepActivityKind> = {
    video: "watch",
    podcast: "listen",
    interactive: "practise",
  };
  return {
    kind: byFormat[facts.format] ?? "read",
    because: "format",
    recallActivityId,
  };
}
