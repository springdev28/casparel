---
name: Drizzle timestamp mode for API responses
description: Drizzle timestamp columns return Date objects by default, but the orval-generated Zod schemas expect strings. Fix by adding mode: "string" to all timestamp columns.
---

## Rule
Always define timestamp columns in `lib/db/src/schema/` with `{ withTimezone: true, mode: "string" }`:

```typescript
createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
```

## Why
The orval codegen produces `zod.string()` for timestamp fields in response schemas (matching the OpenAPI spec's `type: string`). Drizzle's default timestamp mode returns JavaScript `Date` objects. Passing a `Date` to `zod.string().parse()` throws `Invalid input: expected string, received Date`. Using `mode: "string"` makes Drizzle return ISO strings that pass through Zod without error.

## How to apply
- Every new schema file: add `mode: "string"` to all `timestamp(...)` columns.
- Also applies to `addedAt`, `joinedAt`, and any other timestamp-family columns.
- Does NOT affect the DB schema — no push needed after this change.
- After changing mode in schema files, rebuild the db package: `cd lib/db && pnpm exec tsc -p tsconfig.json`
