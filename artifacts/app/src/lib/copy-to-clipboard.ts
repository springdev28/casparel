/**
 * Copies text during the user's click without requiring Clipboard API
 * permission. The legacy selection path is intentionally first: embedded
 * browsers commonly expose navigator.clipboard but reject every write.
 */
export async function copyTextToClipboard(value: string): Promise<boolean> {
  if (typeof document !== "undefined") {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.setAttribute("aria-hidden", "true");
    Object.assign(field.style, {
      position: "fixed",
      left: "-9999px",
      opacity: "0",
      pointerEvents: "none",
    });
    document.body.appendChild(field);
    field.focus();
    field.select();
    field.setSelectionRange(0, value.length);

    try {
      if (document.execCommand("copy")) return true;
    } catch {
      // Continue to the modern API below.
    } finally {
      field.remove();
    }
  }

  try {
    if (!globalThis.navigator?.clipboard?.writeText) return false;
    await globalThis.navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
