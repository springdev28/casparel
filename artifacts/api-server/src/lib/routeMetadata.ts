/**
 * @fileOverview Backend domain role: centralizes Route Metadata logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
/**
 * Giving each address its own page.
 *
 * The frontend renders in the browser, so the server has one HTML shell and
 * every address got it verbatim — including
 * `<link rel="canonical" href="https://casparel.com/">`. A canonical tag is not
 * a hint, it is a declaration that this page *is* that other page, so every
 * route on the site declared itself to be the home page. Search Console showed
 * the result: a handful of addresses reported as a redirect or "discovered,
 * currently not indexed", and only the home page ever indexed. The library — the
 * page the product is about — was one of the ones being thrown away.
 *
 * The fix is to fill the shell in per route before sending it. The route list
 * lives in the frontend build (scripts/generate-seo.mjs writes
 * `_seo/routes.json` next to the sitemap it is derived from) so the sitemap and
 * the pages it points at cannot disagree. A build without that file gets the old
 * single-shell behaviour rather than an error.
 */

export type RouteMetadata = {
  title: string;
  description: string;
  /** Heading for the no-JavaScript version of the page. */
  heading?: string;
  canonical: string;
  /** Served, but not offered for indexing. Sign-in forms have nothing to rank. */
  noindex?: boolean;
};

export type RouteMetadataFile = {
  origin: string;
  routes: Record<string, RouteMetadata>;
};

/** Only the shapes we are going to substitute; anything else is ignored. */
export function parseRouteMetadata(raw: string): Record<string, RouteMetadata> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  const routes = (parsed as RouteMetadataFile | null)?.routes;
  if (!routes || typeof routes !== "object") return {};
  const usable: Record<string, RouteMetadata> = {};
  for (const [path, value] of Object.entries(routes)) {
    if (
      path.startsWith("/") &&
      typeof value?.title === "string" &&
      typeof value?.description === "string" &&
      typeof value?.canonical === "string"
    )
      usable[path] = value;
  }
  return usable;
}

/**
 * The route a request is for.
 *
 * Trailing slashes are the same page: redirecting to normalise them is what puts
 * "Page with redirect" in a crawl report, so both spellings are served.
 */
export function routeKey(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Replace the content of a meta tag identified by one of its other attributes.
 *
 * Written as a targeted substitution rather than a template so the shell stays a
 * real, valid, editable HTML file: it is what the dev server serves and what the
 * home page gets unaltered.
 */
function setMetaContent(
  html: string,
  attribute: "name" | "property",
  key: string,
  value: string,
): string {
  const pattern = new RegExp(
    `(<meta\\s+${attribute}="${key}"\\s+content=")[^"]*(")`,
    "i",
  );
  return html.replace(pattern, `$1${escapeHtml(value)}$2`);
}

/**
 * The shell, filled in for one route.
 *
 * Returns the shell unchanged when there is nothing recorded for the route, so
 * an address that is not in the list is no worse off than before.
 */
export function renderRouteShell(
  shell: string,
  metadata: RouteMetadata | undefined,
): string {
  if (!metadata) return shell;
  let html = shell.replace(
    /<title>[^<]*<\/title>/i,
    `<title>${escapeHtml(metadata.title)}</title>`,
  );
  html = setMetaContent(html, "name", "description", metadata.description);
  html = setMetaContent(html, "property", "og:title", metadata.title);
  html = setMetaContent(
    html,
    "property",
    "og:description",
    metadata.description,
  );
  html = setMetaContent(html, "property", "og:url", metadata.canonical);
  html = setMetaContent(html, "name", "twitter:title", metadata.title);
  html = setMetaContent(
    html,
    "name",
    "twitter:description",
    metadata.description,
  );
  html = setMetaContent(
    html,
    "name",
    "robots",
    metadata.noindex ? "noindex, follow" : "index, follow",
  );
  html = html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/i,
    `$1${escapeHtml(metadata.canonical)}$2`,
  );
  if (metadata.heading)
    html = html.replace(
      /(<h1>)[^<]*(<\/h1>)/i,
      `$1${escapeHtml(metadata.heading)}$2`,
    );
  return html;
}
