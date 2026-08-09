import { Router, type IRouter } from "express";
import multer from "multer";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db,
  classesTable,
  classMembersTable,
  forumCommentsTable,
  forumLikesTable,
  forumMaterialApprovalsTable,
  forumMaterialsTable,
  forumPostRepostsTable,
  forumPostsTable,
  forumReportsTable,
  forumSurveyVotesTable,
  usersTable,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { contentLimiter } from "../lib/limiters";
import {
  inferForumMaterialType,
  normalizeForumPostTags,
  shouldCatalogForumFile,
} from "../lib/forum-catalog";

const router: IRouter = Router();
const materialUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});
const postUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 20 },
});
const MATERIAL_TYPES = new Set([
  "video",
  "infographic",
  "article",
  "worksheet",
  "activity",
  "notes",
]);
const TARGET_TYPES = new Set(["material", "post"]);
const REPORT_TARGET_TYPES = new Set(["material", "post", "comment"]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanList(value: unknown, maxItems = 20) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];
  return [...new Set(raw.map((item) => cleanText(item, 300)).filter(Boolean))]
    .slice(0, maxItems);
}

function validUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function fileKind(file: Express.Multer.File) {
  const name = file.originalname.toLocaleLowerCase();
  const bytes = file.buffer;
  if (name.endsWith(".pdf") && bytes.subarray(0, 4).toString() === "%PDF")
    return "application/pdf";
  if (
    name.endsWith(".docx") &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b
  )
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (
    (name.endsWith(".jpg") || name.endsWith(".jpeg")) &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "image/jpeg";
  if (
    name.endsWith(".png") &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "image/png";
  if (
    (name.endsWith(".mov") || name.endsWith(".mp4")) &&
    bytes.length > 12 &&
    bytes.subarray(4, 8).toString() === "ftyp"
  )
    return name.endsWith(".mov") ? "video/quicktime" : "video/mp4";
  return null;
}

async function currentUser(userId: number) {
  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      role: usersTable.role,
      activeRole: usersTable.activeRole,
      teacherVerified: usersTable.teacherVerified,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user;
}

async function canAccessClass(
  auth: AuthenticatedRequest,
  classId: number,
) {
  if (auth.accountRole === "admin") return true;
  const [[owned], [membership]] = await Promise.all([
    db.select({ id: classesTable.id }).from(classesTable).where(
      and(eq(classesTable.id, classId), eq(classesTable.teacherId, auth.userId)),
    ).limit(1),
    db.select({ classId: classMembersTable.classId }).from(classMembersTable).where(
      and(
        eq(classMembersTable.classId, classId),
        eq(classMembersTable.userId, auth.userId),
      ),
    ).limit(1),
  ]);
  return Boolean(owned || membership);
}

async function canAccessPost(auth: AuthenticatedRequest, postId: number) {
  const [post] = await db.select({ classId: forumPostsTable.classId })
    .from(forumPostsTable)
    .where(eq(forumPostsTable.id, postId));
  if (!post) return false;
  return post.classId ? canAccessClass(auth, post.classId) : true;
}

type ModerationResult = {
  flagged: boolean;
  assessment: string;
};

async function moderateForumText(
  text: string,
  checkAccuracy = false,
): Promise<ModerationResult> {
  const input = text.trim().slice(0, 12000);
  if (!input) return { flagged: false, assessment: "No text to assess." };
  try {
    const moderation = await openai.moderations.create({
      model: "omni-moderation-latest",
      input,
    });
    if (moderation.results[0]?.flagged) {
      const categories = Object.entries(moderation.results[0].categories)
        .filter(([, flagged]) => flagged)
        .map(([category]) => category)
        .join(", ");
      return {
        flagged: true,
        assessment: "Safety moderation flagged: " + (categories || "unsafe content"),
      };
    }

    if (!checkAccuracy) {
      return { flagged: false, assessment: "AI safety check passed." };
    }

    const response = await openai.responses.create({
      model: "gpt-5-nano",
      max_output_tokens: 180,
      reasoning: { effort: "low" },
      ...(/https?:\/\//i.test(input)
        ? { tools: [{ type: "web_search" as const, search_context_size: "low" as const }] }
        : {}),
      input:
        'Review this education-forum content. When URLs are present, inspect the linked destination. Flag only clear fabricated factual claims, targeted hate, harassment, sexual content, dangerous instructions, severe misinformation, or an unsafe/inappropriate linked destination. Opinions, criticism, jokes, uncertainty, and ordinary mistakes are allowed. Return JSON only as {"flagged":boolean,"reason":string}.\\n\\nCONTENT:\\n' +
        input,
    });
    const raw = response.output_text.trim().replace(/^\`\`\`(?:json)?/i, "").replace(/\`\`\`$/i, "").trim();
    const parsed = JSON.parse(raw) as { flagged?: unknown; reason?: unknown };
    return {
      flagged: parsed.flagged === true,
      assessment:
        typeof parsed.reason === "string"
          ? parsed.reason.slice(0, 1000)
          : "AI content check completed.",
    };
  } catch {
    return {
      flagged: false,
      assessment:
        "Automated moderation was temporarily unavailable; local validation passed and the content remains reportable.",
    };
  }
}

function visibleStatus(accountRole: string) {
  return accountRole === "admin"
    ? undefined
    : eq(forumMaterialsTable.moderationStatus, "approved");
}

async function materialResult(id: number, userId: number) {
  const [material] = await db
    .select({
      id: forumMaterialsTable.id,
      title: forumMaterialsTable.title,
      description: forumMaterialsTable.description,
      unit: forumMaterialsTable.unit,
      topic: forumMaterialsTable.topic,
      materialType: forumMaterialsTable.materialType,
      tags: forumMaterialsTable.tags,
      sources: forumMaterialsTable.sources,
      uploaderId: forumMaterialsTable.uploaderId,
      uploaderName: forumMaterialsTable.uploaderName,
      uploaderRole: forumMaterialsTable.uploaderRole,
      linkUrl: forumMaterialsTable.linkUrl,
      fileName: forumMaterialsTable.fileName,
      mimeType: forumMaterialsTable.mimeType,
      moderationStatus: forumMaterialsTable.moderationStatus,
      moderationNote: forumMaterialsTable.moderationNote,
      viewCount: forumMaterialsTable.viewCount,
      downloadCount: forumMaterialsTable.downloadCount,
      createdAt: forumMaterialsTable.createdAt,
      updatedAt: forumMaterialsTable.updatedAt,
      likeCount: sql<number>`cast((select count(*) from forum_likes where target_type = 'material' and target_id = ${forumMaterialsTable.id}) as int)`,
      commentCount: sql<number>`cast((select count(*) from forum_comments where target_type = 'material' and target_id = ${forumMaterialsTable.id} and moderation_status = 'approved') as int)`,
      likedByMe: sql<boolean>`exists(select 1 from forum_likes where target_type = 'material' and target_id = ${forumMaterialsTable.id} and user_id = ${userId})`,
    })
    .from(forumMaterialsTable)
    .where(eq(forumMaterialsTable.id, id));
  if (!material) return null;
  const approvals = await db
    .select()
    .from(forumMaterialApprovalsTable)
    .where(eq(forumMaterialApprovalsTable.materialId, id))
    .orderBy(asc(forumMaterialApprovalsTable.createdAt));
  return { ...material, approvals };
}

router.get("/forum/access", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const user = await currentUser(auth.userId);
  res.json({
    isAdmin: auth.accountRole === "admin",
    teacherVerified: user?.teacherVerified === true,
    canApprove:
      auth.accountRole === "admin" ||
      (user?.role === "teacher" && user.teacherVerified === true),
  });
});

router.get("/forum/materials", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const q = cleanText(req.query.q, 160);
  const unit = cleanText(req.query.unit, 100);
  const topic = cleanText(req.query.topic, 100);
  const type = cleanText(req.query.type, 40);
  const uploader = cleanText(req.query.uploader, 100);
  const date = cleanText(req.query.date, 20);
  const sort = cleanText(req.query.sort, 20);
  const conditions = [];
  const status = visibleStatus(auth.accountRole);
  if (status) conditions.push(status);
  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean).slice(0, 8);
    conditions.push(and(...tokens.map((token) => {
      const pattern = `%${token}%`;
      return or(
        ilike(forumMaterialsTable.title, pattern),
        ilike(forumMaterialsTable.description, pattern),
        ilike(forumMaterialsTable.unit, pattern),
        ilike(forumMaterialsTable.topic, pattern),
        ilike(forumMaterialsTable.uploaderName, pattern),
        sql`${forumMaterialsTable.tags}::text ilike ${pattern}`,
      )!;
    }))!);
  }
  if (unit) conditions.push(ilike(forumMaterialsTable.unit, `%${unit}%`));
  if (topic) conditions.push(ilike(forumMaterialsTable.topic, `%${topic}%`));
  if (type && MATERIAL_TYPES.has(type))
    conditions.push(eq(forumMaterialsTable.materialType, type as "video" | "infographic" | "article" | "worksheet" | "activity" | "notes"));
  if (uploader)
    conditions.push(ilike(forumMaterialsTable.uploaderName, `%${uploader}%`));
  if (date === "day")
    conditions.push(sql`${forumMaterialsTable.createdAt} >= now() - interval '1 day'`);
  if (date === "week")
    conditions.push(sql`${forumMaterialsTable.createdAt} >= now() - interval '7 days'`);
  if (date === "month")
    conditions.push(sql`${forumMaterialsTable.createdAt} >= now() - interval '30 days'`);
  if (date === "year")
    conditions.push(sql`${forumMaterialsTable.createdAt} >= now() - interval '1 year'`);

  const rows = await db
    .select({ id: forumMaterialsTable.id })
    .from(forumMaterialsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      sort === "oldest"
        ? asc(forumMaterialsTable.createdAt)
        : sort === "downloads"
          ? desc(forumMaterialsTable.downloadCount)
          : sort === "views"
            ? desc(forumMaterialsTable.viewCount)
            : desc(forumMaterialsTable.createdAt),
    )
    .limit(100);
  const results = await Promise.all(rows.map((row) => materialResult(row.id, auth.userId)));
  res.json(results.filter(Boolean));
});

router.post(
  "/forum/materials",
  contentLimiter,
  requireAuth,
  materialUpload.single("file"),
  async (req, res): Promise<void> => {
    const auth = req as AuthenticatedRequest;
    const user = await currentUser(auth.userId);
    if (!user) {
      res.status(401).json({ error: "Account not found" });
      return;
    }
    const title = cleanText(req.body.title, 180);
    const description = cleanText(req.body.description, 2000);
    const unit = cleanText(req.body.unit, 120);
    const topic = cleanText(req.body.topic, 120);
    const materialType = cleanText(req.body.materialType, 40);
    const linkUrl = cleanText(req.body.linkUrl, 2000);
    const tags = [...new Set(["material", ...cleanList(req.body.tags)])];
    const sources = cleanList(req.body.sources);
    if (!title || !unit || !topic || !MATERIAL_TYPES.has(materialType)) {
      res.status(400).json({ error: "Title, unit, topic, and material type are required" });
      return;
    }
    const [duplicate] = await db
      .select({ id: forumMaterialsTable.id })
      .from(forumMaterialsTable)
      .where(ilike(forumMaterialsTable.title, title));
    if (duplicate) {
      res.status(409).json({ error: "Every material needs a unique title" });
      return;
    }
    if (!req.file && !validUrl(linkUrl)) {
      res.status(400).json({ error: "Upload an accepted file or provide a valid activity/YouTube link" });
      return;
    }
    const mimeType = req.file ? fileKind(req.file) : null;
    if (req.file && !mimeType) {
      res.status(415).json({ error: "Accepted files are PDF, DOCX, JPG, JPEG, PNG, MOV, and MP4" });
      return;
    }
    const [created] = await db
      .insert(forumMaterialsTable)
      .values({
        title,
        description: description || null,
        unit,
        topic,
        materialType: materialType as "video" | "infographic" | "article" | "worksheet" | "activity" | "notes",
        tags,
        sources,
        uploaderId: user.id,
        uploaderName: user.name,
        uploaderRole: (auth.accountRole === "admin" ? "admin" : auth.userRole === "teacher" ? "teacher" : "student"),
        linkUrl: validUrl(linkUrl) ? linkUrl : null,
        fileName: req.file?.originalname ?? null,
        mimeType,
        fileBase64: req.file?.buffer.toString("base64") ?? null,
      })
      .returning({ id: forumMaterialsTable.id });
    res.status(201).json(await materialResult(created.id, auth.userId));
  },
);

router.post("/forum/materials/:id/view", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid material" }); return; }
  await db.update(forumMaterialsTable)
    .set({ viewCount: sql`${forumMaterialsTable.viewCount} + 1` })
    .where(eq(forumMaterialsTable.id, id));
  res.status(204).end();
});

router.get("/forum/materials/:id/file", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [material] = await db
    .select({
      fileName: forumMaterialsTable.fileName,
      mimeType: forumMaterialsTable.mimeType,
      fileBase64: forumMaterialsTable.fileBase64,
    })
    .from(forumMaterialsTable)
    .where(eq(forumMaterialsTable.id, id));
  if (!material?.fileBase64 || !material.fileName) {
    res.status(404).json({ error: "This material has no uploaded file" });
    return;
  }
  await db.update(forumMaterialsTable)
    .set({ downloadCount: sql`${forumMaterialsTable.downloadCount} + 1` })
    .where(eq(forumMaterialsTable.id, id));
  const safeName = material.fileName.replace(/[^a-zA-Z0-9._ -]/g, "_");
  res.setHeader("Content-Type", material.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  res.send(Buffer.from(material.fileBase64, "base64"));
});

router.delete("/forum/materials/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const id = Number(req.params.id);
  const [material] = await db.select({ uploaderId: forumMaterialsTable.uploaderId })
    .from(forumMaterialsTable).where(eq(forumMaterialsTable.id, id));
  if (!material) { res.status(404).json({ error: "Material not found" }); return; }
  if (material.uploaderId !== auth.userId && auth.accountRole !== "admin") {
    res.status(403).json({ error: "Only the uploader or an administrator can delete this material" });
    return;
  }
  await db.delete(forumMaterialsTable).where(eq(forumMaterialsTable.id, id));
  res.status(204).end();
});

router.post("/forum/materials/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const user = await currentUser(auth.userId);
  if (!user || (auth.accountRole !== "admin" && (user.role !== "teacher" || !user.teacherVerified))) {
    res.status(403).json({ error: "Only verified teachers can approve student materials" });
    return;
  }
  const id = Number(req.params.id);
  const [material] = await db.select({ role: forumMaterialsTable.uploaderRole })
    .from(forumMaterialsTable).where(eq(forumMaterialsTable.id, id));
  if (!material) { res.status(404).json({ error: "Material not found" }); return; }
  if (material.role !== "student") {
    res.status(400).json({ error: "Only student uploads need teacher approval" });
    return;
  }
  await db.insert(forumMaterialApprovalsTable).values({
    materialId: id,
    teacherId: user.id,
    teacherName: user.name,
  }).onConflictDoNothing();
  res.json(await materialResult(id, auth.userId));
});

async function postResults(ids: number[], userId: number, accountRole: string) {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return [];
  const posts = await db.select({
    id: forumPostsTable.id,
    classId: forumPostsTable.classId,
    authorId: forumPostsTable.authorId,
    authorName: forumPostsTable.authorName,
    authorRole: forumPostsTable.authorRole,
    kind: forumPostsTable.kind,
    title: forumPostsTable.title,
    body: forumPostsTable.body,
    tags: forumPostsTable.tags,
    surveyOptions: forumPostsTable.surveyOptions,
    quotedPostId: forumPostsTable.quotedPostId,
    attachmentMaterialId: forumPostsTable.attachmentMaterialId,
    attachmentFileName: forumPostsTable.attachmentFileName,
    attachmentMimeType: forumPostsTable.attachmentMimeType,
    moderationStatus: forumPostsTable.moderationStatus,
    moderationNote: forumPostsTable.moderationNote,
    viewCount: forumPostsTable.viewCount,
    createdAt: forumPostsTable.createdAt,
    likeCount: sql<number>`cast((select count(*) from forum_likes where target_type = 'post' and target_id = ${forumPostsTable.id}) as int)`,
    commentCount: sql<number>`cast((select count(*) from forum_comments where target_type = 'post' and target_id = ${forumPostsTable.id} and moderation_status = 'approved') as int)`,
    likedByMe: sql<boolean>`exists(select 1 from forum_likes where target_type = 'post' and target_id = ${forumPostsTable.id} and user_id = ${userId})`,
    repostCount: sql<number>`cast((select count(*) from forum_post_reposts where post_id = ${forumPostsTable.id}) as int)`,
    repostedByMe: sql<boolean>`exists(select 1 from forum_post_reposts where post_id = ${forumPostsTable.id} and user_id = ${userId})`,
  }).from(forumPostsTable).where(inArray(forumPostsTable.id, uniqueIds));

  const surveyIds = posts.filter((post) => post.kind === "survey").map((post) => post.id);
  const quotedIds = [...new Set(posts.map((post) => post.quotedPostId)
    .filter((id): id is number => id != null))];
  const [voteRows, myVoteRows, quotedRows] = await Promise.all([
    surveyIds.length
      ? db.select({
          postId: forumSurveyVotesTable.postId,
          optionId: forumSurveyVotesTable.optionId,
          count: sql<number>`cast(count(*) as int)`,
        }).from(forumSurveyVotesTable)
        .where(inArray(forumSurveyVotesTable.postId, surveyIds))
        .groupBy(forumSurveyVotesTable.postId, forumSurveyVotesTable.optionId)
      : Promise.resolve([]),
    surveyIds.length
      ? db.select({ postId: forumSurveyVotesTable.postId, optionId: forumSurveyVotesTable.optionId })
        .from(forumSurveyVotesTable)
        .where(and(
          inArray(forumSurveyVotesTable.postId, surveyIds),
          eq(forumSurveyVotesTable.userId, userId),
        ))
      : Promise.resolve([]),
    quotedIds.length
      ? db.select({
          id: forumPostsTable.id,
          authorName: forumPostsTable.authorName,
          authorRole: forumPostsTable.authorRole,
          title: forumPostsTable.title,
          body: forumPostsTable.body,
          tags: forumPostsTable.tags,
          createdAt: forumPostsTable.createdAt,
        }).from(forumPostsTable)
        .where(and(
          inArray(forumPostsTable.id, quotedIds),
          ...(accountRole === "admin" ? [] : [eq(forumPostsTable.moderationStatus, "approved")]),
        ))
      : Promise.resolve([]),
  ]);

  const votesByPost = new Map<number, Array<{ optionId: string; count: number }>>();
  for (const vote of voteRows) {
    const current = votesByPost.get(vote.postId) ?? [];
    current.push({ optionId: vote.optionId, count: vote.count });
    votesByPost.set(vote.postId, current);
  }
  const myVoteByPost = new Map(myVoteRows.map((vote) => [vote.postId, vote.optionId]));
  const quotedById = new Map(quotedRows.map((post) => [post.id, post]));
  const postById = new Map(posts.map((post) => [post.id, post]));
  return ids.flatMap((id) => {
    const post = postById.get(id);
    return post ? [{
      ...post,
      votes: votesByPost.get(post.id) ?? [],
      myVote: myVoteByPost.get(post.id) ?? null,
      quotedPost: post.quotedPostId ? (quotedById.get(post.quotedPostId) ?? null) : null,
    }] : [];
  });
}

async function postResult(id: number, userId: number, accountRole: string) {
  return (await postResults([id], userId, accountRole))[0] ?? null;
}

router.get("/forum/posts", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const classId = Number(req.query.classId) || null;
  if (classId && !(await canAccessClass(auth, classId))) {
    res.status(403).json({ error: "You are not a member of this class" });
    return;
  }
  const q = cleanText(req.query.q, 160);
  const tag = cleanText(req.query.tag, 40);
  const kind = cleanText(req.query.kind, 20);
  const conditions = [
    classId
      ? eq(forumPostsTable.classId, classId)
      : isNull(forumPostsTable.classId),
  ];
  if (auth.accountRole !== "admin")
    conditions.push(eq(forumPostsTable.moderationStatus, "approved"));
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(or(
      ilike(forumPostsTable.title, pattern),
      ilike(forumPostsTable.body, pattern),
      ilike(forumPostsTable.authorName, pattern),
      sql`${forumPostsTable.tags}::text ilike ${pattern}`,
    )!);
  }
  if (tag) conditions.push(sql`${forumPostsTable.tags}::text ilike ${'%"' + tag + '"%'}`);
  if (kind === "post" || kind === "survey")
    conditions.push(eq(forumPostsTable.kind, kind));
  const rows = await db.select({ id: forumPostsTable.id }).from(forumPostsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(forumPostsTable.createdAt)).limit(100);
  res.json(await postResults(rows.map((row) => row.id), auth.userId, auth.accountRole));
});

router.post(
  "/forum/posts",
  contentLimiter,
  requireAuth,
  postUpload.single("file"),
  async (req, res): Promise<void> => {
    const auth = req as AuthenticatedRequest;
    const user = await currentUser(auth.userId);
    if (!user) {
      res.status(401).json({ error: "Account not found" });
      return;
    }
    const classId = Number(req.body?.classId) || null;
    if (classId && !(await canAccessClass(auth, classId))) {
      res.status(403).json({ error: "You are not a member of this class" });
      return;
    }
    const kind = req.body?.kind === "survey" ? "survey" : "post";
    const title = cleanText(req.body?.title, 180);
    const body = cleanText(req.body?.body, 5000);
    const tags = normalizeForumPostTags(cleanList(req.body?.tags, 8));
    const quotedPostId = Number(req.body?.quotedPostId) || null;
    const attachmentMaterialId = Number(req.body?.attachmentMaterialId) || null;
    const options = cleanList(req.body?.surveyOptions, 8)
      .map((text, index) => ({ id: `option-${index + 1}`, text }));
    if (!body || (kind === "survey" && options.length < 2)) {
      res.status(400).json({
        error:
          kind === "survey"
            ? "Surveys need a question and at least two options"
            : "Post text is required",
      });
      return;
    }
    if (attachmentMaterialId) {
      const [material] = await db
        .select({ id: forumMaterialsTable.id })
        .from(forumMaterialsTable)
        .where(eq(forumMaterialsTable.id, attachmentMaterialId));
      if (!material) {
        res.status(400).json({ error: "Attached material not found" });
        return;
      }
    }
    if (quotedPostId) {
      const [quotedPost] = await db.select({
        id: forumPostsTable.id,
        classId: forumPostsTable.classId,
        moderationStatus: forumPostsTable.moderationStatus,
      }).from(forumPostsTable).where(eq(forumPostsTable.id, quotedPostId));
      if (
        !quotedPost ||
        quotedPost.classId !== classId ||
        (auth.accountRole !== "admin" && quotedPost.moderationStatus !== "approved")
      ) {
        res.status(400).json({ error: "Quoted post is not available in this forum" });
        return;
      }
    }

    let attachmentMimeType: string | null = null;
    let attachmentFileName: string | null = null;
    let attachmentFileBase64: string | null = null;
    if (req.file) {
      attachmentMimeType = fileKind(req.file);
      if (!attachmentMimeType) {
        res.status(415).json({
          error: "Attach a valid PDF, DOCX, JPG, PNG, MOV, or MP4 file",
        });
        return;
      }
      attachmentFileName = req.file.originalname
        .replace(/[^a-zA-Z0-9._() -]/g, "_")
        .slice(0, 180);
      attachmentFileBase64 = req.file.buffer.toString("base64");
    }

    const moderation = await moderateForumText(
      [title, body, ...tags, attachmentFileName].filter(Boolean).join("\n"),
      true,
    );
    if (moderation.flagged) {
      res.status(422).json({
        error: "This post needs changes before publishing",
        moderation: moderation.assessment,
      });
      return;
    }
    const created = await db.transaction(async (tx) => {
      let resolvedMaterialId = attachmentMaterialId;
      const catalogFile = Boolean(
        req.file &&
          !resolvedMaterialId &&
          shouldCatalogForumFile(tags, classId),
      );
      if (catalogFile && req.file && attachmentMimeType) {
        const fileTitle = req.file.originalname
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim();
        const baseTitle = cleanText(title || fileTitle || "Forum material", 180);
        const [duplicate] = await tx
          .select({ id: forumMaterialsTable.id })
          .from(forumMaterialsTable)
          .where(ilike(forumMaterialsTable.title, baseTitle));
        const catalogTitle = duplicate
          ? cleanText(
              `${baseTitle.slice(0, 140)} · ${user.name.slice(0, 24)} ${Date.now().toString(36)}`,
              180,
            )
          : baseTitle;
        const [material] = await tx
          .insert(forumMaterialsTable)
          .values({
            title: catalogTitle,
            description: body,
            unit: "Forum",
            topic: tags.find((tag) => tag !== "material" && tag !== "fun") || "Community",
            materialType: inferForumMaterialType(tags, attachmentMimeType),
            tags: [...new Set(["material", ...tags])],
            sources: [],
            uploaderId: user.id,
            uploaderName: user.name,
            uploaderRole:
              auth.accountRole === "admin"
                ? "admin"
                : auth.userRole === "teacher"
                  ? "teacher"
                  : "student",
            fileName: attachmentFileName,
            mimeType: attachmentMimeType,
            fileBase64: attachmentFileBase64,
            moderationNote: moderation.assessment,
          })
          .returning({ id: forumMaterialsTable.id });
        resolvedMaterialId = material.id;
      }

      const [post] = await tx
        .insert(forumPostsTable)
        .values({
          classId,
          authorId: user.id,
          authorName: user.name,
          authorRole:
            auth.accountRole === "admin"
              ? "admin"
              : auth.userRole === "teacher"
                ? "teacher"
                : "student",
          kind,
          title: title || null,
          body,
          tags,
          surveyOptions: options,
          quotedPostId,
          attachmentMaterialId: resolvedMaterialId,
          attachmentFileName: catalogFile ? null : attachmentFileName,
          attachmentMimeType: catalogFile ? null : attachmentMimeType,
          attachmentFileBase64: catalogFile ? null : attachmentFileBase64,
          moderationNote: moderation.assessment,
        })
        .returning({ id: forumPostsTable.id });
      return post;
    });
    res.status(201).json(await postResult(created.id, auth.userId, auth.accountRole));
  },
);

router.get("/forum/posts/:id/file", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await canAccessPost(auth, id))) {
    res.status(404).json({ error: "Post attachment not found" });
    return;
  }
  const [post] = await db.select({
    fileName: forumPostsTable.attachmentFileName,
    mimeType: forumPostsTable.attachmentMimeType,
    fileBase64: forumPostsTable.attachmentFileBase64,
  }).from(forumPostsTable).where(eq(forumPostsTable.id, id));
  if (!post?.fileName || !post.mimeType || !post.fileBase64) {
    res.status(404).json({ error: "Post attachment not found" });
    return;
  }
  res.setHeader("Content-Type", post.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(post.fileName)}`,
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(Buffer.from(post.fileBase64, "base64"));
});

router.delete("/forum/posts/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const id = Number(req.params.id);
  const [post] = await db.select({ authorId: forumPostsTable.authorId })
    .from(forumPostsTable).where(eq(forumPostsTable.id, id));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  if (post.authorId !== auth.userId && auth.accountRole !== "admin") {
    res.status(403).json({ error: "Only the author or an administrator can delete this post" });
    return;
  }
  await db.delete(forumPostsTable).where(eq(forumPostsTable.id, id));
  res.status(204).end();
});

router.post("/forum/posts/:id/repost", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await canAccessPost(auth, id))) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const [post] = await db.select({ moderationStatus: forumPostsTable.moderationStatus })
    .from(forumPostsTable).where(eq(forumPostsTable.id, id));
  if (!post || (auth.accountRole !== "admin" && post.moderationStatus !== "approved")) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const [existing] = await db.select({ id: forumPostRepostsTable.id })
    .from(forumPostRepostsTable)
    .where(and(
      eq(forumPostRepostsTable.postId, id),
      eq(forumPostRepostsTable.userId, auth.userId),
    ));
  if (existing) {
    await db.delete(forumPostRepostsTable).where(eq(forumPostRepostsTable.id, existing.id));
  } else {
    await db.insert(forumPostRepostsTable).values({ postId: id, userId: auth.userId });
  }
  const [count] = await db.select({ value: sql<number>`cast(count(*) as int)` })
    .from(forumPostRepostsTable).where(eq(forumPostRepostsTable.postId, id));
  res.json({ reposted: !existing, repostCount: count?.value ?? 0 });
});

