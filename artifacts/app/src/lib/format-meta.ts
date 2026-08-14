/**
 * Join resource metadata fields (subject, grade, format, …) into a single
 * "A · B" line, dropping anything empty or a stringified null/undefined.
 *
 * Some catalogue entries, notably resources ingested from remote sources , 
 * can carry the literal strings "undefined" or "null" in optional fields.
 * Rendering `{subject} · {grade}` directly then shows "undefined · …". This
 * guards every display site so that noise never reaches the UI, regardless of
 * upstream data quality.
 */
export function metaLine(
  ...parts: Array<string | null | undefined>
): string {
  return parts
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0 && !/^(undefined|null)$/i.test(part))
    .join(" · ");
}
