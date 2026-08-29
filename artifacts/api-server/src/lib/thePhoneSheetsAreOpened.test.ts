/**
 * @fileOverview Verification role: exercises The Phone Sheets Are Opened.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every sheet on the phone is opened by something.
 *
 * A `<Modal>` is markup that does not exist until somebody taps. Four of the
 * phone's were opened and five were not, and the five held six form fields
 * with no accessible name and five labels that were English in Turkish --
 * none of which any of the three existing checks could see. The source scan
 * reads sentences, and "Duration (min) *" is not one. The render comparison
 * only looks at what is drawn. The failure audit renders these screens with
 * nothing to show.
 *
 * So this counts the modals in the app and requires each file that has one to
 * be opened by `audit-languages.mjs`, or named below with the reason it is
 * not. The unit is a file rather than a modal, for the same reason as the web
 * guard next door: naming every one is a bigger thing to keep true than it is
 * worth.
 *
 * What that costs is worth stating. A file with two modals and one opened
 * passes -- `app/lists/[id].tsx` has the role picker and is credited for the
 * path preview beside it -- so this catches a sheet nothing reaches, not a
 * sheet whose neighbour is reached. Measured while proving it: breaking the
 * role picker's open step changed nothing, and breaking the save sheet's,
 * which is a component of its own, named it at once.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const mobile = join(repository, "artifacts/mobile");

/**
 * Files with a modal that nothing opens, and why.
 *
 * Each row has to say something about the modal rather than about nobody
 * having got to it.
 */
const NOT_OPENED: Record<string, string> = {
  "app/(tabs)/profile.tsx":
    "its modal confirms closing an account, and the only way in is an " +
    "Alert.alert -- the platform's own dialog, which does not appear on the " +
    "web at all, so there is nothing here to tap through",
  "components/ErrorFallback.tsx":
    "the error boundary's own screen, which is reached by a crash rather " +
    "than by a tap; audit-failures.mjs is what renders it",
};

/** Every source file under the app that draws a modal. */
function filesWithModals(): string[] {
  const found: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(join(mobile, dir), { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), `${relative}/`);
        continue;
      }
      if (!entry.name.endsWith(".tsx")) continue;
      const source = readFileSync(join(mobile, dir, entry.name), "utf8");
      if (/<Modal\b/.test(source)) found.push(relative);
    }
  };
  walk("app", "app/");
  walk("components", "components/");
  return found.sort();
}

/**
 * Which files the audit reaches.
 *
 * Two hops, because a sheet is usually a component of its own opened from the
 * screen that renders it. First the files that carry a control the audit
 * presses -- a testid, or the accessible label it clicks by -- and then the
 * modal-bearing components those files import. One hop was the first version
 * and it reported three sheets as unopened while the audit was opening all
 * three, because the button is never in the same file as the sheet.
 */
function openedFiles(): Set<string> {
  const audit = readFileSync(join(mobile, "scripts/audit-languages.mjs"), "utf8");
  const at = audit.indexOf("const SCREENS = [");
  const list = audit.slice(at, audit.indexOf("\n];", at));
  const presses = [
    ...[...list.matchAll(/testId:\s*"([^"]+)"/g)].map((m) => `testID="${m[1]}"`),
    ...[...list.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]),
  ];

  const everyFile: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(join(mobile, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), `${prefix}${entry.name}/`);
        continue;
      }
      if (entry.name.endsWith(".tsx")) everyFile.push(`${prefix}${entry.name}`);
    }
  };
  walk("app", "app/");
  walk("components", "components/");

  const source = new Map(
    everyFile.map((file) => [file, readFileSync(join(mobile, file), "utf8")]),
  );
  const pressedIn = everyFile.filter((file) =>
    presses.some((press) => source.get(file)!.includes(press)),
  );

  const opened = new Set(pressedIn);
  for (const file of pressedIn) {
    for (const other of everyFile) {
      const name = other.split("/").pop()!.replace(/\.tsx$/, "");
      // `import { StepCheckInSheet } from "@/components/StepCheckInSheet"`.
      if (new RegExp(`from ["'][^"']*/${name}["']`).test(source.get(file)!)) {
        opened.add(other);
      }
    }
  }
  return opened;
}

describe("the phone's sheets", () => {
  it("found the files and the list", () => {
    // Either silently returning nothing would make the rule below pass by
    // having nothing to check.
    expect(filesWithModals().length).toBeGreaterThanOrEqual(5);
    expect(openedFiles().size).toBeGreaterThanOrEqual(3);
  });

  it("are opened somewhere, or the file says why not", () => {
    const opened = openedFiles();
    const unopened = filesWithModals().filter(
      (file) => !opened.has(file) && !(file in NOT_OPENED),
    );

    expect(
      unopened,
      "these files draw a modal and nothing opens it; add an entry to " +
        "SCREENS in audit-languages.mjs, or a row to NOT_OPENED here with " +
        "the reason it cannot be tapped",
    ).toEqual([]);
  });

  it("has no reason written for a file that is opened after all", () => {
    const opened = openedFiles();
    const stale = Object.keys(NOT_OPENED).filter((file) => opened.has(file));
    expect(stale, "these are named as unopened and are opened").toEqual([]);
  });
});