router.post("/forum/posts/:id/vote", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const id = Number(req.params.id);
  if (!(await canAccessPost(auth, id))) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const optionId = cleanText(req.body?.optionId, 80);
  const [post] = await db.select({ kind: forumPostsTable.kind, options: forumPostsTable.surveyOptions })
    .from(forumPostsTable).where(eq(forumPostsTable.id, id));
  if (!post || post.kind !== "survey" || !post.options.some((option) => option.id === optionId)) {
    res.status(400).json({ error: "Invalid survey option" });
    return;
  }
  await db.insert(forumSurveyVotesTable).values({ postId: id, userId: auth.userId, optionId })
    .onConflictDoUpdate({
      target: [forumSurveyVotesTable.postId, forumSurveyVotesTable.userId],
      set: { optionId },
    });
  res.json(await postResult(id, auth.userId, auth.accountRole));
});

router.delete("/forum/posts/:id/vote", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const id = Number(req.params.id);
  if (!(await canAccessPost(auth, id))) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  await db.delete(forumSurveyVotesTable).where(and(
    eq(forumSurveyVotesTable.postId, id),
    eq(forumSurveyVotesTable.userId, auth.userId),
  ));
  res.json(await postResult(id, auth.userId, auth.accountRole));
});

router.post("/forum/:targetType/:id/like", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const targetType = cleanText(req.params.targetType, 20);
  const targetId = Number(req.params.id);
  if (!TARGET_TYPES.has(targetType) || !targetId) {
    res.status(400).json({ error: "Invalid like target" });
    return;
  }
  const typedTarget = targetType as "material" | "post";
  if (typedTarget === "post" && !(await canAccessPost(auth, targetId))) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const [existing] = await db.select({ id: forumLikesTable.id }).from(forumLikesTable)
    .where(and(eq(forumLikesTable.userId, auth.userId), eq(forumLikesTable.targetType, typedTarget), eq(forumLikesTable.targetId, targetId)));
  if (existing) {
    await db.delete(forumLikesTable).where(eq(forumLikesTable.id, existing.id));
    res.json({ liked: false });
  } else {
    await db.insert(forumLikesTable).values({ userId: auth.userId, targetType: typedTarget, targetId });
    res.json({ liked: true });
  }
});

