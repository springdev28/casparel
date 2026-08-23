/**
 * @fileOverview Verification role: exercises Setup behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
// Set required env vars before any module is loaded.
// SESSION_SECRET is read at module-init time in lib/auth.ts.
process.env.SESSION_SECRET = "test-secret-for-vitest-do-not-use-in-prod";
process.env.DATABASE_URL = "postgres://unused/test"; // satisfies db import guard; db is mocked
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
// Use in-memory rate-limit store so tests never need a real DB pool
process.env.RATE_LIMIT_STORE = "memory";
// Required to import routes/resources.ts, which loads the OpenAI integration
// at module scope. Tests never call out; these only satisfy the import guard.
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://example.invalid/v1";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-key-not-real";
