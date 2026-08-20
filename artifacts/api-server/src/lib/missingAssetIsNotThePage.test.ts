/**
 * A build file that is not on the server is a 404, not the app shell.
 *
 * The SPA fallback is right for a page: /resources/2 is not a file, has never
 * been a file, and the browser asking for it should get index.html so the
 * router can take over. It was also being applied to /assets/index-OLD.js,
 * and that is a different request with a different right answer.
 *
 * What it did instead: 200, content-type text/html, a page of markup. The
 * browser had asked for a module, so it parsed `<!DOCTYPE html>` as
 * JavaScript and failed.
 *
 * How badly depends on which script it was. A lazy chunk fails inside React,
 * where the error boundary catches it -- but as a syntax error about a `<`,
 * which describes nothing that is actually wrong, so whoever reads the
 * console learns nothing. The entry script fails before React exists, and
 * then there is no boundary to catch anything: an empty <div id="root">, no
 * message, no reload button, a blank window and a tab that looks like it is
 * still loading.
 *
 * It is not a hypothetical. A deploy replaces the previous build's hashed
 * files, so a tab still running the old shell asks for chunks that were
 * deleted minutes ago. Thirteen deploys landed on the day this was written,
 * and casparel.com/assets/index-BL0GGthY.css -- real output from an earlier
 * build that same day -- answered 200 with text/html.
 *
 * The distinction the fix rests on: a client-side route has no file
 * extension, and a build artefact always does.
 */
import { describe, expect, it } from "vitest";
import { isAssetRequest } from "../app";

describe("a request for a file the build did not leave behind", () => {
  it("is recognised as a file, not a page", () => {
    const files = [
      "/assets/index-Cte31tFm.js",
      "/assets/index-BL0GGthY.css",
      "/assets/ResourceDetailPage-D9nUuMPq.js",
      "/assets/space-grotesk-latin.woff2",
      "/assets/logo.svg",
      // No extension, but /assets is the build's own directory and nothing
      // else is served from it.
      "/assets/whatever",
      "/sw.js",
      "/service-worker.js",
      "/manifest.webmanifest",
      "/favicon.ico",
      "/some/nested/chunk.map",
      // Case is not a signal: a server that answers .JS with a page has the
      // same bug as one that answers .js with a page.
      "/assets/Thing-ABCDEFGH.JS",
    ];
    for (const file of files) {
      expect(isAssetRequest(file), `${file} should be treated as a file`).toBe(
        true,
      );
    }
  });

  it("does not swallow a page the router owns", () => {
    const routes = [
      "/",
      "/resources",
      "/resources/2",
      "/classes/31",
      "/canvases/12",
      "/profile/2",
      "/auth/login",
      "/plans",
      "/guide",
      // The query string is not part of req.path, but a tab is a route.
      "/classes/31",
      // A slug with a dot in it is still a page. This is why the check is a
      // list of known extensions rather than "does it contain a dot" -- the
      // cheap version of this fix would 404 somebody's profile.
      "/profile/ada.karahan",
      "/lists/my.reading.list",
    ];
    for (const route of routes) {
      expect(isAssetRequest(route), `${route} should be served the app`).toBe(
        false,
      );
    }
  });

  it("covers every extension the frontend build actually emits", async () => {
    // Not a fixed list held against itself: whatever is in dist/public right
    // now has to be recognised. A build that starts emitting a new kind of
    // file -- a new font format, a new media type -- fails here rather than
    // silently going back to answering it with a page of HTML.
    const { readdirSync, existsSync } = await import("node:fs");
    const { resolve, extname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const publicDir = resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "../../../app/dist/public",
    );
    if (!existsSync(publicDir)) return; // No build here; CI builds before it runs.

    const extensions = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(dir, entry.name));
        else if (entry.name !== "index.html") {
          const extension = extname(entry.name).toLowerCase();
          if (extension) extensions.add(extension);
        }
      }
    };
    walk(publicDir);

    const unrecognised = [...extensions].filter(
      (extension) => !isAssetRequest(`/file${extension}`),
    );
    expect(
      unrecognised,
      "the build emits these, so a request for one that is missing would be " +
        "answered with index.html and parsed as the wrong kind of file",
    ).toEqual([]);
  });
});
