/**
 * What a crawler gets when it asks the real app for a page.
 *
 * This drives the production branch of app.ts — the one that serves the built
 * frontend — with the genuine HTML shell and the genuine metadata the frontend
 * build writes. It exists because the defect it covers was invisible from
 * inside the app: every route returned HTTP 200 with a perfectly good page that
 * declared, in its canonical tag, that it was the home page. Nothing was broken
 * except the part only a search engine reads.
 */
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const chain: Record<string | symbol, unknown> = {};
  const proxy: unknown = new Proxy(chain, {
    get(_target, property) {
      if (property === "then")
        return (resolvePromise: (value: unknown[]) => unknown) =>
          resolvePromise([]);
      return () => proxy;
    },
  });
  return {
    ...actual,
    db: proxy,
    pool: { query: async () => ({ rows: [] }), end: async () => {} },
    runMigrations: async () => {},
  };
});

const here = dirname(fileURLToPath(import.meta.url));
/** The build output the server is pointed at, assembled as a deploy would. */
const publicDir = mkdtempSync(join(tmpdir(), "casparel-public-"));
let app: Express;

beforeAll(async () => {
  cpSync(resolve(here, "../../app/index.html"), join(publicDir, "index.html"));
  mkdirSync(join(publicDir, "_seo"), { recursive: true });
  // Exactly what scripts/generate-seo.mjs writes, including a page that is
  // served but deliberately not offered for indexing.
  writeFileSync(
    join(publicDir, "_seo", "routes.json"),
    JSON.stringify({
      origin: "https://casparel.com",
      routes: {
        "/": {
          title: "Casparel: Student & Teacher App",
          description: "Discover resources, manage classes, and stay organised.",
          heading: "Casparel: learn, organise, study",
          canonical: "https://casparel.com/",
        },
        "/resources": {
          title: "Open education library — Casparel",
          description: "Search a free library of open textbooks and courses.",
          heading: "The open education library",
          canonical: "https://casparel.com/resources",
        },
        "/auth/login": {
          title: "Sign in — Casparel",
          description: "Sign in to Casparel.",
          canonical: "https://casparel.com/auth/login",
          noindex: true,
        },
      },
    }),
  );

  process.env.NODE_ENV = "production";
  process.env.FRONTEND_PUBLIC_DIR = publicDir;
  vi.resetModules();
  app = (await import("./app")).default;
});

afterAll(() => {
  process.env.NODE_ENV = "test";
  delete process.env.FRONTEND_PUBLIC_DIR;
});

describe("a page a search engine asks for", () => {
  it("says it is itself, not the home page", async () => {
    const res = await request(app).get("/resources");
    expect(res.status).toBe(200);
    expect(res.text).toContain(
      '<link rel="canonical" href="https://casparel.com/resources" />',
    );
    expect(res.text).toContain("<title>Open education library — Casparel</title>");
  });

  it("says the same thing with a trailing slash, without a redirect", async () => {
    // A redirect here is reported as "Page with redirect" and the page is not
    // indexed, so both spellings serve the page rather than bouncing.
    const res = await request(app).get("/resources/");
    expect(res.status).toBe(200);
    expect(res.text).toContain(
      '<link rel="canonical" href="https://casparel.com/resources" />',
    );
  });

  it("keeps a sign-in form out of the index", async () => {
    const res = await request(app).get("/auth/login");
    expect(res.text).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it("still serves the home page as the home page", async () => {
    const res = await request(app).get("/");
    expect(res.text).toContain('<link rel="canonical" href="https://casparel.com/" />');
    expect(res.text).toContain("<title>Casparel: Student &amp; Teacher App</title>");
  });

  it("serves an address it has no metadata for", async () => {
    const res = await request(app).get("/dashboard");
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root"></div>');
  });

  it("still points crawlers at the sitemap", async () => {
    const res = await request(app).get("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Sitemap: https://casparel.com/sitemap.xml");
  });

  it("does not let a page be cached as if it were every page", async () => {
    const res = await request(app).get("/resources");
    expect(res.headers["cache-control"]).toContain("no-cache");
  });
});