router.get("/forum/:targetType/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const targetType = cleanText(req.params.targetType, 20);
  const targetId = Number(req.params.id);
  if (!TARGET_TYPES.has(targetType) || !targetId) {
    res.status(400).json({ error: "Invalid comment target" });
    return;
  }
  if (targetType === "post" && !(await canAccessPost(auth, targetId))) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const rows = await db.select().from(forumCommentsTable)
    .where(and(
      eq(forumCommentsTable.targetType, targetType as "material" | "post"),
      eq(forumCommentsTable.targetId, targetId),
      eq(forumCommentsTable.moderationStatus, "approved"),
    )).orderBy(asc(forumCommentsTable.createdAt));
  res.json(rows);
});

router.post("/forum/:targetType/:id/comments", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const targetType = cleanText(req.params.targetType, 20);
  const targetId = Number(req.params.id);
  const body = cleanText(req.body?.body, 2000);
  const parentId = Number(req.body?.parentId) || null;
  if (!TARGET_TYPES.has(targetType) || !targetId || !body) {
    res.status(400).json({ error: "Comment text is required" });
    return;
  }
  if (targetType === "post" && !(await canAccessPost(auth, targetId))) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const user = await currentUser(auth.userId);
  if (!user) { res.status(401).json({ error: "Account not found" }); return; }
  const moderation = await moderateForumText(body);
  if (moderation.flagged) {
    res.status(422).json({ error: "This comment needs changes before publishing", moderation: moderation.assessment });
    return;
  }
  const [created] = await db.insert(forumCommentsTable).values({
    authorId: user.id,
    authorName: user.name,
    authorRole: (auth.accountRole === "admin" ? "admin" : auth.userRole === "teacher" ? "teacher" : "student"),
    targetType: targetType as "material" | "post",
    targetId,
    parentId,
    body,
    moderationNote: moderation.assessment,
  }).returning();
  res.status(201).json(created);
});

