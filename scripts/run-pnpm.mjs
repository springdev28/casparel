import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error?.code === "ENOENT") {
    return false;
  }

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

const npmExecPath = process.env.npm_execpath;

if (npmExecPath?.includes("pnpm")) {
  if (existsSync(npmExecPath)) {
    run(process.execPath, [npmExecPath, ...args]);
  } else {
    run(npmExecPath, args);
  }
}

if (run("corepack", ["pnpm", ...args]) === false) {
  run("pnpm", args);
}

console.error("Unable to find pnpm. Tried npm_execpath, corepack, and pnpm on PATH.");
process.exit(1);
