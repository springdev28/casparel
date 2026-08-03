// Set required env vars before any module is loaded.
// SESSION_SECRET is read at module-init time in lib/auth.ts.
process.env.SESSION_SECRET = "test-secret-for-vitest-do-not-use-in-prod";
process.env.DATABASE_URL = "postgres://unused/test"; // satisfies db import guard; db is mocked
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