router.delete("/forum/comments/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const id = Number(req.params.id);
  const [comment] = await db.select({ authorId: forumCommentsTable.authorId })
    .from(forumCommentsTable).where(eq(forumCommentsTable.id, id));
  if (!comment) { res.status(404).json({ error: "Comment not found" }); return; }
  if (comment.authorId !== auth.userId && auth.accountRole !== "admin") {
    res.status(403).json({ error: "Only the author or an administrator can delete this comment" });
    return;
  }
  await db.delete(forumCommentsTable).where(eq(forumCommentsTable.id, id));
  res.status(204).end();
});

async function reportContent(targetType: string, targetId: number) {
  if (targetType === "material") {
    const [item] = await db.select({
      title: forumMaterialsTable.title,
      description: forumMaterialsTable.description,
      unit: forumMaterialsTable.unit,
      topic: forumMaterialsTable.topic,
      linkUrl: forumMaterialsTable.linkUrl,
      sources: forumMaterialsTable.sources,
    }).from(forumMaterialsTable).where(eq(forumMaterialsTable.id, targetId));
    return item ? [item.title, item.description, item.unit, item.topic, item.linkUrl, ...(item.sources ?? [])].filter(Boolean).join("\n") : null;
  }
  if (targetType === "post") {
    const [item] = await db.select({ title: forumPostsTable.title, body: forumPostsTable.body })
      .from(forumPostsTable).where(eq(forumPostsTable.id, targetId));
    return item ? [item.title, item.body].filter(Boolean).join("\n") : null;
  }
  const [item] = await db.select({ body: forumCommentsTable.body })
    .from(forumCommentsTable).where(eq(forumCommentsTable.id, targetId));
  return item?.body ?? null;
}

