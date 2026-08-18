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
