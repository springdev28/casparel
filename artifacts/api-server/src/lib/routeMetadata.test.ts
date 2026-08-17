/**
 * Filling the HTML shell in for one route.
 *
 * These run against the real `artifacts/app/index.html`, not a fixture. The
 * substitutions are targeted at the tags that shell actually contains, so a
 * fixture would let the shell be edited into a shape they no longer match — and
 * the failure mode is silent: every page goes back to claiming it is the home
 * page, and Search Console quietly stops indexing the rest of the site.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseRouteMetadata,
  renderRouteShell,
  routeKey,
} from "./routeMetadata";

const SHELL = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/index.html",
  ),
  "utf8",
);

const LIBRARY = {
  title: "Open education library — Casparel",
  description: "Search a free library of open textbooks and courses.",
  heading: "The open education library",
  canonical: "https://casparel.com/resources",
};

describe("renderRouteShell", () => {
  it("gives the route its own canonical, so it is not a copy of the home page", () => {
    const html = renderRouteShell(SHELL, LIBRARY);
    expect(html).toContain(
      '<link rel="canonical" href="https://casparel.com/resources" />',
    );
    expect(html).not.toContain('<link rel="canonical" href="https://casparel.com/" />');
  });

  it("gives it its own title and description, everywhere they appear", () => {
    const html = renderRouteShell(SHELL, LIBRARY);
    expect(html).toContain(`<title>${LIBRARY.title}</title>`);
    for (const attribute of [
      'name="description"',
      'property="og:description"',
      'name="twitter:description"',
    ])
      expect(html).toContain(`<meta ${attribute} content="${LIBRARY.description}" />`);
    for (const attribute of ['property="og:title"', 'name="twitter:title"'])
      expect(html).toContain(`<meta ${attribute} content="${LIBRARY.title}" />`);
    expect(html).toContain(
      '<meta property="og:url" content="https://casparel.com/resources" />',
    );
    // The shell's own values are gone, not merely joined by the new ones.
    expect(html).not.toContain("Casparel: Student &amp; Teacher App");
  });

  it("replaces the heading a reader without JavaScript sees", () => {
    expect(renderRouteShell(SHELL, LIBRARY)).toContain(
      "<h1>The open education library</h1>",
    );
  });

  it("keeps a page out of the index when it is asked to", () => {
    const html = renderRouteShell(SHELL, {
      ...LIBRARY,
      title: "Sign in — Casparel",
      noindex: true,
    });
    expect(html).toContain('<meta name="robots" content="noindex, follow" />');
    expect(html).not.toContain('content="index, follow"');
  });

  it("says index, follow for an ordinary page", () => {
    expect(renderRouteShell(SHELL, LIBRARY)).toContain(
      '<meta name="robots" content="index, follow" />',
    );
  });

  it("escapes what it substitutes", () => {
    const html = renderRouteShell(SHELL, {
      ...LIBRARY,
      title: 'Bad" onload="x',
      description: "<script>alert(1)</script>",
    });
    expect(html).toContain("Bad&quot; onload=&quot;x");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("leaves the shell alone for a route it knows nothing about", () => {
    expect(renderRouteShell(SHELL, undefined)).toBe(SHELL);
  });
});

describe("routeKey", () => {
  it("treats a trailing slash as the same page", () => {
    // Redirecting to normalise the slash is what puts "Page with redirect" in a
    // crawl report, so both spellings are served the same page instead.
    expect(routeKey("/resources/")).toBe("/resources");
    expect(routeKey("/resources")).toBe("/resources");
    expect(routeKey("/")).toBe("/");
    expect(routeKey("")).toBe("/");
  });
});

describe("parseRouteMetadata", () => {
  it("reads what the frontend build writes", () => {
    const routes = parseRouteMetadata(
      JSON.stringify({
        origin: "https://casparel.com",
        routes: { "/resources": LIBRARY },
      }),
    );
    expect(routes["/resources"].title).toBe(LIBRARY.title);
  });

  it("ignores entries it could not use, rather than serving half a page", () => {
    const routes = parseRouteMetadata(
      JSON.stringify({
        routes: {
          "/ok": LIBRARY,
          "/no-canonical": { title: "t", description: "d" },
          "not-a-path": LIBRARY,
        },
      }),
    );
    expect(Object.keys(routes)).toEqual(["/ok"]);
  });

  it("survives a file that is not the file it expects", () => {
    for (const raw of ["", "null", "[]", "{}", "not json at all"])
      expect(parseRouteMetadata(raw)).toEqual({});
  });
});
