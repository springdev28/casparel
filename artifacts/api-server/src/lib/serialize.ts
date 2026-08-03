/**
 * Recursively convert Date objects to ISO strings so Zod schemas
 * that expect `string` for timestamp fields don't throw.
 */
export function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
