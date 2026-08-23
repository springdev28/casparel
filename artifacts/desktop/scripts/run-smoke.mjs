#!/usr/bin/env node
/**
 * @fileOverview Verification role: exercises Run Smoke behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { spawnSync } from "node:child_process";

const command = process.platform === "linux" ? "xvfb-run" : process.execPath;
const args =
  process.platform === "linux"
    ? ["-a", process.execPath, "scripts/smoke.mjs"]
    : ["scripts/smoke.mjs"];

const result = spawnSync(command, args, { stdio: "inherit" });
if (result.error) {
  console.error(
    `Could not start the desktop smoke runner: ${result.error.message}`,
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
