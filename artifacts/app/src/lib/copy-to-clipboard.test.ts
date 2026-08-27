/**
 * @fileOverview Verification role: guards the permission-independent clipboard fallback used by support.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./copy-to-clipboard";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("copyTextToClipboard", () => {
  it("uses the synchronous selection fallback before a denied Clipboard API", async () => {
    const remove = vi.fn();
    const field = {
      value: "",
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
      remove,
    };
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("document", {
      createElement: vi.fn(() => field),
      body: { appendChild: vi.fn() },
      execCommand: vi.fn(() => true),
    });
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyTextToClipboard("support@casparel.com")).resolves.toBe(
      true,
    );
    expect(field.value).toBe("support@casparel.com");
    expect(writeText).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("uses the modern API when selection copying is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyTextToClipboard("support@casparel.com")).resolves.toBe(
      true,
    );
    expect(writeText).toHaveBeenCalledWith("support@casparel.com");
  });
});
