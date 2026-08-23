/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Canvases domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { classesTable } from "./classes";

export type CanvasNode = {
  id: string;
  type: "study";
  position: { x: number; y: number };
  data: {
    kind: "note" | "heading" | "link" | "resource";
    title: string;
    text?: string;
    url?: string;
    resourceId?: number;
    color?: string;
  };
};

export type CanvasEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: "top" | "right" | "bottom" | "left";
  targetHandle?: "top" | "right" | "bottom" | "left";
  direction?: "one-way" | "two-way" | "line";
  label?: string;
};

export type CanvasDocument = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport?: { x: number; y: number; zoom: number };
};

export const canvasesTable = pgTable(
  "canvases",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    classId: integer("class_id").references(() => classesTable.id, {
      onDelete: "cascade",
    }),
    visibility: text("visibility")
      .$type<"private" | "people" | "class" | "link">()
      .notNull()
      .default("private"),
    classAccess: text("class_access")
      .$type<"view" | "edit">()
      .notNull()
      .default("view"),
    shareToken: text("share_token"),
    document: jsonb("document")
      .$type<CanvasDocument>()
      .notNull()
      .default({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("canvases_share_token_idx").on(table.shareToken),
    index("canvases_owner_idx").on(table.ownerId),
    index("canvases_class_idx").on(table.classId),
  ],
);

export const canvasCollaboratorsTable = pgTable(
  "canvas_collaborators",
  {
    canvasId: integer("canvas_id")
      .notNull()
      .references(() => canvasesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").$type<"viewer" | "editor">().notNull().default("viewer"),
    addedById: integer("added_by_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.canvasId, table.userId] }),
    index("canvas_collaborators_user_idx").on(table.userId),
  ],
);

export type Canvas = typeof canvasesTable.$inferSelect;
export type CanvasCollaborator = typeof canvasCollaboratorsTable.$inferSelect;
