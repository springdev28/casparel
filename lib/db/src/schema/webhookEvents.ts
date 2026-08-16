import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Webhook deliveries that have already been applied.
 *
 * Billing providers retry until they get a 2xx, so the same event arrives more
 * than once as a matter of course — after a timeout, a deploy, or a transient
 * 500. Without a record of what has been handled, every retry re-applies its
 * effect: a re-delivered RENEWAL re-writes an expiry that a later CANCELLATION
 * had already superseded, and a re-delivered TRANSFER moves a subscription
 * that has since moved back.
 *
 * The provider's own event id is the key, so this survives restarts and is
 * shared by every instance. Rows are worth keeping: they are the only local
 * record of what billing told us and when.
 */
export const webhookEventsTable = pgTable(
  "webhook_events",
  {
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    receivedAt: timestamp("received_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.eventId] }),
    index("webhook_events_received_idx").on(table.receivedAt),
  ],
);
