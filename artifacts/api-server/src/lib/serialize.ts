/**
 * @fileOverview Backend domain role: centralizes Serialize logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
/**
 * Recursively convert Date objects to ISO strings so Zod schemas
 * that expect `string` for timestamp fields don't throw.
 */
export function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
