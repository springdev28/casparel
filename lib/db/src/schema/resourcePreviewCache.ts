/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Resource Preview Cache domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const resourcePreviewCacheTable = pgTable(
  "resource_preview_cache",
  {
    id: serial("id").primaryKey(),
    canonicalUrl: text("canonical_url").notNull(),
    previewTitle: text("preview_title"),
    previewDescription: text("preview_description"),
    previewImageUrl: text("preview_image_url"),
    previewAuthor: text("preview_author"),
    previewPublisher: text("preview_publisher"),
    previewPublishedAt: timestamp("preview_published_at", {
      withTimezone: true,
      mode: "string",
    }),
    previewUpdatedAt: timestamp("preview_updated_at", {
      withTimezone: true,
      mode: "string",
    }),
    previewFaviconUrl: text("preview_favicon_url"),
    previewSource: text("preview_source")
      .$type<"provider_api" | "oembed" | "opengraph" | "extracted" | "none">()
      .notNull()
      .default("none"),
    previewCheckedAt: timestamp("preview_checked_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("resource_preview_cache_canonical_url_idx").on(
      table.canonicalUrl,
    ),
    index("resource_preview_cache_expires_at_idx").on(table.expiresAt),
  ],
);

export type ResourcePreviewCache =
  typeof resourcePreviewCacheTable.$inferSelect;
