/**
 * @fileOverview Backend domain role: centralizes Audit Fixtures.D logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
/**
 * Types for the app's audit fixture module, which is plain JavaScript.
 *
 * artifacts/app/scripts/audit-fixtures.mjs is a script the browser audits load
 * directly, so it has no build step and no declarations of its own.
 * auditFixturesMatchTheContract.test.ts imports the fixture table from it --
 * the actual objects, not the source as text, because the point is to hand
 * them to the generated zod schemas.
 *
 * `unknown` rather than a shape: every fixture is a different shape, and the
 * test's whole job is to discover what those shapes are by parsing them. A
 * type written here would be a second, unchecked opinion about the same thing.
 */
declare module "*/audit-fixtures.mjs" {
  export const FIXTURES: Record<string, unknown>;
}
