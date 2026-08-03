import { defineConfig } from "vitest/config";

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
      "@workspace/db": new URL("../../lib/db/src/index.ts", import.meta.url).pathname,
      "@workspace/api-zod": new URL("../../lib/api-zod/src/index.ts", import.meta.url).pathname,
      "@workspace/integrations-openai-ai-server": new URL(
        "../../lib/integrations-openai-ai-server/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
