// Loads a .env file before anything else in the process initializes.
//
// The server reads process.env directly and several modules (@workspace/db,
// auth, the OpenAI integration) throw at import time when a required variable
// is missing. On hosts that inject env vars for us (Replit, a correctly-bound
// Passenger app) this is a no-op — dotenv never overrides variables that are
// already set. It only matters when the platform's injection is unavailable
// (e.g. after a domain rename detaches the deployment's env binding), in which
// case an operator can drop a .env next to the app and the server reads it.
//
// This file is imported for its side effect as the FIRST import in index.ts,
// so it runs before the guarded modules. It must not import anything from the
// app itself.
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Search, in order, the working directory and every directory from the bundle
// up to the app root. Passenger's working directory is not guaranteed to be the
// app root, so we do not rely on cwd alone. The first .env found wins.
const bundleDir = dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.cwd(),
  bundleDir,
  resolve(bundleDir, ".."),
  resolve(bundleDir, "..", ".."),
  resolve(bundleDir, "..", "..", ".."),
  resolve(bundleDir, "..", "..", "..", ".."),
];

for (const dir of candidates) {
  const candidate = resolve(dir, ".env");
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}
