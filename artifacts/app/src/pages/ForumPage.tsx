import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useSearch } from "wouter";
import {
  ArrowLeft,
  ArrowBigUp,
  BarChart3,
  CheckCircle2,
  Download,
  Eye,
  Flag,
  Heart,
  Link2,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Paperclip,
  Plus,
  Quote,
  Repeat2,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  GraduationCap,
} from "lucide-react";
import { useGetMe, useListClasses } from "@workspace/api-client-react";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/edu-ds/components/ui/dialog";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/edu-ds/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/edu-ds/components/ui/tabs";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { Switch } from "@workspace/edu-ds/components/ui/switch";
import { toast } from "@workspace/edu-ds/hooks/use-toast";

type Approval = { id: number; teacherName: string; createdAt: string };
type Material = {
  id: number;
  title: string;
  description: string | null;
  unit: string;
  topic: string;
  materialType: string;
  tags: string[];
  sources: string[];
  uploaderId: number | null;
  uploaderName: string;
  uploaderRole: string;
  linkUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  moderationStatus: string;
  moderationNote: string | null;
  viewCount: number;
  downloadCount: number;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  createdAt: string;
  approvals: Approval[];
};
type SurveyOption = { id: string; text: string };
type QuotedPost = {
  id: number;
  authorName: string;
  authorRole: string;
  title: string | null;
  body: string;
  tags: string[];
  createdAt: string;
};
type ForumPost = {
  id: number;
  authorId: number | null;
  authorName: string;
  authorRole: string;
  kind: "post" | "survey";
  title: string | null;
  body: string;
  tags: string[];
  surveyOptions: SurveyOption[];
  allowMultipleVotes: boolean;
  quotedPostId: number | null;
  quotedPost: QuotedPost | null;
  attachmentMaterialId: number | null;
  attachmentFileName: string | null;
  attachmentMimeType: string | null;
  classId: number | null;
  moderationStatus: string;
  moderationNote: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  repostCount: number;
  repostedByMe: boolean;
  createdAt: string;
  votes: Array<{ optionId: string; count: number }>;
  myVote?: string | null;
  myVotes?: string[];
};
type ForumComment = {
  id: number;
  authorId: number | null;
  authorName: string;
  authorRole: string;
  parentId: number | null;
  body: string;
  createdAt: string;
};
type Report = {
  id: number;
  reporterName: string;
  targetType: "material" | "post" | "comment";
  targetId: number;
  reason: string;
  status: string;
  aiFlagged: boolean;
  aiAssessment: string | null;
  createdAt: string;
};
type ForumAccess = {
  isAdmin: boolean;
  teacherVerified: boolean;
  canApprove: boolean;
};

const MATERIAL_TYPES = [
  ["video", "Video / lecture / problem solving"],
  ["infographic", "Infographic / graph / image"],
  ["article", "Student article / research"],
  ["worksheet", "Worksheet"],
  ["activity", "Activity"],
  ["notes", "Notes"],
] as const;
const POST_TAGS = [
  "fun",
  "activity",
  "canvas",
  "material",
  "idea",
  "thought",
  "criticism",
  "fun-fact",
  "advice",
  "tactics",
  "question",
  "discussion",
];

function apiUrl(path: string) {
  return import.meta.env.BASE_URL.replace(/\/$/, "") + "/api" + path;
}

