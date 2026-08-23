/**
 * @fileOverview Backend domain role: centralizes Validation Message logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
/**
 * A validation failure, as a sentence rather than a dump.
 *
 * Sixty-five routes answered a bad request with `parsed.error.message`, and
 * that is not a message: `ZodError.message` is `JSON.stringify(issues)`. The
 * registration endpoint -- the most-used write in the product -- replied to a
 * short password with two hundred characters of JSON, escaped newlines and
 * all.
 *
 * Nobody saw it, because both clients treat an unreadable server string as no
 * string and fall back to their own generic line. That is the cost: the server
 * knows the password is too short and which field is wrong, and every reader
 * got "Could not create your account. Please try again." A dump is worse than
 * nothing, and *this* is better than both.
 *
 * Zod's own issue messages are written for the developer who wrote the schema
 * ("Too small: expected string to have >=8 characters"), so the common codes
 * are turned into ordinary English here and the rest fall back to naming the
 * field, which is still the useful half.
 */

type ZodIssue = {
  code?: string;
  path?: Array<string | number>;
  message?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  origin?: string;
  expected?: string;
  received?: string;
};

type ZodLikeError = { issues?: ZodIssue[]; message?: string };

/** "gradeLevel" → "Grade level", "meetingUrl" → "Meeting url". */
function fieldName(path: Array<string | number> | undefined): string | null {
  const segments = (path ?? []).filter(
    (part): part is string => typeof part === "string",
  );
  const last = segments[segments.length - 1];
  if (!last) return null;
  const spaced = last
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : null;
}

function describeIssue(issue: ZodIssue): string {
  const field = fieldName(issue.path);
  const subject = field ?? "This field";
  const isText = issue.origin === "string" || issue.expected === "string";

  switch (issue.code) {
    case "too_small": {
      const minimum = Number(issue.minimum ?? 0);
      if (isText && minimum <= 1) return `${subject} is required.`;
      if (isText) return `${subject} must be at least ${minimum} characters.`;
      return `${subject} must be at least ${minimum}.`;
    }
    case "too_big": {
      const maximum = Number(issue.maximum ?? 0);
      if (isText) return `${subject} must be ${maximum} characters or fewer.`;
      return `${subject} must be ${maximum} or less.`;
    }
    case "invalid_type": {
      // A missing field and a wrong-typed one arrive the same way. Zod v4 does
      // not always set `received`: for an absent key it says so only in the
      // message, and for a failed coercion it reports "NaN". Both are checked
      // because "required" is right far more often than naming a JSON type,
      // and reads better.
      const absent =
        issue.received === "undefined" ||
        issue.received === "null" ||
        /received (undefined|null)/i.test(issue.message ?? "");
      return absent ? `${subject} is required.` : `${subject} is not valid.`;
    }
    case "invalid_format":
    case "invalid_string":
      if (issue.origin === "email" || /email/i.test(field ?? "")) {
        return "Enter a valid email address.";
      }
      if (issue.origin === "url" || /url|link/i.test(field ?? "")) {
        return `${subject} must be a valid link.`;
      }
      return `${subject} is not in the expected format.`;
    case "invalid_value":
    case "invalid_enum_value":
      return `${subject} is not one of the allowed values.`;
    case "unrecognized_keys":
      return "The request contained fields this endpoint does not accept.";
    default:
      return field ? `${subject} is not valid.` : "The request is not valid.";
  }
}

/**
 * At most this many issues are described. A form with a dozen empty fields
 * produces a dozen issues, and a wall of them helps nobody; the first few name
 * enough to act on.
 */
const MAX_DESCRIBED = 3;

export function validationMessage(
  error: unknown,
  fallback = "The request is not valid.",
): string {
  const issues = (error as ZodLikeError | null)?.issues;
  if (!Array.isArray(issues) || issues.length === 0) return fallback;

  const sentences: string[] = [];
  for (const issue of issues) {
    const sentence = describeIssue(issue);
    if (!sentences.includes(sentence)) sentences.push(sentence);
    if (sentences.length === MAX_DESCRIBED) break;
  }
  /*
   * The caller's fallback wins when nothing specific could be said.
   *
   * Several routes parse an id and pass their own wording -- "Invalid canvas
   * ID" is better than anything derivable from a coercion that produced NaN.
   * When every sentence here is the generic one, theirs is the more useful
   * answer; when even one is specific, ours is.
   */
  const isGeneric = (sentence: string) =>
    sentence === "The request is not valid." || / is not valid\.$/.test(sentence);
  if (sentences.every(isGeneric)) return fallback;

  const described = sentences.join(" ");
  const remaining = issues.length - sentences.length;
  return remaining > 0 ? `${described} (${remaining} more.)` : described;
}
