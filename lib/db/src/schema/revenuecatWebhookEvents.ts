/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Revenuecat Webhook Events domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Durable receipt for a RevenueCat event.
 *
 * The event id is the idempotency key. A receipt is inserted in the same
 * transaction as the entitlement update, so a failed update leaves no receipt
 * behind and RevenueCat can safely retry the event.
 */
export const revenuecatWebhookEventsTable = pgTable(
  "revenuecat_webhook_events",
  {
    eventId: text("event_id").primaryKey(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
  },
);

export type RevenueCatWebhookEvent =
  typeof revenuecatWebhookEventsTable.$inferSelect;
