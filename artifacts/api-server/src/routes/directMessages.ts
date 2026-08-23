/**
 * @fileOverview API role: implements the Direct Messages HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { Router, type IRouter } from "express";
import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  directConversationsTable,
  directMessagesTable,
  userBlocksTable,
  userPreferencesTable,
  usersTable,
} from "@workspace/db";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";

const router: IRouter = Router();
const createConversationBody = z.object({
  userId: z.number().int().positive(),
  body: z.string().trim().min(1).max(4000).optional(),
});
const sendMessageBody = z.object({ body: z.string().trim().min(1).max(4000) });

function pair(first: number, second: number) {
  return first < second ? [first, second] as const : [second, first] as const;
}

async function isBlocked(first: number, second: number) {
  const [block] = await db
    .select({ id: userBlocksTable.id })
    .from(userBlocksTable)
    .where(or(
      and(eq(userBlocksTable.blockerId, first), eq(userBlocksTable.blockedId, second)),
      and(eq(userBlocksTable.blockerId, second), eq(userBlocksTable.blockedId, first)),
    ))
    .limit(1);
  return Boolean(block);
}

async function conversationForUser(id: number, userId: number) {
  const [conversation] = await db
    .select()
    .from(directConversationsTable)
    .where(and(
      eq(directConversationsTable.id, id),
      or(
        eq(directConversationsTable.firstUserId, userId),
        eq(directConversationsTable.secondUserId, userId),
      ),
    ));
  return conversation;
}

async function conversationResult(
  conversation: typeof directConversationsTable.$inferSelect,
  userId: number,
) {
  const otherUserId = conversation.firstUserId === userId
    ? conversation.secondUserId
    : conversation.firstUserId;
  const [[other], [lastMessage], [unread]] = await Promise.all([
    db.select({
      id: usersTable.id,
      name: usersTable.name,
      role: usersTable.role,
      avatarUrl: usersTable.avatarUrl,
    }).from(usersTable).where(eq(usersTable.id, otherUserId)),
    db.select().from(directMessagesTable)
      .where(eq(directMessagesTable.conversationId, conversation.id))
      .orderBy(desc(directMessagesTable.createdAt)).limit(1),
    db.select({ count: sql<number>`cast(count(*) as int)` })
      .from(directMessagesTable)
      .where(and(
        eq(directMessagesTable.conversationId, conversation.id),
        ne(directMessagesTable.senderId, userId),
        isNull(directMessagesTable.readAt),
      )),
  ]);
  return {
    ...conversation,
    other,
    lastMessage: lastMessage ?? null,
    unreadCount: unread?.count ?? 0,
    incomingRequest:
      conversation.status === "pending" && conversation.requestedById !== userId,
  };
}

router.get("/direct-messages/conversations", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const conversations = await db.select().from(directConversationsTable)
    .where(or(
      eq(directConversationsTable.firstUserId, userId),
      eq(directConversationsTable.secondUserId, userId),
    ))
    .orderBy(desc(directConversationsTable.updatedAt))
    .limit(100);
  res.json(await Promise.all(conversations.map((item) => conversationResult(item, userId))));
});

router.post(
  "/direct-messages/conversations",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const auth = req as AuthenticatedRequest;
    const parsed = createConversationBody.safeParse(req.body);
    if (!parsed.success || parsed.data.userId === auth.userId) {
      res.status(400).json({ error: "Choose another user" });
      return;
    }
    const targetId = parsed.data.userId;
    const [target] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.id, targetId));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const isAdmin = auth.accountRole === "admin";
    if (!isAdmin && await isBlocked(auth.userId, targetId)) {
      res.status(403).json({ error: "Messaging is unavailable for this account" });
      return;
    }
    const [firstUserId, secondUserId] = pair(auth.userId, targetId);
    let [conversation] = await db.select().from(directConversationsTable)
      .where(and(
        eq(directConversationsTable.firstUserId, firstUserId),
        eq(directConversationsTable.secondUserId, secondUserId),
      ));
    if (!conversation || conversation.status === "declined") {
      const [preferences] = await db.select({
        allowMessageRequests: userPreferencesTable.allowMessageRequests,
      }).from(userPreferencesTable).where(eq(userPreferencesTable.userId, targetId));
      if (!isAdmin && preferences?.allowMessageRequests === false) {
        res.status(403).json({ error: "This user is not accepting message requests" });
        return;
      }
      const values = {
        firstUserId,
        secondUserId,
        requestedById: auth.userId,
        status: isAdmin ? "accepted" as const : "pending" as const,
        updatedAt: new Date().toISOString(),
      };
      [conversation] = await db.insert(directConversationsTable).values(values)
        .onConflictDoUpdate({
          target: [directConversationsTable.firstUserId, directConversationsTable.secondUserId],
          set: values,
        }).returning();
    } else if (isAdmin && conversation.status !== "accepted") {
      [conversation] = await db.update(directConversationsTable)
        .set({ status: "accepted", updatedAt: new Date().toISOString() })
        .where(eq(directConversationsTable.id, conversation.id)).returning();
    }
    if (parsed.data.body) {
      await db.insert(directMessagesTable).values({
        conversationId: conversation.id,
        senderId: auth.userId,
        body: parsed.data.body,
        isAdminMessage: isAdmin,
      });
      [conversation] = await db.update(directConversationsTable)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(directConversationsTable.id, conversation.id)).returning();
    }
    res.status(201).json(await conversationResult(conversation, auth.userId));
  },
);

router.get("/direct-messages/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const conversation = await conversationForUser(Number(req.params.id), userId);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const messages = await db.select().from(directMessagesTable)
    .where(eq(directMessagesTable.conversationId, conversation.id))
    .orderBy(directMessagesTable.createdAt).limit(500);
  await db.update(directMessagesTable).set({ readAt: new Date().toISOString() })
    .where(and(
      eq(directMessagesTable.conversationId, conversation.id),
      ne(directMessagesTable.senderId, userId),
      isNull(directMessagesTable.readAt),
    ));
  res.json({ ...(await conversationResult(conversation, userId)), messages });
});

router.post(
  "/direct-messages/conversations/:id/messages",
  contentLimiter,
  requireAuth,
  async (req, res): Promise<void> => {
    const auth = req as AuthenticatedRequest;
    const parsed = sendMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Message must be between 1 and 4000 characters" });
      return;
    }
    let conversation = await conversationForUser(Number(req.params.id), auth.userId);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const otherId = conversation.firstUserId === auth.userId
      ? conversation.secondUserId : conversation.firstUserId;
    const isAdmin = auth.accountRole === "admin";
    if (!isAdmin && await isBlocked(auth.userId, otherId)) {
      res.status(403).json({ error: "Messaging is unavailable for this account" });
      return;
    }
    if (conversation.status !== "accepted") {
      const [existing] = await db.select({ count: sql<number>`cast(count(*) as int)` })
        .from(directMessagesTable)
        .where(eq(directMessagesTable.conversationId, conversation.id));
      if (conversation.requestedById !== auth.userId || (existing?.count ?? 0) > 0) {
        res.status(403).json({ error: "Wait for this message request to be accepted" });
        return;
      }
    }
    if (isAdmin && conversation.status !== "accepted") {
      [conversation] = await db.update(directConversationsTable)
        .set({ status: "accepted" })
        .where(eq(directConversationsTable.id, conversation.id)).returning();
    }
    const [message] = await db.insert(directMessagesTable).values({
      conversationId: conversation.id,
      senderId: auth.userId,
      body: parsed.data.body,
      isAdminMessage: isAdmin,
    }).returning();
    await db.update(directConversationsTable).set({ updatedAt: new Date().toISOString() })
      .where(eq(directConversationsTable.id, conversation.id));
    res.status(201).json(message);
  },
);

router.patch("/direct-messages/conversations/:id/request", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const conversation = await conversationForUser(Number(req.params.id), userId);
  const action = req.body?.action;
  if (!conversation || conversation.requestedById === userId || conversation.status !== "pending") {
    res.status(404).json({ error: "Message request not found" });
    return;
  }
  if (action !== "accept" && action !== "decline") {
    res.status(400).json({ error: "Choose accept or decline" });
    return;
  }
  const [updated] = await db.update(directConversationsTable)
    .set({ status: action === "accept" ? "accepted" : "declined", updatedAt: new Date().toISOString() })
    .where(eq(directConversationsTable.id, conversation.id)).returning();
  res.json(await conversationResult(updated, userId));
});

export default router;
