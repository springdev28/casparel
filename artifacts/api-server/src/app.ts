import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import router from "./routes";
import loginCompatRouter from "./routes/loginCompat";
import { logger } from "./lib/logger";
import { authAccountLimiter, authLimiter, globalLimiter } from "./lib/limiters";
import {
  parseRouteMetadata,
  renderRouteShell,
  routeKey,
} from "./lib/routeMetadata";

const app: Express = express();
const configuredOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? process.env.APP_URL ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

function originMatchesHost(origin: string, host?: string) {
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

app.disable("x-powered-by");

// Trust the Replit / reverse-proxy HTTPS termination layer so that
// req.protocol correctly returns "https" and req.ip reflects the real client.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;
    const allowed =
      !origin ||
      originMatchesHost(origin, req.headers.host) ||
      configuredOrigins.has(origin.replace(/\/$/, ""));
    callback(null, {
      origin: allowed ? origin ?? false : false,
      methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
      maxAge: 86_400,
    });
  }),
);
app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
  ].join("; "));
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use(express.json({ limit: "2mb", strict: true }));
app.use(express.urlencoded({ extended: true, limit: "256kb", parameterLimit: 100 }));

app.use("/api", (req, res, next) => {
  if (req.headers.authorization || req.path.startsWith("/auth/")) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
  }
  next();
});
app.use("/api", globalLimiter);
// Credential endpoints are rate limited HERE, at the mount point, not inside
// the router that serves them. Two routers below both declare POST
// /auth/login, and Express hands the request to whichever is mounted first,
// so a limiter attached to one handler protects nothing if the other wins.
// That is what happened: loginCompatRouter shadowed the limited route and
// left password guessing capped only by the 100/min global limiter.
app.use("/api/auth/login", authLimiter, authAccountLimiter);
app.use("/api/auth/register", authLimiter, authAccountLimiter);
app.use("/api", loginCompatRouter);
app.use("/api", router);

/**
 * Extensions the frontend build emits. A request for one of these that
 * `express.static` did not answer is a file that is not on disk.
 *
 * A list rather than "any path with a dot in it", so a client-side route can
 * always carry a dot in an id or a slug without being mistaken for a file.
 */
const ASSET_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".css", ".map",
  ".json", ".txt", ".xml", ".webmanifest",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".ico",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".wasm", ".mp3", ".mp4", ".webm",
]);

/** Is this address asking for a build artefact rather than a page? */
export function isAssetRequest(pathname: string): boolean {
  // /assets is the build's own directory. Nothing else is ever served from it,
  // so a miss there is a miss whatever it is named.
  if (pathname.startsWith("/assets/")) return true;
  const extension = path.extname(pathname).toLowerCase();
  return extension !== "" && ASSET_EXTENSIONS.has(extension);
}

if (process.env.NODE_ENV === "production") {
  // FRONTEND_PUBLIC_DIR exists so this branch can be tested. Everything about
  // how a page is served to a crawler lives in here, and it used to be
  // unreachable from a test: the directory was pinned next to the bundle, which
  // only exists after a full build.
  const publicDir = process.env.FRONTEND_PUBLIC_DIR
    ? path.resolve(process.env.FRONTEND_PUBLIC_DIR)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "public");
  const indexFile = path.join(publicDir, "index.html");

  if (!fs.existsSync(indexFile)) {
    logger.error({ publicDir, indexFile }, "Production frontend index.html is missing");
  }

  // Serve robots.txt from the app itself, ahead of express.static, so search
  // engines always get the current directive regardless of what static copy
  // happens to be bundled into this deploy. (A stale bundled robots.txt here
  // was overriding the correct file on the static host and kept Googlebot
  // blocked.) SITE_URL controls the canonical origin for the Sitemap line.
  const siteOrigin = (
    process.env.SITE_URL ?? "https://casparel.com"
  ).replace(/\/+$/, "");
  app.get("/robots.txt", (_req, res) => {
    // no-cache so a previously cached "Disallow" copy can't keep being served.
    res.setHeader("Cache-Control", "no-cache");
    res.type("text/plain");
    res.send(`User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin}/sitemap.xml\n`);
  });

  app.use(express.static(publicDir, {
    setHeaders(res, filePath) {
      if (filePath.includes(path.sep + "assets" + path.sep)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }));

  // What each address is, written by the frontend build alongside the sitemap
  // it is derived from. Read once: the file ships with the bundle and cannot
  // change while the process runs. Missing file means an older bundle, and the
  // shell is served exactly as it was before.
  const routeMetadata = (() => {
    const file = path.join(publicDir, "_seo", "routes.json");
    try {
      return parseRouteMetadata(fs.readFileSync(file, "utf8"));
    } catch {
      logger.warn(
        { file },
        "No per-route page metadata; every address will claim to be the home page",
      );
      return {};
    }
  })();

  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }

    // A file that is not there is not the app.
    //
    // Everything below this line serves index.html, which is right for a
    // client-side route -- /resources/2 is not a file and never was. It was
    // also being done for /assets/index-OLD.js, and that is a different
    // request with a different right answer: the browser asked for a script
    // and got 200 with a page of HTML, so it parsed `<!DOCTYPE html>` as
    // JavaScript and failed.
    //
    // How badly depends on which script it was. A lazy chunk fails inside
    // React, where the error boundary catches it -- but as a syntax error
    // about a `<`, which describes nothing that is actually wrong. The entry
    // script fails before React exists, and then there is no boundary to
    // catch anything: an empty <div id="root">, no message, no reload button,
    // a blank window.
    //
    // A tab reaches this in ordinary use because a deploy removes the
    // previous build's hashed files, so a tab still running the old shell
    // asks for chunks that were deleted minutes ago. Thirteen deploys landed
    // on the day this was found.
    //
    // A missing file is now a 404, which is a thing the browser and the
    // console can both report honestly. Client-side routes are unaffected:
    // they have no file extension, which is what separates the two cases.
    if (isAssetRequest(req.path)) {
      res.status(404).type("text/plain").send("Not found");
      return;
    }

    if (!fs.existsSync(indexFile)) {
      res.status(500).json({
        error: "Frontend build output is missing on the server.",
        expected: "dist/public/index.html",
      });
      return;
    }

    // Filled in for this route: its own title, description and canonical. Sent
    // as a body rather than sendFile because the bytes differ per address —
    // which is the whole point, and why the shell must not be cached publicly.
    const metadata = routeMetadata[routeKey(req.path)];
    if (metadata) {
      try {
        res.setHeader("Cache-Control", "no-cache");
        res.type("html").send(
          renderRouteShell(fs.readFileSync(indexFile, "utf8"), metadata),
        );
        return;
      } catch (error) {
        logger.error({ err: error, path: req.path }, "Could not render the shell");
      }
    }

    res.sendFile(indexFile, (err) => {
      if (err) {
        next(err);
      }
    });
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled request error");
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ error: "Internal server error" });
});

export default app;