async function forumRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const form = init?.body instanceof FormData;
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Authorization: "Bearer " + localStorage.getItem("schoolar_token"),
      ...(!form && init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      moderation?: string;
    } | null;
    throw new Error(
      [body?.error, body?.moderation].filter(Boolean).join(": ") ||
        "Forum request failed",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

function roleLabel(role: string) {
  return role === "teacher"
    ? "Teacher"
    : role === "admin"
      ? "Admin"
      : "Student";
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function profileHandle(name: string) {
  const handle = name
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  return "@" + (handle || "member");
}

function csv(value: FormDataEntryValue | null) {
  return typeof value === "string"
    ? value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function inlineMarkdown(text: string, keyPrefix: string) {
  const tokens = text.split(
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g,
  );
  return tokens.map((token, index): ReactNode => {
    const key = keyPrefix + "-" + index;
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={key}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("*") && token.endsWith("*")) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }
    if (token.startsWith("`") && token.endsWith("`")) {
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {token.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
    if (link) {
      return (
        <a
          key={key}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-2"
        >
          {link[1]}
        </a>
      );
    }
    return token;
  });
}

function MarkdownText({ value }: { value: string }) {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre
          key={"code-" + index}
          className="overflow-x-auto rounded-md bg-muted p-3 text-xs"
        >
          <code data-language={language || undefined}>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = inlineMarkdown(heading[2], "heading-" + index);
      blocks.push(
        level === 1 ? (
          <h2 key={index} className="text-xl font-bold">
            {content}
          </h2>
        ) : level === 2 ? (
          <h3 key={index} className="text-lg font-bold">
            {content}
          </h3>
        ) : (
          <h4 key={index} className="font-bold">
            {content}
          </h4>
        ),
      );
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={"quote-" + index}
          className="border-l-2 border-primary pl-3 text-muted-foreground"
        >
          {inlineMarkdown(quote.join(" "), "quote-" + index)}
        </blockquote>,
      );
      continue;
    }
    const unordered = /^[-*]\s+/.test(line);
    const ordered = /^\d+\.\s+/.test(line);
    if (unordered || ordered) {
      const items: string[] = [];
      const matcher = unordered ? /^[-*]\s+/ : /^\d+\.\s+/;
      while (index < lines.length && matcher.test(lines[index])) {
        items.push(lines[index].replace(matcher, ""));
        index += 1;
      }
      const children = items.map((item, itemIndex) => (
        <li key={itemIndex}>
          {inlineMarkdown(item, "item-" + index + "-" + itemIndex)}
        </li>
      ));
      blocks.push(
        unordered ? (
          <ul key={"list-" + index} className="list-disc space-y-1 pl-5">
            {children}
          </ul>
        ) : (
          <ol key={"list-" + index} className="list-decimal space-y-1 pl-5">
            {children}
          </ol>
        ),
      );
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,3})\s+|^>\s?|^[-*]\s+|^\d+\.\s+|^```/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={"paragraph-" + index}>
        {inlineMarkdown(paragraph.join(" "), "paragraph-" + index)}
      </p>,
    );
  }
  return (
    <div className="space-y-3 break-words text-[15px] leading-relaxed">
      {blocks}
    </div>
  );
}

export default function ForumPage({
  classIdOverride,
  embedded = false,
  catalogOnly = false,
}: {
  classIdOverride?: number;
  embedded?: boolean;
  catalogOnly?: boolean;
} = {}) {
  const routeSearch = useSearch();
  const requestedClassId = Number(
    new URLSearchParams(routeSearch).get("classId"),
  );
  const classId = classIdOverride ?? (
    Number.isInteger(requestedClassId) && requestedClassId > 0
      ? requestedClassId
      : null);
  const { data: me } = useGetMe();
  const { data: joinedClasses } = useListClasses();
  const [access, setAccess] = useState<ForumAccess>({
    isAdmin: false,
    teacherVerified: false,
    canApprove: false,
  });
  const [materials, setMaterials] = useState<Material[]>([]);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [materialDialog, setMaterialDialog] = useState(false);
  const [postDialog, setPostDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [materialQuery, setMaterialQuery] = useState("");
  const [unit, setUnit] = useState("");
  const [topic, setTopic] = useState("");
  const [materialType, setMaterialType] = useState("all");
  const [uploader, setUploader] = useState("");
  const [materialDate, setMaterialDate] = useState("all");
  const [materialSort, setMaterialSort] = useState("newest");
  const [postQuery, setPostQuery] = useState("");
  const [postKind, setPostKind] = useState("all");
  const [postTag, setPostTag] = useState("all");
  const [postMode, setPostMode] = useState<"post" | "survey">("post");
  const [surveyOptions, setSurveyOptions] = useState(["", ""]);
  const [surveyAllowMultiple, setSurveyAllowMultiple] = useState(false);
  const [quoteTarget, setQuoteTarget] = useState<ForumPost | null>(null);
  const [repostingIds, setRepostingIds] = useState<number[]>([]);

  async function loadAccess() {
    const value = await forumRequest<ForumAccess>("/forum/access");
    setAccess(value);
    if (value.isAdmin) {
      setReports(await forumRequest<Report[]>("/forum/reports"));
    }
  }

  async function loadMaterials() {
    setLoadingMaterials(true);
    try {
      const params = new URLSearchParams();
      if (materialQuery.trim()) params.set("q", materialQuery.trim());
      if (unit.trim()) params.set("unit", unit.trim());
      if (topic.trim()) params.set("topic", topic.trim());
      if (materialType !== "all") params.set("type", materialType);
      if (uploader.trim()) params.set("uploader", uploader.trim());
      if (materialDate !== "all") params.set("date", materialDate);
      if (materialSort !== "newest") params.set("sort", materialSort);
      setMaterials(
        await forumRequest<Material[]>("/forum/materials?" + params),
      );
    } catch (error) {
      toast({
        title: "Could not load materials",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingMaterials(false);
    }
  }

  async function loadPosts() {
    setLoadingPosts(true);
    try {
      const params = new URLSearchParams();
      if (postQuery.trim()) params.set("q", postQuery.trim());
      if (postKind !== "all") params.set("kind", postKind);
      if (postTag !== "all") params.set("tag", postTag);
      if (classId) params.set("classId", String(classId));
      setPosts(await forumRequest<ForumPost[]>("/forum/posts?" + params));
    } catch (error) {
      toast({
        title: "Could not load posts",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingPosts(false);
    }
  }

  useEffect(() => {
    void loadAccess();
    void loadMaterials();
    void loadPosts();
  }, []);

  async function createMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const data = new FormData(event.currentTarget);
      const payload = new FormData();
      for (const key of [
        "title",
        "description",
        "unit",
        "topic",
        "materialType",
        "linkUrl",
      ]) {
        const value = data.get(key);
        if (value) payload.set(key, value);
      }
      payload.set(
        "tags",
        JSON.stringify(csv(data.get("tags")))
          .slice(1, -1)
          .replaceAll('"', ""),
      );
      payload.set("sources", csv(data.get("sources")).join("\n"));
      const file = data.get("file");
      if (file instanceof File && file.size) payload.set("file", file);
      await forumRequest<Material>("/forum/materials", {
        method: "POST",
        body: payload,
      });
      event.currentTarget.reset();
      setMaterialDialog(false);
      await loadMaterials();
      toast({ title: "Material published" });
    } catch (error) {
      toast({
        title: "Could not publish material",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    try {
      const values = new FormData(form);
      const payload = new FormData();
      payload.set("kind", postMode);
      payload.set("title", String(values.get("title") ?? ""));
      payload.set("body", String(values.get("body") ?? ""));
      payload.set("tags", csv(values.get("tags")).join("\n"));
      if (quoteTarget) payload.set("quotedPostId", String(quoteTarget.id));
      payload.set(
        "surveyOptions",
        postMode === "survey"
          ? surveyOptions.filter((item) => item.trim()).join("\n")
          : "",
      );
      payload.set("allowMultipleVotes", String(surveyAllowMultiple));
      const materialId = values.get("attachmentMaterialId");
      if (materialId && materialId !== "none") {
        payload.set("attachmentMaterialId", String(materialId));
      }
      const file = values.get("file");
      if (file instanceof File && file.size > 0) payload.set("file", file);
      if (classId) payload.set("classId", String(classId));

      const created = await forumRequest<ForumPost>("/forum/posts", {
        method: "POST",
        body: payload,
      });
      form.reset();
      setSurveyOptions(["", ""]);
      setSurveyAllowMultiple(false);
      setQuoteTarget(null);
      setPostDialog(false);
      setPosts((current) => [created, ...current]);
      if (created.attachmentMaterialId) await loadMaterials();
      toast({
        title: postMode === "survey" ? "Survey published" : "Post published",
      });
    } catch (error) {
      toast({
        title: "Could not publish",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleLike(type: "material" | "post", id: number) {
    const collection = type === "material" ? materials : posts;
    const previous = collection.find((item) => item.id === id);
    if (!previous) return;
    const optimistic = { ...previous, likedByMe: !previous.likedByMe, likeCount: Math.max(0, previous.likeCount + (previous.likedByMe ? -1 : 1)) };
    if (type === "material") setMaterials((current) => current.map((item) => item.id === id ? optimistic as Material : item));
    else setPosts((current) => current.map((item) => item.id === id ? optimistic as ForumPost : item));
    try {
      const result = await forumRequest<{ liked: boolean }>("/forum/" + type + "/" + id + "/like", { method: "POST" });
      const confirmed = { ...optimistic, likedByMe: result.liked, likeCount: result.liked === optimistic.likedByMe ? optimistic.likeCount : Math.max(0, optimistic.likeCount + (result.liked ? 1 : -1)) };
      if (type === "material") setMaterials((current) => current.map((item) => item.id === id ? confirmed as Material : item));
      else setPosts((current) => current.map((item) => item.id === id ? confirmed as ForumPost : item));
    } catch (error) {
      if (type === "material") setMaterials((current) => current.map((item) => item.id === id ? previous as Material : item));
      else setPosts((current) => current.map((item) => item.id === id ? previous as ForumPost : item));
      toast({ title: "Action did not register", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  }

  async function toggleRepost(post: ForumPost) {
    if (repostingIds.includes(post.id)) return;
    const previous = post;
    const optimistic = {
      ...post,
      repostedByMe: !post.repostedByMe,
      repostCount: Math.max(0, post.repostCount + (post.repostedByMe ? -1 : 1)),
    };
    setRepostingIds((current) => [...current, post.id]);
    setPosts((current) => current.map((item) => item.id === post.id ? optimistic : item));
    try {
      const result = await forumRequest<{ reposted: boolean; repostCount: number }>(
        "/forum/posts/" + post.id + "/repost",
        { method: "POST" },
      );
      setPosts((current) => current.map((item) => item.id === post.id ? {
        ...item,
        repostedByMe: result.reposted,
        repostCount: result.repostCount,
      } : item));
    } catch (error) {
      setPosts((current) => current.map((item) => item.id === post.id ? previous : item));
      toast({
        title: "Repost did not register",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRepostingIds((current) => current.filter((id) => id !== post.id));
    }
  }

  async function report(type: "material" | "post" | "comment", id: number) {
    const reason = window.prompt(
      "What is incorrect, inappropriate, or unsafe about this content?",
    );
    if (!reason?.trim()) return;
    try {
      await forumRequest("/forum/reports", {
        method: "POST",
        body: JSON.stringify({ targetType: type, targetId: id, reason }),
      });
      toast({
        title: "Report submitted",
        description: "The content was checked and sent to administrators.",
      });
      if (access.isAdmin)
        setReports(await forumRequest<Report[]>("/forum/reports"));
    } catch (error) {
      toast({
        title: "Could not report content",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  async function remove(type: "material" | "post" | "comment", id: number) {
    if (!window.confirm("Delete this " + type + "?")) return;
    await forumRequest(
      "/forum/" + (type === "comment" ? "comments" : type + "s") + "/" + id,
      { method: "DELETE" },
    );
    if (type === "material") await loadMaterials();
    if (type === "post") setPosts((current) => current.filter((post) => post.id !== id));
  }

  async function downloadMaterial(material: Material) {
    if (material.linkUrl && !material.fileName) {
      await forumRequest("/forum/materials/" + material.id + "/view", {
        method: "POST",
      });
      window.open(material.linkUrl, "_blank", "noopener,noreferrer");
      await loadMaterials();
      return;
    }
    const response = await fetch(
      apiUrl("/forum/materials/" + material.id + "/file"),
      {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("schoolar_token"),
        },
      },
    );
    if (!response.ok) {
      toast({ title: "Download failed", variant: "destructive" });
      return;
    }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = material.fileName || material.title;
    anchor.click();
    URL.revokeObjectURL(href);
    await loadMaterials();
  }

  async function downloadPostFile(post: ForumPost) {
    const response = await fetch(apiUrl("/forum/posts/" + post.id + "/file"), {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("schoolar_token"),
      },
    });
    if (!response.ok) {
      toast({ title: "Download failed", variant: "destructive" });
      return;
    }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = post.attachmentFileName || "attachment";
    anchor.click();
    URL.revokeObjectURL(href);
  }

  async function approve(material: Material) {
    try {
      await forumRequest("/forum/materials/" + material.id + "/approve", {
        method: "POST",
      });
      await loadMaterials();
      toast({
        title: "Material approved",
        description: "Your verification is now shown on the upload.",
      });
    } catch (error) {
      toast({
        title: "Could not approve",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  async function vote(post: ForumPost, optionId: string) {
    const previous = post;
    const previousVotes = new Set(post.myVotes ?? (post.myVote ? [post.myVote] : []));
    const removingVote = previousVotes.has(optionId);
    const nextVotes = post.allowMultipleVotes
      ? new Set(previousVotes)
      : new Set<string>();
    if (removingVote) nextVotes.delete(optionId);
    else nextVotes.add(optionId);
    const counts = new Map(post.votes.map((item) => [item.optionId, item.count]));
    for (const previousVote of previousVotes) {
      if (!nextVotes.has(previousVote)) {
        counts.set(previousVote, Math.max(0, (counts.get(previousVote) ?? 0) - 1));
      }
    }
    for (const nextVote of nextVotes) {
      if (!previousVotes.has(nextVote)) counts.set(nextVote, (counts.get(nextVote) ?? 0) + 1);
    }
    const optimistic = { ...post, myVotes: [...nextVotes], votes: post.surveyOptions.map((option) => ({ optionId: option.id, count: counts.get(option.id) ?? 0 })) };
    setPosts((current) => current.map((item) => item.id === post.id ? optimistic : item));
    try {
      const updated = await forumRequest<ForumPost>("/forum/posts/" + post.id + "/vote", removingVote
        ? { method: "DELETE", body: JSON.stringify({ optionId }) }
        : { method: "POST", body: JSON.stringify({ optionId }) });
      setPosts((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      setPosts((current) => current.map((item) => item.id === post.id ? previous : item));
      toast({ title: "Vote did not register", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  }

  async function updateReport(
    reportId: number,
    status: "resolved" | "dismissed",
  ) {
    await forumRequest("/forum/reports/" + reportId, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setReports(await forumRequest<Report[]>("/forum/reports"));
  }

  const materialById = useMemo(
    () => new Map(materials.map((item) => [item.id, item])),
    [materials],
  );
  const popularTopics = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach((post) =>
      post.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)),
    );
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [posts]);

  return (
    <div className={embedded ? "space-y-6" : "mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8"}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {classId && !embedded && (
            <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
              <Link href={"/classes/" + classId}>
                <ArrowLeft className="mr-1 size-4" />
                Back to class
              </Link>
            </Button>
          )}
          <div className="flex items-center gap-2">
            <MessagesSquare className="size-6 text-primary" />
            <h1 className="text-2xl font-bold">
              {catalogOnly ? "Material catalog" : classId ? "Class forum" : "Education forum"}
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {catalogOnly
              ? "Browse activities, canvases, files, links, and other materials shared by the Schoolar community."
              : classId
              ? "A private feed for members of this class."
              : "Classroom ideas, questions, surveys, and peer discussion."}
          </p>
        </div>
      </header>

      <Tabs defaultValue={catalogOnly ? "materials" : "posts"}>
        {!catalogOnly && <TabsList
          className={
            classId
              ? "grid w-full grid-cols-1 sm:w-auto"
              : access.isAdmin
                ? "grid w-full grid-cols-3 sm:w-auto"
                : "grid w-full grid-cols-2 sm:w-auto"
          }
        >
          <TabsTrigger value="posts">
            <MessagesSquare className="mr-2 size-4" />
            Feed
          </TabsTrigger>
          {!classId && (
            <TabsTrigger value="classes">
              <GraduationCap className="mr-2 size-4" />
              Class forums
            </TabsTrigger>
          )}
          {!classId && access.isAdmin && (
            <TabsTrigger value="moderation">
              <ShieldCheck className="mr-2 size-4" />
              Moderation
            </TabsTrigger>
          )}
        </TabsList>}

        {!classId && (
          <TabsContent value="classes" className="mt-5 space-y-4">
            <div>
              <h2 className="font-semibold">Your class forums</h2>
              <p className="text-sm text-muted-foreground">
                Private discussions for classes you teach or have joined.
              </p>
            </div>
            {!joinedClasses?.length ? (
              <div className="border-y py-12 text-center">
                <GraduationCap className="mx-auto mb-3 size-8 text-muted-foreground" />
                <p className="font-medium">No class forums yet</p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href="/classes">Join or create a class</Link>
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {joinedClasses.map((item) => (
                  <Card
                    key={item.id}
                    className="transition-shadow hover:shadow-md"
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{item.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {item.subject} · {item.gradeLevel}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <Button asChild className="w-full">
                        <Link href={`/forum?classId=${item.id}`}>
                          <MessagesSquare className="mr-2 size-4" />
                          Open class forum
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {catalogOnly && <TabsContent value="materials" className="space-y-5">
          <section className="space-y-3 rounded-md border bg-background/90 p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={materialQuery}
                  onChange={(event) => setMaterialQuery(event.target.value)}
                  onKeyDown={(event) =>
                    event.key === "Enter" && loadMaterials()
                  }
                  placeholder="Search titles, tags, units, topics, uploaders..."
                  className="pl-9"
                />
              </div>
              <Button onClick={loadMaterials} disabled={loadingMaterials}>
                <Search className="mr-2 size-4" />
                Search
              </Button>
              <Dialog open={materialDialog} onOpenChange={setMaterialDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Upload className="mr-2 size-4" />
                    Upload material
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Upload learning material</DialogTitle>
                    <DialogDescription>
                      Publish an accepted file, YouTube video, or online
                      activity link.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    onSubmit={createMaterial}
                    className="grid gap-4 sm:grid-cols-2"
                  >
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Unique title</Label>
                      <Input name="title" maxLength={180} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Unit</Label>
                      <Input name="unit" maxLength={120} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Topic</Label>
                      <Input name="topic" maxLength={120} required />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Type</Label>
                      <Select name="materialType" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose material type" />
                        </SelectTrigger>
                        <SelectContent>
                          {MATERIAL_TYPES.map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Description</Label>
                      <Textarea name="description" rows={3} maxLength={2000} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tags</Label>
                      <Input
                        name="tags"
                        placeholder="algebra, practice, exam"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Online activity / YouTube link</Label>
                      <Input
                        name="linkUrl"
                        type="url"
                        placeholder="https://..."
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Sources</Label>
                      <Textarea
                        name="sources"
                        rows={3}
                        placeholder="One source or URL per line"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>File</Label>
                      <Input
                        name="file"
                        type="file"
                        accept=".pdf,.docx,.jpg,.jpeg,.png,.mov,.mp4"
                      />
                      <p className="text-xs text-muted-foreground">
                        PDF, DOCX, JPG, JPEG, PNG, MOV, or MP4. Maximum 25 MB.
                      </p>
                    </div>
                    <Button className="sm:col-span-2" disabled={submitting}>
                      {submitting ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 size-4" />
                      )}
                      Publish material
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <Input
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="Unit"
              />
              <Input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Topic"
              />
              <Select value={materialType} onValueChange={setMaterialType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {MATERIAL_TYPES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={materialDate} onValueChange={setMaterialDate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any date</SelectItem>
                  <SelectItem value="day">Past day</SelectItem>
                  <SelectItem value="week">Past week</SelectItem>
                  <SelectItem value="month">Past month</SelectItem>
                  <SelectItem value="year">Past year</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={uploader}
                onChange={(event) => setUploader(event.target.value)}
                placeholder="Uploader"
              />
              <Select value={materialSort} onValueChange={setMaterialSort}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                  <SelectItem value="downloads">Most downloaded</SelectItem>
                  <SelectItem value="views">Most viewed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          {loadingMaterials ? (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
              Loading materials...
            </div>
          ) : materials.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No materials match these filters.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {materials.map((material) => (
                <Card key={material.id} data-testid="forum-material">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-base">
                          {material.title}
                        </CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {material.unit} · {material.topic} ·{" "}
                          {new Date(material.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {MATERIAL_TYPES.find(
                          ([value]) => value === material.materialType,
                        )?.[1] || material.materialType}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge>
                        {roleLabel(material.uploaderRole)} ·{" "}
                        {material.uploaderName}
                      </Badge>
                      {material.approvals.map((approval) => (
                        <Badge key={approval.id} variant="secondary">
                          <CheckCircle2 className="mr-1 size-3" />
                          Approved by {approval.teacherName}
                        </Badge>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {material.description && (
                      <p className="text-sm">{material.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {material.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    {material.sources.length > 0 && (
                      <div className="text-xs">
                        <p className="font-medium">Sources</p>
                        {material.sources.map((source) =>
                          validSource(source) ? (
                            <a
                              key={source}
                              href={source}
                              target="_blank"
                              rel="noreferrer"
                              className="block break-all text-primary hover:underline"
                            >
                              {source}
                            </a>
                          ) : (
                            <p key={source}>{source}</p>
                          ),
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3 border-y py-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="size-3.5" />
                        {material.viewCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Download className="size-3.5" />
                        {material.downloadCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="size-3.5" />
                        {material.likeCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="size-3.5" />
                        {material.commentCount}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => downloadMaterial(material)}
                      >
                        {material.fileName ? (
                          <Download className="mr-1 size-3.5" />
                        ) : (
                          <Link2 className="mr-1 size-3.5" />
                        )}
                        {material.fileName ? "Download" : "Open link"}
                      </Button>
                      <Button
                        size="sm"
                        variant={material.likedByMe ? "default" : "outline"}
                        onClick={() => toggleLike("material", material.id)}
                      >
                        <Heart className="mr-1 size-3.5" />
                        Like
                      </Button>
                      {access.canApprove &&
                        material.uploaderRole === "student" &&
                        !material.approvals.some(
                          (item) => item.teacherName === me?.name,
                        ) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => approve(material)}
                          >
                            <CheckCircle2 className="mr-1 size-3.5" />
                            Approve
                          </Button>
                        )}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Report material"
                        onClick={() => report("material", material.id)}
                      >
                        <Flag className="size-4" />
                      </Button>
                      {(material.uploaderId === me?.id || access.isAdmin) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Delete material"
                          onClick={() => remove("material", material.id)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <Discussion
                      targetType="material"
                      targetId={material.id}
                      meId={me?.id}
                      isAdmin={access.isAdmin}
                      onReport={report}
                      onDelete={remove}
                      onChanged={loadMaterials}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>}

        <TabsContent value="posts" className="mt-5">
          <div className="mx-auto grid max-w-5xl items-start gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0 space-y-4">
              <Card className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {initials(me?.name || "You")}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setQuoteTarget(null);
                        setPostMode("post");
                        setPostDialog(true);
                      }}
                      className="min-h-10 flex-1 rounded-full border bg-muted/50 px-4 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
                    >
                      Share a question, idea, or update...
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 border-t pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="justify-center"
                      onClick={() => {
                        setQuoteTarget(null);
                        setPostMode("post");
                        setPostDialog(true);
                      }}
                    >
                      <MessageCircle className="mr-2 size-4" /> Post
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="justify-center"
                      onClick={() => {
                        setQuoteTarget(null);
                        setPostMode("survey");
                        setPostDialog(true);
                      }}
                    >
                      <BarChart3 className="mr-2 size-4" /> Survey
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Dialog open={postDialog} onOpenChange={(open) => {
                setPostDialog(open);
                if (!open) setQuoteTarget(null);
              }}>
                <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{quoteTarget ? "Quote this post" : "Create forum post"}</DialogTitle>
                    <DialogDescription>
                      {quoteTarget
                        ? "Add your perspective while keeping the original context."
                        : "Share a post or ask the community with a survey."}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={createPost} className="space-y-4">
                    {quoteTarget ? <QuotedPostPreview post={quoteTarget} /> : <Tabs
                      value={postMode}
                      onValueChange={(value) =>
                        setPostMode(value as "post" | "survey")
                      }
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="post">Post</TabsTrigger>
                        <TabsTrigger value="survey">Survey</TabsTrigger>
                      </TabsList>
                    </Tabs>}
                    <div className="space-y-1.5">
                      <Label>Title</Label>
                      <Input
                        name="title"
                        maxLength={180}
                        placeholder="Give people a reason to stop scrolling"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        {postMode === "survey"
                          ? "Question and context"
                          : "Post"}
                      </Label>
                      <Textarea
                        name="body"
                        rows={6}
                        maxLength={5000}
                        required
                        placeholder="What would you like to share? Markdown is supported."
                      />
                      <p className="text-xs text-muted-foreground">
                        Use **bold**, *italic*, lists, links, quotes, headings,
                        inline code, or fenced code blocks.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tags</Label>
                      <Input name="tags" placeholder={POST_TAGS.join(", ")} />
                    </div>
                    {postMode === "survey" && (
                      <div className="space-y-2">
                        <Label>Survey options</Label>
                        <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 p-3">
                          <div className="min-w-0">
                            <Label htmlFor="survey-multiple-votes">Allow multiple selections</Label>
                            <p className="text-xs text-muted-foreground">
                              Voters can choose one or more options.
                            </p>
                          </div>
                          <Switch
                            id="survey-multiple-votes"
                            checked={surveyAllowMultiple}
                            onCheckedChange={setSurveyAllowMultiple}
                          />
                        </div>
                        {surveyOptions.map((option, index) => (
                          <div key={index} className="flex gap-2">
                            <Input
                              value={option}
                              onChange={(event) =>
                                setSurveyOptions((items) =>
                                  items.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? event.target.value
                                      : item,
                                  ),
                                )
                              }
                              placeholder={"Option " + (index + 1)}
                              required={index < 2}
                            />
                            {surveyOptions.length > 2 && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() =>
                                  setSurveyOptions((items) =>
                                    items.filter(
                                      (_, itemIndex) => itemIndex !== index,
                                    ),
                                  )
                                }
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setSurveyOptions((items) =>
                              items.length < 8 ? [...items, ""] : items,
                            )
                          }
                        >
                          <Plus className="mr-1 size-3.5" />
                          Add option
                        </Button>
                      </div>
                    )}
                    {!quoteTarget && <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Attach a file</Label>
                        <Input
                          name="file"
                          type="file"
                          accept=".pdf,.docx,.jpg,.jpeg,.png,.mov,.mp4"
                        />
                        <p className="text-xs text-muted-foreground">
                          PDF, DOCX, image, or video up to 10 MB.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Or attach a library material</Label>
                        <Select name="attachmentMaterialId" defaultValue="none">
                          <SelectTrigger>
                            <SelectValue placeholder="No material" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No material</SelectItem>
                            {materials.map((material) => (
                              <SelectItem
                                key={material.id}
                                value={String(material.id)}
                              >
                                {material.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>}
                    <Button className="w-full" disabled={submitting}>
                      {submitting ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 size-4" />
                      )}
                      {quoteTarget ? "Publish quote" : "Publish"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <section className="flex flex-wrap gap-2 rounded-md border bg-background/70 p-3 shadow-sm">
                <div className="relative min-w-0 flex-1 basis-56">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={postQuery}
                    onChange={(event) => setPostQuery(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && loadPosts()}
                    placeholder="Search the feed..."
                    className="pl-9"
                  />
                </div>
                <Select value={postKind} onValueChange={setPostKind}>
                  <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everything</SelectItem>
                    <SelectItem value="post">Posts</SelectItem>
                    <SelectItem value="survey">Surveys</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={postTag} onValueChange={setPostTag}>
                  <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All topics</SelectItem>
                    {POST_TAGS.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  onClick={loadPosts}
                  disabled={loadingPosts}
                  aria-label="Search posts"
                  title="Search posts"
                >
                  {loadingPosts ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                </Button>
              </section>

              {loadingPosts && posts.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                  Loading posts...
                </div>
              ) : posts.length === 0 ? (
                <div className="border-y py-12 text-center text-muted-foreground">
                  No posts match these filters.
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border bg-background/85">
                  {posts.map((post) => {
                    const attached = post.attachmentMaterialId
                      ? materialById.get(post.attachmentMaterialId)
                      : null;
                    const totalVotes = post.votes.reduce(
                      (sum, item) => sum + item.count,
                      0,
                    );
                    return (
                      <Card
                        key={post.id}
                        className="rounded-none border-x-0 border-t-0 shadow-none last:border-b-0"
                        data-testid="forum-post"
                      >
                        <div className="grid grid-cols-[3.25rem_1fr]">
                        <aside className="flex flex-col items-center border-r bg-muted/45 py-3 text-xs font-bold">
                          <Button size="icon" variant="ghost" className="size-8" onClick={() => toggleLike("post", post.id)} title={post.likedByMe ? "Remove upvote" : "Upvote"}>
                            <ArrowBigUp className={"size-6 " + (post.likedByMe ? "fill-primary text-primary" : "")} />
                          </Button>
                          <span>{post.likeCount}</span>
                        </aside>
                        <div className="min-w-0">
                        <CardHeader className="p-3 pb-2">
                          <div className="flex items-start gap-3">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                              {initials(post.authorName)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-xs font-bold">{classId ? `c/class-${classId}` : "c/schoolar"}</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground">Posted by {profileHandle(post.authorName)}</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(post.createdAt).toLocaleString()}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="h-5 px-1.5 text-[10px]"
                                >
                                  {roleLabel(post.authorRole)}
                                </Badge>
                                {post.kind === "survey" && (
                                  <Badge className="h-5 px-1.5 text-[10px]">
                                    <BarChart3 className="mr-1 size-3" />
                                    Survey
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Report post"
                                aria-label="Report post"
                                onClick={() => report("post", post.id)}
                              >
                                <Flag className="size-4" />
                              </Button>
                              {(post.authorId === me?.id || access.isAdmin) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Delete post"
                                  aria-label="Delete post"
                                  onClick={() => remove("post", post.id)}
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 p-3 pt-0">
                          {post.title && (
                            <h2 className="text-base font-bold leading-snug">
                              {post.title}
                            </h2>
                          )}
                          <MarkdownText value={post.body} />
                          {post.quotedPostId && <QuotedPostPreview post={post.quotedPost} />}
                          {post.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {post.tags.map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => setPostTag(tag)}
                                  className="text-sm text-primary hover:underline"
                                >
                                  #{tag}
                                </button>
                              ))}
                            </div>
                          )}
                          {attached && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 rounded-md border bg-muted/40 p-3 text-left text-sm transition-colors hover:bg-muted"
                              onClick={() => downloadMaterial(attached)}
                            >
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background">
                                <Paperclip className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">
                                  {attached.title}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {attached.materialType} · Open material
                                </span>
                              </span>
                            </button>
                          )}
                          {post.attachmentFileName && (
                            <div className="space-y-2">
                              <PostMediaPreview post={post} />
                              <button
                              type="button"
                              className="flex w-full items-center gap-3 rounded-md border bg-muted/40 p-3 text-left text-sm transition-colors hover:bg-muted"
                              onClick={() => downloadPostFile(post)}
                              >
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background">
                                <Download className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">
                                  {post.attachmentFileName}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {post.attachmentMimeType || "File"} · Download
                                </span>
                              </span>
                              </button>
                            </div>
                          )}
                          {post.kind === "survey" && (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground">
                                {post.allowMultipleVotes
                                  ? "Choose one or more options."
                                  : "Choose one option."}
                              </p>
                              {post.surveyOptions.map((option) => {
                                const count =
                                  post.votes.find(
                                    (item) => item.optionId === option.id,
                                  )?.count ?? 0;
                                const percent = totalVotes
                                  ? Math.round((count / totalVotes) * 100)
                                  : 0;
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => vote(post, option.id)}
                                    className={
                                      "relative flex min-h-11 w-full overflow-hidden rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-primary " +
                                      ((post.myVotes ?? (post.myVote ? [post.myVote] : [])).includes(option.id)
                                        ? "border-primary"
                                        : "")
                                    }
                                  >
                                    <span
                                      className="absolute inset-y-0 left-0 bg-primary/10"
                                      style={{ width: percent + "%" }}
                                    />
                                    <span className="relative flex-1">
                                      {option.text}
                                    </span>
                                    <span className="relative text-xs text-muted-foreground">
                                      {count} · {percent}%
                                    </span>
                                  </button>
                                );
                              })}
                              <p className="text-xs text-muted-foreground">
                                {totalVotes} {post.allowMultipleVotes
                                  ? `selection${totalVotes === 1 ? "" : "s"}`
                                  : `vote${totalVotes === 1 ? "" : "s"}`}
                              </p>
                            </div>
                          )}
                          <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Eye className="size-3.5" />
                              {post.viewCount} views
                            </span>
                            <div className="flex items-center gap-3">
                              <span>{post.likeCount} likes</span>
                              <span>{post.repostCount} reposts</span>
                              <span>{post.commentCount} comments</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 border-y">
                            <Discussion
                              compact
                              count={post.commentCount}
                              targetType="post"
                              targetId={post.id}
                              meId={me?.id}
                              isAdmin={access.isAdmin}
                              onReport={report}
                              onDelete={remove}
                              onChanged={(delta) => setPosts((current) => current.map((item) => item.id === post.id ? {
                                ...item,
                                commentCount: Math.max(0, item.commentCount + delta),
                              } : item))}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className={"rounded-none transition-colors " + (post.repostedByMe
                                ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-400"
                                : "")}
                              disabled={repostingIds.includes(post.id)}
                              aria-pressed={post.repostedByMe}
                              onClick={() => toggleRepost(post)}
                            >
                              {repostingIds.includes(post.id)
                                ? <Loader2 className="mr-1.5 size-4 animate-spin" />
                                : <Repeat2 className="mr-1.5 size-4" />}
                              <span className="hidden sm:inline">Repost</span>
                              <span className="ml-1">{post.repostCount}</span>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="rounded-none transition-colors hover:bg-primary/10 hover:text-primary"
                              onClick={() => {
                                setQuoteTarget(post);
                                setPostMode("post");
                                setPostDialog(true);
                              }}
                            >
                              <Quote className="mr-1.5 size-4" />
                              <span className="hidden sm:inline">Quote</span>
                            </Button>
                          </div>
                        </CardContent>
                        </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            <aside className="hidden space-y-6 lg:sticky lg:top-16 lg:block">
              <section className="border-y py-4">
                <h2 className="text-sm font-bold">Popular topics</h2>
                <div className="mt-3 space-y-1">
                  {(popularTopics.length
                    ? popularTopics
                    : POST_TAGS.slice(0, 6).map(
                        (tag) => [tag, 0] as [string, number],
                      )
                  ).map(([tag, count]) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setPostTag(tag)}
                      className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="font-medium">#{tag}</span>
                      {count > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
              <section className="border-y py-4">
                <h2 className="text-sm font-bold">Community snapshot</h2>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Posts</dt>
                    <dd className="text-lg font-bold">{posts.length}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Discussions
                    </dt>
                    <dd className="text-lg font-bold">
                      {posts.reduce((sum, post) => sum + post.commentCount, 0)}
                    </dd>
                  </div>
                </dl>
              </section>
            </aside>
          </div>
        </TabsContent>

        {access.isAdmin && (
          <TabsContent value="moderation" className="space-y-3">
            {reports.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex gap-2">
                      <Badge
                        variant={item.aiFlagged ? "destructive" : "secondary"}
                      >
                        {item.aiFlagged ? "AI flagged" : "Needs review"}
                      </Badge>
                      <Badge variant="outline">
                        {item.targetType} #{item.targetId}
                      </Badge>
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-medium">
                      {item.reporterName}: {item.reason}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.aiAssessment || "No assessment"} ·{" "}
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {item.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => updateReport(item.id, "resolved")}
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateReport(item.id, "dismissed")}
                      >
                        Dismiss
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        title="Delete reported content"
                        onClick={() => remove(item.targetType, item.targetId)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {reports.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                No reported forum content.
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function validSource(value: string) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function QuotedPostPreview({ post }: { post: QuotedPost | ForumPost | null }) {
  if (!post) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
        Original post is unavailable.
      </div>
    );
  }
  return (
    <div className="rounded-md border-l-4 border-l-primary bg-muted/35 p-3 transition-colors hover:bg-muted/55">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Quote className="size-3.5 text-primary" />
        <span className="font-semibold text-foreground">{profileHandle(post.authorName)}</span>
        <span>{new Date(post.createdAt).toLocaleString()}</span>
      </div>
      {post.title && <p className="mt-1.5 line-clamp-1 text-sm font-semibold">{post.title}</p>}
      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{post.body}</p>
    </div>
  );
}

function PostMediaPreview({ post }: { post: ForumPost }) {
  const [source, setSource] = useState<string | null>(null);
  const mimeType = post.attachmentMimeType ?? "";
  const previewable = mimeType.startsWith("image/") || mimeType.startsWith("video/");

  useEffect(() => {
    if (!previewable) return;
    let active = true;
    let objectUrl: string | null = null;
    void fetch(apiUrl("/forum/posts/" + post.id + "/file"), {
      headers: { Authorization: "Bearer " + localStorage.getItem("schoolar_token") },
    }).then((response) => {
      if (!response.ok) throw new Error("Preview unavailable");
      return response.blob();
    }).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [post.id, previewable]);

  if (!previewable || !source) return null;
  if (mimeType.startsWith("video/")) {
    return <video src={source} controls preload="metadata" className="max-h-[32rem] w-full rounded-md bg-black object-contain" />;
  }
  return <img src={source} alt={post.attachmentFileName ?? "Post attachment"} className="max-h-[32rem] w-full rounded-md bg-muted object-contain" />;
}

function Discussion({
  targetType,
  targetId,
  meId,
  isAdmin,
  onReport,
  onDelete,
  onChanged,
  compact = false,
  count,
}: {
  targetType: "material" | "post";
  targetId: number;
  meId?: number;
  isAdmin: boolean;
  compact?: boolean;
  count?: number;
  onReport: (
    type: "material" | "post" | "comment",
    id: number,
  ) => Promise<void>;
  onDelete: (
    type: "material" | "post" | "comment",
    id: number,
  ) => Promise<void>;
  onChanged: (delta: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<ForumComment | null>(null);
  const [sending, setSending] = useState(false);

  async function load() {
    setComments(
      await forumRequest<ForumComment[]>(
        "/forum/" + targetType + "/" + targetId + "/comments",
      ),
    );
  }
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) await load();
  }
  async function submit() {
    if (!body.trim()) return;
    setSending(true);
    try {
      const created = await forumRequest<ForumComment>(
        "/forum/" + targetType + "/" + targetId + "/comments",
        {
          method: "POST",
          body: JSON.stringify({ body, parentId: replyTo?.id ?? null }),
        },
      );
      setBody("");
      setReplyTo(null);
      setComments((current) => [...current, created]);
      onChanged(1);
    } catch (error) {
      toast({
        title: "Could not publish comment",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  const roots = comments.filter((item) => !item.parentId);
  return (
    <div className={compact ? "contents" : undefined}>
      <Button
        className={compact ? "rounded-none" : "w-full justify-center"}
        size="sm"
        variant="ghost"
        onClick={toggle}
      >
        <MessageCircle className="mr-2 size-4" />
        {open ? "Hide" : compact ? (count ?? 0) : "View comments"}
      </Button>
      {open && (
        <div
          className={
            (compact ? "col-span-full px-3 pb-3 " : "") +
            "mt-3 space-y-3 border-t pt-3"
          }
        >
          {roots.map((comment) => (
            <div
              key={comment.id}
              className="space-y-2 rounded-md bg-muted/40 p-3"
            >
              <CommentRow
                comment={comment}
                meId={meId}
                isAdmin={isAdmin}
                onReply={setReplyTo}
                onReport={onReport}
                onDelete={async (type, id) => {
                  await onDelete(type, id);
                  await load();
                  onChanged(-1);
                }}
              />
              {comments
                .filter((item) => item.parentId === comment.id)
                .map((reply) => (
                  <div key={reply.id} className="ml-6 border-l pl-3">
                    <CommentRow
                      comment={reply}
                      meId={meId}
                      isAdmin={isAdmin}
                      onReply={setReplyTo}
                      onReport={onReport}
                      onDelete={async (type, id) => {
                        await onDelete(type, id);
                        await load();
                        onChanged(-1);
                      }}
                    />
                  </div>
                ))}
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          )}
          {replyTo && (
            <div className="flex items-center justify-between bg-muted px-3 py-2 text-xs">
              <span>Replying to {replyTo.authorName}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setReplyTo(null)}
              >
                Cancel
              </Button>
            </div>
          )}
          <div className="flex gap-2 border-t pt-3">
            <Input
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="Write a comment or reply..."
              maxLength={2000}
            />
            <Button
              size="icon"
              onClick={submit}
              disabled={sending || !body.trim()}
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  meId,
  isAdmin,
  onReply,
  onReport,
  onDelete,
}: {
  comment: ForumComment;
  meId?: number;
  isAdmin: boolean;
  onReply: (comment: ForumComment) => void;
  onReport: (type: "comment", id: number) => Promise<void>;
  onDelete: (type: "comment", id: number) => Promise<void>;
}) {
  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{comment.authorName}</span>
        <Badge variant="outline">{roleLabel(comment.authorRole)}</Badge>
        <span className="text-xs text-muted-foreground">
          {new Date(comment.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
      <div className="mt-1 flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => onReply(comment)}>
          Reply
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Report comment"
          onClick={() => onReport("comment", comment.id)}
        >
          <Flag className="size-3.5" />
        </Button>
        {(comment.authorId === meId || isAdmin) && (
          <Button
            size="icon"
            variant="ghost"
            title="Delete comment"
            onClick={() => onDelete("comment", comment.id)}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}