router.post("/forum/reports", contentLimiter, requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  const targetType = cleanText(req.body?.targetType, 20);
  const targetId = Number(req.body?.targetId);
  const reason = cleanText(req.body?.reason, 1000);
  if (!REPORT_TARGET_TYPES.has(targetType) || !targetId || !reason) {
    res.status(400).json({ error: "Report target and reason are required" });
    return;
  }
  const user = await currentUser(auth.userId);
  const content = await reportContent(targetType, targetId);
  if (!user || content == null) { res.status(404).json({ error: "Reported content not found" }); return; }
  const moderation = await moderateForumText(content + "\nREPORT REASON:\n" + reason, true);
  const [report] = await db.insert(forumReportsTable).values({
    reporterId: user.id,
    reporterName: user.name,
    targetType: targetType as "material" | "post" | "comment",
    targetId,
    reason,
    aiFlagged: moderation.flagged,
    aiAssessment: moderation.assessment,
  }).returning();
  if (moderation.flagged) {
    if (targetType === "material")
      await db.update(forumMaterialsTable).set({ moderationStatus: "hidden", moderationNote: moderation.assessment }).where(eq(forumMaterialsTable.id, targetId));
    if (targetType === "post")
      await db.update(forumPostsTable).set({ moderationStatus: "hidden", moderationNote: moderation.assessment }).where(eq(forumPostsTable.id, targetId));
    if (targetType === "comment")
      await db.update(forumCommentsTable).set({ moderationStatus: "hidden", moderationNote: moderation.assessment }).where(eq(forumCommentsTable.id, targetId));
  }
  res.status(201).json(report);
});

router.get("/forum/reports", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  if (auth.accountRole !== "admin") { res.status(403).json({ error: "Administrator access required" }); return; }
  const reports = await db.select().from(forumReportsTable)
    .orderBy(desc(forumReportsTable.createdAt)).limit(200);
  res.json(reports);
});

router.patch("/forum/reports/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = req as AuthenticatedRequest;
  if (auth.accountRole !== "admin") { res.status(403).json({ error: "Administrator access required" }); return; }
  const id = Number(req.params.id);
  const status = req.body?.status === "resolved" ? "resolved" : req.body?.status === "dismissed" ? "dismissed" : null;
  if (!id || !status) { res.status(400).json({ error: "Invalid report update" }); return; }
  const [report] = await db.update(forumReportsTable)
    .set({ status, reviewedAt: new Date().toISOString() })
    .where(eq(forumReportsTable.id, id)).returning();
  res.json(report);
});

export default router;
