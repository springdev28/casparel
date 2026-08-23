#!/usr/bin/env node
/**
 * @fileOverview Keeps a concise role-and-connection header in every authored source file and
 * regenerates the repository-wide file index used by docs/codebase-guide.md.
 *
 * This script deliberately excludes generated API clients, migration history, vendored files,
 * binary assets, and dependency outputs. Those files are catalogued in the index instead of
 * being edited, because comments would either be overwritten or could invalidate an artifact.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = new Set(process.argv.slice(2));
const shouldWrite = args.has("--write");
const shouldWriteIndex = args.has("--index") || shouldWrite;
const marker = "@fileOverview";

const commentableExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".mjs",
  ".mts",
  ".py",
  ".sh",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const excludedPrefixes = [
  ".pnpm-store/",
  "artifacts/schoolar-edu/src/generated/",
  "attached_assets/",
  "deliverables/",
  "lib/api-client-react/src/generated/",
  "lib/api-zod/src/generated/",
  "lib/db/migrations/",
  "node_modules/",
  "output/",
  "patches/",
];

const excludedSegments = ["/.expo/", "/.generated/", "/build/", "/coverage/", "/dist/", "/node_modules/"];

function trackedAndUntrackedFiles() {
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
  });

  return [...new Set(output.split("\0").filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function isExcluded(path) {
  return excludedPrefixes.some((prefix) => path.startsWith(prefix)) ||
    excludedSegments.some((segment) => `/${path}`.includes(segment));
}

function humanize(path) {
  const name = path.split("/").at(-1)?.replace(/\.[^.]+$/, "") ?? path;
  return name
    .replace(/^\+/, "")
    .replace(/^\[|\]$/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceOverview(path) {
  const subject = humanize(path);
  const isTest = /(?:\.test\.|\/test\/|\/scripts\/.*(?:audit|smoke|test))/.test(path);

  if (isTest) {
    return {
      role: `Verification role: exercises ${subject.replace(/ Test$/, "")} behavior and guards its user-visible or system invariant.`,
      connection: "System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.",
    };
  }

  if (path === "artifacts/api-server/src/index.ts") {
    return {
      role: "Runtime role: starts the Express process after environment loading, migrations, and startup checks.",
      connection: "System connection: imports app.ts, binds process.env.PORT, and is the production API entry point.",
    };
  }

  if (path === "artifacts/api-server/src/app.ts") {
    return {
      role: "Runtime role: assembles the Express application, global middleware, API routers, and error handling.",
      connection: "System connection: index.ts starts it; routes/index.ts supplies the domain routers consumed by every client.",
    };
  }

  if (path.startsWith("artifacts/api-server/src/routes/")) {
    return {
      role: `API role: implements the ${subject} HTTP domain, including request validation and response shaping.`,
      connection: "System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.",
    };
  }

  if (path.startsWith("artifacts/api-server/src/middlewares/")) {
    return {
      role: `API boundary role: provides the ${subject} Express middleware used before protected handlers run.`,
      connection: "System connection: route modules compose this middleware to establish a trusted request identity or authorization decision.",
    };
  }

  if (path.startsWith("artifacts/api-server/src/lib/")) {
    return {
      role: `Backend domain role: centralizes ${subject} logic so route handlers share one implementation and invariant.`,
      connection: "System connection: imported by API routes and, where applicable, tested independently from HTTP transport.",
    };
  }

  if (path.startsWith("artifacts/api-server/")) {
    return {
      role: `API support role: configures or operates the ${subject} part of the backend package.`,
      connection: "System connection: participates in the API package's development, build, validation, or deployment lifecycle.",
    };
  }

  if (path === "artifacts/app/src/main.tsx") {
    return {
      role: "Web runtime role: creates the React root and installs global providers for the browser application.",
      connection: "System connection: renders App.tsx, which owns routing and lazy page composition.",
    };
  }

  if (path === "artifacts/app/src/App.tsx") {
    return {
      role: "Web orchestration role: defines public/protected routes, lazy page boundaries, and application-wide shells.",
      connection: "System connection: rendered by main.tsx; connects session state, generated API hooks, pages, and the shared design system.",
    };
  }

  if (path.startsWith("artifacts/app/src/pages/")) {
    return {
      role: `Web screen role: renders the ${subject} route and coordinates its page-level data and interactions.`,
      connection: "System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.",
    };
  }

  if (path.startsWith("artifacts/app/src/components/")) {
    return {
      role: `Web UI role: provides the reusable ${subject} component or bridge.`,
      connection: "System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.",
    };
  }

  if (path.startsWith("artifacts/app/src/lib/") || path.startsWith("artifacts/app/src/hooks/")) {
    return {
      role: `Web domain role: centralizes ${subject} state, transformation, navigation, telemetry, or API-adapter behavior.`,
      connection: "System connection: imported by pages/components so business rules are testable without rendering an entire route.",
    };
  }

  if (path.startsWith("artifacts/app/")) {
    return {
      role: `Web support role: configures or validates the ${subject} part of the Vite/React application.`,
      connection: "System connection: participates in browser development, build, quality checks, or deployment.",
    };
  }

  if (path.startsWith("artifacts/mobile/app/")) {
    return {
      role: `Mobile screen role: defines the Expo Router ${subject} screen or route layout.`,
      connection: "System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.",
    };
  }

  if (path.startsWith("artifacts/mobile/contexts/")) {
    return {
      role: `Mobile state role: owns the app-wide ${subject} context and lifecycle.`,
      connection: "System connection: installed by app/_layout.tsx and consumed by screens/components that need shared account state.",
    };
  }

  if (path.startsWith("artifacts/mobile/components/")) {
    return {
      role: `Mobile UI role: provides the reusable ${subject} component.`,
      connection: "System connection: composed by Expo Router screens and aligned with shared API/auth/purchase state where required.",
    };
  }

  if (path.startsWith("artifacts/mobile/")) {
    return {
      role: `Mobile support role: configures or implements ${subject} for the Expo application.`,
      connection: "System connection: supports native build/runtime behavior and communication with the same API used by web and desktop.",
    };
  }

  if (path.startsWith("artifacts/desktop/src/")) {
    return {
      role: "Desktop runtime role: implements the thin Electron shell around the canonical Casparel web client.",
      connection: "System connection: controls navigation/deep links and loads the configured web origin; it does not duplicate server data or business logic.",
    };
  }

  if (path.startsWith("artifacts/desktop/")) {
    return {
      role: `Desktop support role: configures or verifies ${subject} for the Electron distribution.`,
      connection: "System connection: participates in packaging, installer metadata, or controlled-window smoke validation.",
    };
  }

  if (path.startsWith("artifacts/schoolar-edu/src/components/ui/")) {
    return {
      role: `Design-system primitive role: implements the reusable ${subject} UI primitive.`,
      connection: "System connection: exported through @workspace/edu-ds and composed by product-specific web components and pages.",
    };
  }

  if (path.startsWith("artifacts/schoolar-edu/")) {
    return {
      role: `Design-system role: implements or demonstrates ${subject} in the shared component/token package.`,
      connection: "System connection: provides consistent visual, responsive, and accessibility behavior to the web application.",
    };
  }

  if (path.startsWith("lib/db/src/schema/")) {
    return {
      role: `Persistence role: defines the Drizzle tables, relations, and indexes for the ${subject} domain.`,
      connection: "System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.",
    };
  }

  if (path.startsWith("lib/db/")) {
    return {
      role: `Persistence support role: provides ${subject} database connection or migration behavior.`,
      connection: "System connection: consumed by the API before handlers query the shared Drizzle schema.",
    };
  }

  if (path.startsWith("lib/integrations-openai-ai-react/") || path.includes("/src/client/")) {
    return {
      role: `Client integration role: implements ${subject} for browser/React access to OpenAI-backed capabilities.`,
      connection: "System connection: exposes reusable client hooks/utilities while keeping provider-specific behavior outside product pages.",
    };
  }

  if (path.startsWith("lib/integrations-openai-ai-server/") || path.includes("/src/server/")) {
    return {
      role: `Server integration role: implements ${subject} for trusted backend access to OpenAI-backed capabilities.`,
      connection: "System connection: used behind API boundaries so credentials and provider operations never move into browser code.",
    };
  }

  if (path.startsWith("scripts/")) {
    return {
      role: `Repository tooling role: implements ${subject} for workspace development, build, validation, or documentation.`,
      connection: "System connection: invoked by package scripts or maintainers; it is not part of the end-user runtime bundle.",
    };
  }

  if (path.startsWith("load-tests/")) {
    return {
      role: `Operational verification role: implements the ${subject} load/smoke scenario.`,
      connection: "System connection: exercises deployed HTTP surfaces under explicit safety guards and reports latency/error thresholds.",
    };
  }

  if (path.startsWith("lib/api-spec/")) {
    return {
      role: "Contract role: defines the OpenAPI source of truth used to generate client hooks and runtime Zod schemas.",
      connection: "System connection: codegen feeds lib/api-client-react and lib/api-zod; Express handlers must implement the same operations.",
    };
  }

  return {
    role: `Repository role: implements or configures ${subject}.`,
    connection: "System connection: see docs/codebase-guide.md and docs/source-file-index.md for its package boundary and consumers.",
  };
}

function headerFor(path) {
  const { role, connection } = sourceOverview(path);
  const ext = extname(path);

  if (ext === ".html") {
    return `<!-- ${marker}: ${role}\n     ${connection} -->\n`;
  }

  if ([".yaml", ".yml", ".py", ".sh"].includes(ext)) {
    return `# ${marker}: ${role}\n# ${connection}\n`;
  }

  return `/**\n * ${marker} ${role}\n * ${connection}\n */\n`;
}

function insertHeader(path, content) {
  const header = headerFor(path);
  if (content.startsWith("#!")) {
    const newline = content.indexOf("\n");
    return newline === -1 ? `${content}\n${header}` : `${content.slice(0, newline + 1)}${header}${content.slice(newline + 1)}`;
  }
  return `${header}${content}`;
}

function classify(path) {
  if (path.startsWith("lib/api-client-react/src/generated/") || path.startsWith("lib/api-zod/src/generated/")) return "generated API contract";
  if (path.startsWith("artifacts/schoolar-edu/src/generated/")) return "generated design tokens";
  if (path.startsWith("lib/db/migrations/meta/")) return "generated migration snapshot";
  if (path.startsWith("lib/db/migrations/")) return "database migration history";
  if (/^(attached_assets|deliverables|output)\//.test(path) || /\.(docx|ico|pdf|png|svg|woff2|zip)$/.test(path)) return "asset or deliverable";
  if (/(^|\/)(pnpm-lock\.yaml|package\.json|tsconfig(?:\.[^.]+)?\.json|app\.json|eas\.json)$/.test(path)) return "manifest or machine-readable config";
  if (/\.(md|txt)$/.test(path)) return "documentation";
  if (commentableExtensions.has(extname(path)) && !isExcluded(path)) return "authored source (commented)";
  return "configuration or repository metadata";
}

function indexDescription(path, kind) {
  if (kind === "authored source (commented)") return `${sourceOverview(path).role} ${sourceOverview(path).connection}`;
  if (kind === "generated API contract") return "Generated from lib/api-spec/openapi.yaml; never hand-edit it.";
  if (kind === "generated design tokens") return "Generated from the design-system token source by scripts/build-tokens.mjs; never hand-edit it.";
  if (kind === "generated migration snapshot") return "Drizzle Kit bookkeeping used to generate/compare migrations; do not treat it as application logic.";
  if (kind === "database migration history") return "Immutable, ordered SQL history applied by lib/db/src/migrate.ts at API startup.";
  if (kind === "asset or deliverable") return "Binary/static input or produced deliverable; behavior is explained by the code or document that consumes it.";
  if (kind === "manifest or machine-readable config") return "Machine-readable package, compiler, build, app, or dependency configuration; JSON cannot contain comments.";
  if (kind === "documentation") return `Human-facing documentation for ${humanize(path)}.`;
  return `Repository metadata or configuration for ${humanize(path)}.`;
}

function renderIndex(files) {
  const grouped = new Map();
  for (const path of files) {
    const top = path.split("/")[0];
    if (!grouped.has(top)) grouped.set(top, []);
    grouped.get(top).push(path);
  }

  const lines = [
    "# Casparel source file index",
    "",
    "> Generated by `node scripts/document-source-files.mjs --index`. Do not hand-edit this file.",
    "",
    "This index accounts for every tracked and non-ignored workspace file. Authored source files also carry an `@fileOverview` header. Generated contracts, migration history, binaries, assets, and JSON are intentionally documented here instead of being modified.",
    "",
  ];

  for (const [top, paths] of grouped) {
    lines.push(`## ${top}`, "", "| File | Kind | Role and connection |", "| --- | --- | --- |");
    for (const path of paths) {
      const kind = classify(path);
      const description = indexDescription(path, kind).replace(/\|/g, "\\|").replace(/\s+/g, " ");
      lines.push(`| \`${path}\` | ${kind} | ${description} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

const files = trackedAndUntrackedFiles();
const undocumented = [];
let changed = 0;

for (const path of files) {
  if (!commentableExtensions.has(extname(path)) || isExcluded(path)) continue;
  const absolutePath = resolve(root, path);
  const content = readFileSync(absolutePath, "utf8");
  if (content.includes(marker)) continue;

  undocumented.push(path);
  if (shouldWrite) {
    writeFileSync(absolutePath, insertHeader(path, content));
    changed += 1;
  }
}

if (shouldWriteIndex) {
  writeFileSync(resolve(root, "docs/source-file-index.md"), renderIndex(trackedAndUntrackedFiles()));
}

if (shouldWrite) {
  console.log(`Added file overviews to ${changed} authored source files.`);
  console.log("Regenerated docs/source-file-index.md.");
} else if (undocumented.length > 0) {
  console.error(`${undocumented.length} authored source files are missing an ${marker} header:`);
  console.error(undocumented.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`All authored source files contain an ${marker} header.`);
}
