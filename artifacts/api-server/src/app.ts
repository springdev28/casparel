import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import router from "./routes";
import loginCompatRouter from "./routes/loginCompat";
import { logger } from "./lib/logger";
import { globalLimiter } from "./lib/limiters";

const app: Express = express();

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", globalLimiter);
app.use("/api", loginCompatRouter);
app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const publicDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "public",
  );
  const indexFile = path.join(publicDir, "index.html");

  if (!fs.existsSync(indexFile)) {
    logger.error({ publicDir, indexFile }, "Production frontend index.html is missing");
  }

  app.use(express.static(publicDir));
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
