/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Catalog Resources domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { resourceFormatEnum } from "./resources";

export type CatalogResourceMetadata = Record<string, unknown>;

export const catalogResourcesTable = pgTable(
  "catalog_resources",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),
    providerUrl: text("provider_url").notNull(),
    externalId: text("external_id").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    format: resourceFormatEnum("format").notNull().default("other"),
    subject: text("subject").notNull(),
    gradeLevel: text("grade_level").notNull().default("All levels"),
    language: text("language").notNull().default("en"),
    license: text("license"),
    author: text("author"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "string",
    }),
    sourceKind: text("source_kind")
      .$type<"curated" | "open-library" | "wikibooks">()
      .notNull(),
    metadata: jsonb("metadata")
      .$type<CatalogResourceMetadata>()
      .notNull()
      .default({}),
    lastSyncedAt: timestamp("last_synced_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("catalog_resources_provider_external_idx").on(
      table.provider,
      table.externalId,
    ),
    uniqueIndex("catalog_resources_canonical_url_idx").on(table.canonicalUrl),
    index("catalog_resources_subject_idx").on(table.subject),
    index("catalog_resources_language_idx").on(table.language),
    index("catalog_resources_credibility_idx").on(
      sql`(${table.metadata}->>'credibility')`,
    ),
    index("catalog_resources_synced_idx").on(table.lastSyncedAt),
  ],
);

export const catalogSyncStateTable = pgTable("catalog_sync_state", {
  provider: text("provider").primaryKey(),
  lastAttemptedAt: timestamp("last_attempted_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  lastSuccessfulAt: timestamp("last_successful_at", {
    withTimezone: true,
    mode: "string",
  }),
  itemCount: integer("item_count").notNull().default(0),
  error: text("error"),
});

export type InsertCatalogResource = typeof catalogResourcesTable.$inferInsert;
