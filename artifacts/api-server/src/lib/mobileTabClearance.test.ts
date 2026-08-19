/**
 * Nothing on a tab screen hides under the tab bar.
 *
 * The tab bar is `position: 'absolute'`, so it floats over the content and
 * nothing reserves space for it; each scrolling tab has to add that space
 * itself. Three of the five added 80, the profile screen added 32, and the
 * dashboard added nothing at all.
 *
 * That is not a margin quibble. Scrolled all the way to the bottom, the
 * profile screen's last card -- "Delete account" -- was behind the bar and
 * could not be touched. An account holder is entitled to reach it, and Apple's
 * review guidelines require an app that offers sign-up to offer deletion in
 * the app; a control that renders and cannot be pressed is not offered. The
 * dashboard lost the end of Recent Activity the same way.
 *
 * Nothing catches this. Every one of those screens renders, scrolls, and
 * screenshots perfectly -- you only see it at the very bottom of a list long
 * enough to reach it, which a fresh test account never has.
 *
 * So the number lives in one place and this holds the screens to it. It reads
 * the source because the alternative is a layout engine and a device.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "../../../mobile");
const tabs = join(mobile, "app", "(tabs)");

/** The screens with a tab bar over them; `_layout` draws the bar itself. */
function tabScreens(): string[] {
  return readdirSync(tabs)
    .filter((name) => name.endsWith(".tsx") && !name.startsWith("_"))
    .sort();
}

describe("every tab screen", () => {
  it.each(tabScreens())("leaves room for the tab bar in %s", (file) => {
    const source = readFileSync(join(tabs, file), "utf8");

    // A screen that does not scroll cannot hide anything below the fold.
    const scrolls = /<(ScrollView|FlatList|SectionList)\b/.test(source);
    if (!scrolls) return;

    expect(
      source,
      `${file} scrolls, so its content has to clear the floating tab bar: ` +
        `add paddingBottom: insets.bottom + TAB_BAR_CLEARANCE to the ` +
        `contentContainerStyle (see utils/tab-bar.ts)`,
    ).toMatch(/paddingBottom:\s*insets\.bottom\s*\+\s*TAB_BAR_CLEARANCE/);

    // A literal beside the shared constant is how the two different numbers
    // happened in the first place.
    const literals = source
      .split("\n")
      .filter((line) => /paddingBottom:\s*insets\.bottom\s*\+\s*\d+/.test(line))
      // A modal sheet covers the tab bar rather than sitting under it, so its
      // own inset padding is its own business.
      .filter((line) => !/sheetContainer/.test(line));
    expect(literals, `${file} should use TAB_BAR_CLEARANCE, not a number`).toEqual([]);
  });

  it("keeps the clearance in one place", () => {
    const shared = readFileSync(join(mobile, "utils", "tab-bar.ts"), "utf8");
    expect(shared).toMatch(/export const TAB_BAR_CLEARANCE = \d+/);
  });
});
