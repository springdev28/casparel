/**
 * @fileOverview API support role: configures or operates the Vitest.Config part of the backend package.
 * System connection: participates in the API package's development, build, validation, or deployment lifecycle.
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const workspacePath = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Each test file gets its own module registry so vi.mock hoisting is isolated
    isolate: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    // Mirror the workspace alias so @workspace/* resolves without building
    alias: {
      "@workspace/db": workspacePath("../../lib/db/src/index.ts"),
      "@workspace/api-zod": workspacePath("../../lib/api-zod/src/index.ts"),
      "@workspace/integrations-openai-ai-server": workspacePath(
        "../../lib/integrations-openai-ai-server/src/index.ts",
      ),
    },
  },
});
