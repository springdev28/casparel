import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch as useRouteSearch, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Plus,
  LogIn,
  Globe,
  ExternalLink,
  Loader2,
  BookOpen,
  Sparkles,
  X,
  Wand2,
  Trash2,
  GraduationCap,
  FileText,
  Video,
  FileType2,
  Headphones,
  MousePointerClick,
  ImageIcon,
  ShieldCheck,
  CircleHelp,
  Target,
  SlidersHorizontal,
  ShieldAlert,
  ShieldX,
  RotateCcw,
  Quote,
  Microscope,
} from "lucide-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@workspace/edu-ds/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/edu-ds/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/edu-ds/components/ui/select";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { Checkbox } from "@workspace/edu-ds/components/ui/checkbox";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListResources,
  useCreateResource,
  useDeleteResource,
  useGetMe,
  useDiscoverResources,
  useListLearningGoals,
  usePrefetchResourceMetadata,
  useListClasses,
  useAssignResourceToClass,
  getDiscoverResourcesQueryKey,
  getListResourcesQueryKey,
  getGetMeQueryKey,
  getGetMyUsageQueryKey,
  getGetResourceRecommendationsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetClassResourcesListQueryKey,
  getListClassesQueryKey,
  getListLearningGoalsQueryKey,
  ListResourcesFormat,
  ListResourcesSortBy,
  type ListResourcesDateAdded,
  type ListResourcesVerification,
  ResourceInputFormat,
  DiscoverResourcesLanguage,
  DiscoverResourcesResultType,
  UserRole,
  type DiscoverResourcesAccessType,
  type DiscoverResourcesContentLength,
  type DiscoverResourcesDifficulty,
  type DiscoverResourcesFreshness,
  type DiscoverResourcesLicense,
  type DiscoverResourcesSourceQuality,
  type DiscoveredResource,
  type SourceReview,
} from "@workspace/api-client-react";
import { VerificationBadge } from "../components/VerificationBadge";
import { StarRating } from "../components/StarRating";
import { metaLine } from "../lib/format-meta";
import { describeApiError } from "../lib/api-error";
import { AUTH_LANGUAGES, useAuthLanguage } from "../lib/auth-locale";
import {
  CitationDialog,
  type CitationResource,
} from "../components/CitationDialog";
import {
  addSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
  type SearchHistoryFilters,
  type SearchHistoryItem,
} from "../lib/searchHistory";
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from "../lib/user-preferences";
// One definition of "the same work", shared with the API. Keeping a copy here
// is what let the two drift: a fix to the API's similarity left this side still
// scoring a contained title as a perfect match, and a page of sixteen results
// rendered three cards.
import {
  canonicalResourceUrl,
  dedupeByWork,
  isSameWork,
} from "@workspace/resource-identity";
import { counted } from "@/lib/counted";
import { useIsMobile } from "@/hooks/use-mobile";

const FORMAT_OPTIONS = Object.values(ListResourcesFormat);
const GRADE_LEVEL_OPTIONS = [
  "K–5",
  "6–8",
  "9–12",
  "College",
  "Adult",
  "All Ages",
];
const RESOURCE_SEARCH_STATE_KEY = "schoolar_resource_search_state";
function dedupeDiscoveredResources(items: DiscoveredResource[]) {
  return dedupeByWork(items);
}

function storedResourceSearch() {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(RESOURCE_SEARCH_STATE_KEY) ?? "{}",
    ) as { inputValue?: unknown; activeQuery?: unknown; results?: unknown };
    return {
      inputValue: typeof value.inputValue === "string" ? value.inputValue : "",
      activeQuery:
        typeof value.activeQuery === "string" ? value.activeQuery : "",
      results: Array.isArray(value.results)
        ? (value.results as DiscoveredResource[])
        : [],
    };
  } catch {
    return {
      inputValue: "",
      activeQuery: "",
      results: [] as DiscoveredResource[],
    };
  }
}

/**
 * The filter half of a search, separate from the words so a recent search can
 * be replayed exactly. A chip that restores only the text silently runs a
 * different search from the one it is showing.
 */
type SubmittedResourceFilters = {
  format: string;
  subject: string;
  gradeLevel: string;
  language: SearchLanguage;
  resultType: DiscoverResourcesResultType;
  sortBy: ListResourcesSortBy | "";
  minRating: number | "";
  exactPhrase: string;
  excludedWords: string;
  sourceDomain: string;
  excludeSource: string;
  dateAdded: string;
  minReviews: string;
  thumbnail: string;
  librarySort: string;
  freshness: string;
  difficulty: string;
  access: string;
  license: string;
  contentLength: string;
  sourceQuality: string;
  material: string;
  excludeSubjects: string;
  author: string;
  titleOnly: boolean;
  publishedFrom: string;
  publishedTo: string;
  captions: boolean;
  transcript: boolean;
};

type SubmittedResourceSearch = SubmittedResourceFilters & { query: string };

function continueStudyingStorageKey(userId: number, goalId: number) {
  return `schoolar_continue_studying:${userId}:${goalId}`;
}

function getContinueStudyingResourceIds(userId: number, goalId: number) {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(continueStudyingStorageKey(userId, goalId)) ?? "[]",
    ) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .filter((id): id is number => Number.isInteger(id) && id > 0)
          .slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

function getResourceEvidenceScore(avgRating: number, reviewCount: number) {
  // Not just "no reviews yet": a rating that is missing or not a number makes
  // the arithmetic below NaN, and the card renders "NaN% evidence score" at a
  // reader. No score is a state this already handles; a broken one is not.
  if (reviewCount <= 0 || !Number.isFinite(avgRating)) return null;
  const ratingSignal = Math.max(0, Math.min(1, avgRating / 5));
  const confidenceSignal = Math.min(reviewCount, 10) / 10;
  return Math.round((ratingSignal * 0.7 + confidenceSignal * 0.3) * 100);
}

const SEARCH_LANGUAGE_OPTIONS = [
  { code: DiscoverResourcesLanguage.any, label: "Any language" },
  ...AUTH_LANGUAGES,
];
type SearchLanguage = (typeof SEARCH_LANGUAGE_OPTIONS)[number]["code"];

const FORMAT_COLORS: Record<string, string> = {
  article: "bg-blue-100 text-blue-700",
  video: "bg-red-100 text-red-700",
  pdf: "bg-orange-100 text-orange-700",

  podcast: "bg-purple-100 text-purple-700",
  interactive: "bg-emerald-100 text-emerald-700",
  other: "bg-gray-100 text-gray-700",
};
function ProvenanceBadge({ resource }: { resource: DiscoveredResource }) {
  if (!resource.provenanceLevel) return null;
  const isAcademic = resource.provenanceSignals?.some((signal) =>
    signal.startsWith("Academic, scholarly"),
  );
  const labels = {
    institutional: isAcademic ? "Academic source" : "Institutional source",
    established: "Established platform",
    independent: "Independent source",
    unknown: "Unknown source",
  } as const;
  const colors = {
    institutional: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
    established: "border-blue-500/30 bg-blue-500/10 text-blue-700",
    independent: "border-amber-500/30 bg-amber-500/10 text-amber-700",
    unknown: "border-muted bg-muted text-muted-foreground",
  } as const;
  const level = resource.provenanceLevel;
  return (
    <details className="group mt-2 text-xs">
      <summary
        className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border px-2 py-1 font-medium ${colors[level]}`}
      >
        <ShieldCheck className="size-3.5" />
        {labels[level]}
        {resource.linkChecked && (
          <span aria-label="Link checked">· link checked</span>
        )}
        <CircleHelp className="size-3 opacity-60" />
      </summary>
      <div className="mt-2 rounded-lg border bg-muted/40 p-2.5 text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">Why this label?</p>
        <ul className="space-y-1">
          {resource.provenanceSignals?.map((signal) => (
            <li key={signal}>• {signal}</li>
          ))}
        </ul>
        <p className="mt-2 text-[11px]">
          Publisher provenance and link availability do not verify every claim
          in the content.
        </p>
      </div>
    </details>
  );
}

function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

function isVimeoUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes("vimeo.com");
  } catch {
    return false;
  }
}

function isLoomUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes("loom.com");
  } catch {
    return false;
  }
}

/** Server-side OEmbed proxy, avoids CORS and third-party rate-limit failures. */
function useOembedThumbnail(url: string, enabled: boolean) {
  return useQuery<string | null>({
    queryKey: ["oembed-thumbnail", url],
    queryFn: async () => {
      const res = await fetch(
        `/api/resources/oembed?url=${encodeURIComponent(url)}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { thumbnailUrl: string | null };
      return data.thumbnailUrl ?? null;
    },
    enabled,
    staleTime: 1000 * 60 * 60, // 1 hour, thumbnail URLs don't change
    retry: false,
  });
}

function FormatBadge({ format }: { format: string }) {
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${FORMAT_COLORS[format] ?? FORMAT_COLORS.other}`}
    >
      {format}
    </span>
  );
}

const FORMAT_PREVIEW_STYLES: Record<string, string> = {
  article: "from-blue-100 via-sky-50 to-white text-blue-700",
  video: "from-red-100 via-rose-50 to-white text-red-700",
  pdf: "from-orange-100 via-amber-50 to-white text-orange-700",
  podcast: "from-purple-100 via-violet-50 to-white text-purple-700",
  interactive: "from-emerald-100 via-teal-50 to-white text-emerald-700",
  other: "from-slate-100 via-gray-50 to-white text-slate-700",
};

function FormatPreview({
  url,
  format,
  title,
}: {
  url: string;
  format: string;
  title: string;
}) {
  let hostname = "Learning resource";
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep fallback */
  }

  const iconClass = "size-9";
  const icon =
    format === "article" ? (
      <FileText className={iconClass} />
    ) : format === "video" ? (
      <Video className={iconClass} />
    ) : format === "pdf" ? (
      <FileType2 className={iconClass} />
    ) : format === "podcast" ? (
      <Headphones className={iconClass} />
    ) : format === "interactive" ? (
      <MousePointerClick className={iconClass} />
    ) : (
      <ImageIcon className={iconClass} />
    );

  return (
    <div
      className={`w-full h-36 bg-gradient-to-br ${FORMAT_PREVIEW_STYLES[format] ?? FORMAT_PREVIEW_STYLES.other} flex flex-col items-center justify-center gap-2 px-5 text-center`}
      role="img"
      aria-label={`${format} preview for ${title}`}
      // Carries the resource's own title, which is not this app's wording.
      translate="no"
    >
      {icon}
      <span className="max-w-full truncate text-xs font-semibold">
        {hostname}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-widest opacity-70">
        {format}
      </span>
    </div>
  );
}

// ── Shared resource card (library) ────────────────────────────────────────────
function LibraryCard({
  resource,
  onClick,
  onRemove,
  onAssign,
  onCitation,
}: {
  resource: {
    id: number;
    title: string;
    url: string;
    format: string;
    subject: string;
    gradeLevel: string;
    description?: string | null;
    avgRating: number;
    reviewCount: number;
    thumbnailUrl?: string | null;
    verificationStatus?: "unverified" | "verified" | "rejected";
    verificationNote?: string | null;
  };
  onClick: () => void;
  onRemove?: () => void;
  onAssign?: () => void;
  onCitation: () => void;
}) {
  const [failedThumb, setFailedThumb] = useState<string | null>(null);
  const evidenceScore = getResourceEvidenceScore(
    resource.avgRating,
    resource.reviewCount,
  );
  const ytId = getYouTubeId(resource.url);
  const needsOembed =
    !ytId && (isVimeoUrl(resource.url) || isLoomUrl(resource.url));
  const { data: oembedThumb } = useOembedThumbnail(resource.url, needsOembed);
  const thumb = ytId
    ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
    : (oembedThumb ?? resource.thumbnailUrl ?? null);
  const showImg = !!thumb && thumb !== failedThumb;
  return (
    <Card
      className="render-later cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
      onClick={onClick}
      data-testid="resource-card"
    >
      {showImg && (
        <div className="w-full h-36 overflow-hidden bg-black">
          <img
            src={thumb}
            alt={resource.title}
            translate="no"
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setFailedThumb(thumb)}
          />
        </div>
      )}
      {!showImg && (
        <FormatPreview
          url={resource.url}
          format={resource.format}
          title={resource.title}
        />
      )}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle translate="no" className="text-base line-clamp-2">
            {resource.title}
          </CardTitle>
          <FormatBadge format={resource.format} />
          <VerificationBadge
            status={resource.verificationStatus}
            note={resource.verificationNote}
          />
        </div>
        <CardDescription className="text-xs">
          {/* The resource's own subject and level, as its catalogue records
              them -- not this app's wording. */}
          <span translate="no">
            {metaLine(resource.subject, resource.gradeLevel)}
          </span>
        </CardDescription>
      </CardHeader>
      {resource.verificationStatus === "rejected" &&
      resource.verificationNote ? (
        <CardContent className="pb-2">
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive-text">
            <span className="font-semibold">Reviewer:</span>{" "}
            <span translate="no">{resource.verificationNote}</span>
          </p>
        </CardContent>
      ) : null}
      {resource.description && (
        <CardContent className="pb-2">
          <p translate="no" className="text-sm text-muted-foreground line-clamp-2">
            {resource.description}
          </p>
        </CardContent>
      )}
      <CardFooter className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2">
        {/*
          basis-40, and the row wraps.

          Its sibling holds buttons and is shrink-0, so every pixel the row was
          short came out of here: on a 313px card in Turkish this column ended
          up fifteen pixels wide, which is not a clipped line so much as a
          crushed one. flex-wrap alone did nothing, because `flex-1` is a basis
          of zero and a zero-width item never pushes anything onto a second
          line. The basis is what makes it ask for room, and the wrap is what
          gives it room to ask for. Widening instead would only move the
          squeeze to the buttons, and the next longer translation would put it
          straight back.
        */}
        <div className="min-w-0 flex-1 basis-40">
          <StarRating value={resource.avgRating} size="sm" />
          <p
            className="mt-1 text-xs font-medium text-primary-text text-balance leading-tight"
            title="Evidence score: 70% average rating and 30% review confidence"
          >
            {evidenceScore === null
              ? "New resource · gathering evidence"
              : `${evidenceScore}% evidence score`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {counted(resource.reviewCount, "review", "reviews")}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              onCitation();
            }}
            title="Get citation"
            className="h-8 px-2"
          >
            <Quote size={13} className="mr-1" /> Cite
          </Button>
          {onAssign && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAssign();
              }}
              className="text-muted-foreground hover:text-primary-text transition-colors"
              title="Assign to class"
            >
              <GraduationCap size={13} />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="text-muted-foreground hover:text-destructive-text transition-colors"
              title="Remove from library"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

type UnsavedResearch = SourceReview & {
  resourceProfile?: {
    author?: string | null;
    uploadTime?: string | null;
    lastEdited?: string | null;
    subject?: string | null;
    gradeLevel?: string | null;
    format?: string | null;
    language?: string | null;
    difficulty?: string | null;
    accessType?: string | null;
    license?: string | null;
    duration?: string | null;
    audience?: string | null;
  };
};

function UnsavedSourceResearchDialog({
  resource,
  open,
  onOpenChange,
  isLoggedIn,
  onRequireLogin,
}: {
  resource: DiscoveredResource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoggedIn: boolean;
  onRequireLogin: () => void;
}) {
  const [mode, setMode] = useState<"quick" | "deep" | null>(null);
  const [data, setData] = useState<UnsavedResearch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMode(null);
    setData(null);
    setError("");
  }, [resource?.url, open]);

  async function research(nextMode: "quick" | "deep") {
    if (!resource) return;
    if (nextMode === "deep" && !isLoggedIn) {
      onRequireLogin();
      return;
    }
    setMode(nextMode);
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        mode: nextMode,
        title: resource.title,
        url: resource.url,
        subject: resource.subject ?? "",
        gradeLevel: resource.gradeLevel ?? "",
        format: resource.format,
      });
      const response = await fetch(`/api/source-review?${params}`, {
        headers:
          nextMode === "deep"
            ? {
                Authorization: `Bearer ${localStorage.getItem("schoolar_token")}`,
              }
            : undefined,
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as UnsavedResearch & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Research failed");
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Research failed");
    } finally {
      setLoading(false);
    }
  }

  const profile = data?.resourceProfile;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Microscope size={18} /> Research this source
          </DialogTitle>
          <DialogDescription>
            {resource?.title}. Researching does not save it to your library.
          </DialogDescription>
        </DialogHeader>
        {!mode && (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void research("quick")}
              className="border p-4 text-left transition-colors hover:border-primary"
            >
              <p className="font-semibold">Quick research</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A concise check using stored metadata and Casparel's source
                registry. No AI credits.
              </p>
            </button>
            <button
              type="button"
              onClick={() => void research("deep")}
              className="border p-4 text-left transition-colors hover:border-primary"
            >
              <p className="font-semibold">Deep research</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Broader evidence across reputation, discussion, quality,
                currency, and limitations. Uses your plan's allowance.
              </p>
            </button>
          </div>
        )}
        {loading && (
          <div className="py-14 text-center text-muted-foreground">
            <Loader2 className="mx-auto mb-3 size-6 animate-spin" />
            {mode === "deep"
              ? "Researching the live source…"
              : "Checking stored source metadata…"}
          </div>
        )}
        {error && (
          <div className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive-text">
            {error}
            <Button
              variant="outline"
              size="sm"
              className="mt-3 block"
              onClick={() => setMode(null)}
            >
              Choose another mode
            </Button>
          </div>
        )}
        {data && !loading && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>
                {data.mode === "deep" ? "Deep research" : "Quick research"}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {data.trustLevel} trust
              </Badge>
              <span className="font-semibold">{data.sourceName}</span>
            </div>
            {profile && (
              <dl className="grid gap-3 border-y py-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Author", profile.author],
                  ["Uploaded", profile.uploadTime],
                  ["Last edited", profile.lastEdited],
                  ["Subject", profile.subject],
                  ["Grade", profile.gradeLevel],
                  ["Format", profile.format],
                  ["Difficulty", profile.difficulty],
                  ["Access", profile.accessType],
                  ["License", profile.license],
                  ["Duration", profile.duration],
                  ["Language", profile.language],
                  ["Audience", profile.audience],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11px] font-medium uppercase text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-1 text-sm">{value || "Not available"}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div>
              <h3 className="mb-1 text-sm font-semibold">Assessment</h3>
              <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
                {data.summary}
              </p>
            </div>
            {data.trustReason && (
              <p className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">
                {data.trustReason}
              </p>
            )}
            {data.mode === "deep" &&
              [
                ["Reputation and independence", data.reputationAnalysis],
                ["Audience sentiment", data.audienceSentiment],
                ["Educational quality", data.contentQuality],
                ["Currency", data.currencyAssessment],
              ].map(([title, body]) =>
                body ? (
                  <section key={title} className="border p-4">
                    <h3 className="mb-2 font-semibold">{title}</h3>
                    <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
                      {body}
                    </p>
                  </section>
                ) : null,
              )}
            {data.strengths?.length || data.concerns?.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <section className="border p-4">
                  <h3 className="mb-2 font-semibold">Strengths</h3>
                  <ul className="space-y-1 text-sm">
                    {data.strengths?.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </section>
                <section className="border p-4">
                  <h3 className="mb-2 font-semibold">Concerns</h3>
                  <ul className="space-y-1 text-sm">
                    {data.concerns?.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </section>
              </div>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMode(null);
                setData(null);
              }}
            >
              Switch mode
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Web result card ───────────────────────────────────────────────────────────
function WebCard({
  resource,
  onAdd,
  adding,
  onCitation,
  onResearch,
}: {
  resource: DiscoveredResource;
  onAdd: (r: DiscoveredResource) => void;
  adding: boolean;
  onCitation: () => void;
  onResearch: () => void;
}) {
  const [failedThumb, setFailedThumb] = useState<string | null>(null);
  const ytId = getYouTubeId(resource.url);
  const needsOembed =
    !ytId && (isVimeoUrl(resource.url) || isLoomUrl(resource.url));
  const { data: oembedThumb } = useOembedThumbnail(resource.url, needsOembed);
  const thumb = ytId
    ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
    : (oembedThumb ?? resource.thumbnailUrl ?? null);
  const showImg = !!thumb && thumb !== failedThumb;
  return (
    <Card
      className="render-later flex flex-col overflow-hidden"
      data-testid="web-result-card"
    >
      {showImg && (
        <div className="w-full h-36 overflow-hidden bg-black shrink-0">
          <img
            src={thumb}
            alt={resource.title}
            translate="no"
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setFailedThumb(thumb)}
          />
        </div>
      )}
      {!showImg && (
        <FormatPreview
          url={resource.url}
          format={resource.format}
          title={resource.title}
        />
      )}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base line-clamp-2 leading-snug">
            {resource.title}
          </CardTitle>
          <FormatBadge format={resource.format} />
        </div>
        <CardDescription className="text-xs">
          {/* Publisher, subject and level as the resource records them: a
              catalogue entry's own metadata, not this app's wording. */}
          <span translate="no">
            {resource.source}
            {resource.subject ? ` · ${resource.subject}` : ""}
            {resource.gradeLevel ? ` · ${resource.gradeLevel}` : ""}
          </span>
          <ProvenanceBadge resource={resource} />
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-2 flex-1">
        <p className="text-sm text-muted-foreground line-clamp-3">
          {resource.description}
        </p>
      </CardContent>
      <CardFooter className="gap-2 pt-2 flex-wrap">
        <Button size="sm" variant="outline" asChild className="flex-1">
          <a href={resource.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={12} className="mr-1.5" /> Open
          </a>
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled={adding}
          onClick={() => onAdd(resource)}
        >
          {adding ? (
            <>
              <Loader2 size={12} className="mr-1.5 animate-spin" /> Adding…
            </>
          ) : (
            <>
              <Plus size={12} className="mr-1.5" /> Save
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCitation}
          title="Get citation"
        >
          <Quote size={12} className="mr-1.5" /> Cite
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onResearch}
          title="Research without saving"
        >
          <Microscope size={12} className="mr-1.5" /> Research
        </Button>
      </CardFooter>
    </Card>
  );
}

function SourceCard({
  resource,
  onSave,
  saving,
  onResearch,
}: {
  resource: DiscoveredResource;
  onSave: (resource: DiscoveredResource) => void;
  saving: boolean;
  onResearch: () => void;
}) {
  let hostname = resource.source;
  try {
    hostname = new URL(resource.url).hostname.replace(/^www\./, "");
  } catch {
    /* keep source */
  }
  const isChannel = /youtube\.com|vimeo\.com|podcasts?\.|tiktok\.com/i.test(
    resource.url,
  );
  return (
    <Card className="render-later flex h-full flex-col border-primary/15 bg-gradient-to-br from-card to-primary/5">
      <CardHeader className="pb-3">
        <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary-text">
          {isChannel ? <Video size={22} /> : <Globe size={22} />}
        </div>
        <CardTitle className="text-lg leading-snug">{resource.title}</CardTitle>
        <CardDescription className="truncate">{hostname}</CardDescription>
        <ProvenanceBadge resource={resource} />
      </CardHeader>
      <CardContent className="flex-1">
        <p className="line-clamp-3 text-sm text-muted-foreground">
          {resource.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary-text">
            {isChannel ? "Channel" : "Website"}
          </span>
          {resource.subject && (
            <span className="rounded-full bg-muted px-2 py-1 text-xs">
              {resource.subject}
            </span>
          )}
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button asChild variant="outline" className="flex-1">
          <a href={resource.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} className="mr-2" /> Visit{" "}
            {isChannel ? "channel" : "website"}
          </a>
        </Button>
        <Button
          className="flex-1"
          disabled={saving}
          onClick={() => onSave(resource)}
          data-testid="save-recommended-source"
        >
          {saving ? (
            <Loader2 size={14} className="mr-2 animate-spin" />
          ) : (
            <Plus size={14} className="mr-2" />
          )}
          {saving ? "Saving…" : "Save source"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onResearch}
          title="Research without saving"
        >
          <Microscope size={15} />
        </Button>
      </CardFooter>
    </Card>
  );
}

// ── Skeleton grid ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function CardSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} data-testid="card-skeleton">
          <CardHeader>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-14 w-full" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-4 w-24" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ResourcesPage() {
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  const { language: interfaceLanguage } = useAuthLanguage();
  const routeSearch = useRouteSearch();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: accountPreferences } = useUserPreferences(
    Boolean(localStorage.getItem("schoolar_token")),
  );
  const updateAccountPreferences = useUpdateUserPreferences();

  const initialSearch = useRef(storedResourceSearch()).current;
  const initialResourceView = useRef<"search" | "library">(
    new URLSearchParams(routeSearch).get("view") === "library"
      ? "library"
      : "search",
  ).current;
  const [resourceView, setResourceView] = useState<"search" | "library">(
    initialResourceView,
  );
  const [inputValue, setInputValue] = useState(initialSearch.inputValue);
  const [activeQuery, setActiveQuery] = useState(initialSearch.activeQuery);
  const [formatFilter, setFormatFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [gradeLevelFilter, setGradeLevelFilter] = useState("");
  const [searchLanguage, setSearchLanguage] =
    useState<SearchLanguage>(interfaceLanguage);
  const [resultTypeFilter, setResultTypeFilter] =
    useState<DiscoverResourcesResultType>(DiscoverResourcesResultType.content);
  const [sortByFilter, setSortByFilter] = useState<ListResourcesSortBy | "">(
    "",
  );
  const [minRatingFilter, setMinRatingFilter] = useState<number | "">("");
  const [libraryLimit, setLibraryLimit] = useState(12);
  const [webPage, setWebPage] = useState(1);
  const [allWebResults, setAllWebResults] = useState<DiscoveredResource[]>(
    initialSearch.results,
  );
  // Mirrors allWebResults so a finished page can be compared with what was
  // already on screen without waiting for the state update. A page that adds
  // nothing new is the end of the catalog, and the UI has to say so rather
  // than leaving a button that visibly does nothing.
  const accumulatedWebResultsRef = useRef<DiscoveredResource[]>(
    initialSearch.results,
  );
  const mergedWebResponseRef = useRef<DiscoveredResource[] | null>(null);
  const [webExhausted, setWebExhausted] = useState(false);
  /**
   * How far these results have read into the open catalog: the furthest point in
   * the ranking, and the newest stored work.
   *
   * Set when the reader asks for more, never while a response is being folded
   * in: it is part of the request, so changing it re-runs the request, and a
   * cursor that moved on its own would refetch the page currently on screen and
   * then replace the results with whatever came back.
   */
  const [webCursor, setWebCursor] = useState<{ after: string; sinceId: number }>(
    { after: "", sinceId: 0 },
  );

  /**
   * How far a set of results reaches.
   *
   * The largest of each, not the last: the server spreads sources across the
   * page and the page then dedupes and hides results, so the item at the end of
   * the list is neither the furthest into the ranking nor the most recently
   * stored. Cursors are built to sort as text for exactly this reason.
   */
  function readTo(results: DiscoveredResource[]) {
    return results.reduce(
      (furthest, result) => ({
        after:
          result.cursor && result.cursor > furthest.after
            ? result.cursor
            : furthest.after,
        sinceId: Math.max(furthest.sinceId, result.catalogId ?? 0),
      }),
      { after: "", sinceId: 0 },
    );
  }

  function replaceWebResults(next: DiscoveredResource[]) {
    accumulatedWebResultsRef.current = next;
    setAllWebResults(next);
  }

  /**
   * Put paging back to the start of a fresh search.
   *
   * Every caller has to clear all of this together. Resetting the results but
   * not the exhausted flag is what leaves "Search more resources" replaced by
   * "that is everything" on a search that has not run yet — including a
   * re-search of the same words with different filters, which does not change
   * activeQuery and so misses the reset effect below.
   */
  function resetWebSearch() {
    setWebPage(1);
    setWebCursor({ after: "", sinceId: 0 });
    replaceWebResults([]);
    mergedWebResponseRef.current = null;
    setWebExhausted(false);
    setHiddenSourceUrls([]);
  }

  /**
   * Ask for the next page, telling the server where this one got to.
   *
   * Both parts move together. The page number chooses which window of each open
   * provider is read; the cursor is where the stored catalog resumes, and it has
   * to be taken from the results now on screen rather than recomputed later.
   */
  function loadMoreWebResults() {
    setWebCursor(readTo(accumulatedWebResultsRef.current));
    setWebPage((page) => page + 1);
  }
  const [hiddenSourceUrls, setHiddenSourceUrls] = useState<string[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [continueGoalId, setContinueGoalId] = useState("");
  const [continueResourceIds, setContinueResourceIds] = useState<number[]>([]);
  const [chooseContinueResourcesOpen, setChooseContinueResourcesOpen] =
    useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [exactPhraseFilter, setExactPhraseFilter] = useState("");
  const [excludedWordsFilter, setExcludedWordsFilter] = useState("");
  const [sourceDomainFilter, setSourceDomainFilter] = useState("");
  const [excludeSourceFilter, setExcludeSourceFilter] = useState("");
  const [dateAddedFilter, setDateAddedFilter] = useState("");
  const [minReviewsFilter, setMinReviewsFilter] = useState("");
  const [thumbnailFilter, setThumbnailFilter] = useState("");
  const [librarySortFilter, setLibrarySortFilter] = useState("");
  // Lets an author find their own submissions that are waiting on review or
  // were rejected, those are filtered out of everyone else's listings, so
  // without this they are easy to lose track of.
  const [verificationFilter, setVerificationFilter] = useState<
    "" | "pending" | "rejected"
  >("");
  const [freshnessFilter, setFreshnessFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [accessFilter, setAccessFilter] = useState("");
  const [licenseFilter, setLicenseFilter] = useState("");
  const [contentLengthFilter, setContentLengthFilter] = useState("");
  const [sourceQualityFilter, setSourceQualityFilter] = useState("");
  /**
   * What kind of thing the reader wants back.
   *
   * The catalog holds encyclopedia articles, textbooks, courses, primary texts
   * and peer-reviewed papers now. Those answer different questions, and without
   * this a revision search and a dissertation search get the same page.
   */
  const [materialFilter, setMaterialFilter] = useState("");
  const [excludeSubjectsFilter, setExcludeSubjectsFilter] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  /** Require the topic to be what a work is about, not something it mentions. */
  const [titleOnlyFilter, setTitleOnlyFilter] = useState(false);
  const [publishedFromFilter, setPublishedFromFilter] = useState("");
  const [publishedToFilter, setPublishedToFilter] = useState("");
  const [captionsRequired, setCaptionsRequired] = useState(false);
  const [transcriptRequired, setTranscriptRequired] = useState(false);
  const [submittedSearch, setSubmittedSearch] =
    useState<SubmittedResourceSearch | null>(null);
  const [citationResource, setCitationResource] =
    useState<CitationResource | null>(null);
  const [citationOpen, setCitationOpen] = useState(false);
  const [researchResource, setResearchResource] =
    useState<DiscoveredResource | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);
  const previousActiveQueryRef = useRef(activeQuery);
  const hydratedAccountSearchRef = useRef(false);

  function openCitation(resource?: CitationResource) {
    setCitationResource(resource ?? null);
    setCitationOpen(true);
  }

  function openResearch(resource: DiscoveredResource) {
    setResearchResource(resource);
    setResearchOpen(true);
  }

  /**
   * What was last written to the account, so the same thing is not written
   * twice. Also stops the hydration echo: restoring a saved search sets the
   * state that this effect watches, which would otherwise save it straight
   * back.
   */
  const savedSearchStateRef = useRef<string | null>(null);

  useEffect(() => {
    const state = {
      inputValue,
      activeQuery,
      results: allWebResults.slice(0, 60),
    };
    sessionStorage.setItem(RESOURCE_SEARCH_STATE_KEY, JSON.stringify(state));
    if (!accountPreferences) return;

    /**
     * Only write when there is something to write.
     *
     * This used to fire on every visit, so opening the library -- reading,
     * not searching -- sent a PATCH that stored an empty search over an
     * empty search. A page view is not an edit: it cost a database write per
     * visit and spent the account's write allowance on browsing.
     *
     * An empty search is still saved when something was stored before, since
     * that is how clearing a search is remembered.
     */
    const nothingToRemember =
      !inputValue && !activeQuery && allWebResults.length === 0;
    if (nothingToRemember && !accountPreferences.resourceSearchState) return;

    const next = JSON.stringify(state);
    const alreadyStored = JSON.stringify(
      accountPreferences.resourceSearchState ?? null,
    );
    if (next === alreadyStored || next === savedSearchStateRef.current) return;

    const timer = window.setTimeout(() => {
      savedSearchStateRef.current = next;
      updateAccountPreferences.mutate({ resourceSearchState: state });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [accountPreferences?.userId, inputValue, activeQuery, allWebResults]);

  useEffect(() => {
    if (!accountPreferences || hydratedAccountSearchRef.current) return;
    hydratedAccountSearchRef.current = true;
    if (
      initialSearch.inputValue ||
      initialSearch.activeQuery ||
      initialSearch.results.length
    )
      return;
    const saved = accountPreferences.resourceSearchState;
    if (!saved) return;
    if (typeof saved.inputValue === "string") setInputValue(saved.inputValue);
    if (typeof saved.activeQuery === "string")
      setActiveQuery(saved.activeQuery);
    if (Array.isArray(saved.results))
      replaceWebResults(saved.results as DiscoveredResource[]);
  }, [accountPreferences]);

  useEffect(() => {
    const params = new URLSearchParams(routeSearch);
    const goal = params.get("goal");
    const subject = params.get("subject");
    const mode = params.get("mode");
    const view = params.get("view");
    if (goal) {
      setInputValue(goal);
      setLibraryLimit(12);
    }
    if (subject) setSubjectFilter(subject);
    if (mode === "source")
      setResultTypeFilter(DiscoverResourcesResultType.source);
    if (view === "library") setResourceView("library");
  }, [routeSearch]);

  const isSearching = activeQuery.trim().length > 0;
  const isSourceMode = resultTypeFilter === DiscoverResourcesResultType.source;
  const isSubmittedSourceMode =
    submittedSearch?.resultType === DiscoverResourcesResultType.source;

  // Auth
  const { data: me, isLoading: meLoading } = useGetMe({
    query: { retry: false, queryKey: getGetMeQueryKey() },
  });
  const isLoggedIn = !!me;
  const isAdmin = me?.role === "admin";

  useEffect(() => {
    if (!me?.id) {
      setSearchHistory([]);
      return;
    }
    const localHistory = getSearchHistory(me.id);
    const savedHistory = accountPreferences?.searchHistory ?? [];
    const next = savedHistory.length ? savedHistory : localHistory;
    setSearchHistory(next);
    if (accountPreferences && !savedHistory.length && localHistory.length)
      updateAccountPreferences.mutate({ searchHistory: localHistory });
  }, [accountPreferences, me?.id]);

  const { data: learningGoals } = useListLearningGoals({
    query: { enabled: isLoggedIn, queryKey: getListLearningGoalsQueryKey() },
  });
  // Library search results (shown when searching)
  const libraryParams = {
    ...(submittedSearch?.query ? { q: submittedSearch.query } : {}),
    ...(submittedSearch?.format && submittedSearch.format !== "all"
      ? { format: submittedSearch.format as ListResourcesFormat }
      : {}),
    ...(submittedSearch?.subject ? { subject: submittedSearch.subject } : {}),
    ...(submittedSearch?.gradeLevel
      ? { gradeLevel: submittedSearch.gradeLevel }
      : {}),
    ...(submittedSearch?.sortBy ? { sortBy: submittedSearch.sortBy } : {}),
    ...(submittedSearch?.minRating
      ? { minRating: submittedSearch.minRating as number }
      : {}),
    ...(submittedSearch?.exactPhrase
      ? { exactPhrase: submittedSearch.exactPhrase }
      : {}),
    ...(submittedSearch?.excludedWords
      ? { exclude: submittedSearch.excludedWords }
      : {}),
    ...(submittedSearch?.sourceDomain
      ? { source: submittedSearch.sourceDomain }
      : {}),
    ...(submittedSearch?.excludeSource
      ? { excludeSource: submittedSearch.excludeSource }
      : {}),
    ...(submittedSearch?.dateAdded
      ? { dateAdded: submittedSearch.dateAdded as ListResourcesDateAdded }
      : {}),
    ...(submittedSearch?.minReviews
      ? { minReviews: Number(submittedSearch.minReviews) }
      : {}),
    ...(submittedSearch?.thumbnail
      ? { hasThumbnail: submittedSearch.thumbnail === "with" }
      : {}),
    ...(submittedSearch?.librarySort
      ? { librarySort: submittedSearch.librarySort }
      : {}),
    limit: libraryLimit,
    offset: 0,
  };
  const { data: libraryResults, isLoading: libraryLoading } = useListResources(
    libraryParams,
    {
      query: {
        enabled: submittedSearch !== null && !isSubmittedSourceMode,
        queryKey: getListResourcesQueryKey(libraryParams),
      },
    },
  );

  const starterParams = {
    sortBy: ListResourcesSortBy.top_rated,
    limit: 6,
    offset: 0,
  };
  const {
    data: starterResults,
    isLoading: starterLoading,
    isError: starterError,
  } = useListResources(starterParams, {
    query: {
      enabled: resourceView === "search" && submittedSearch === null,
      queryKey: getListResourcesQueryKey(starterParams),
    },
  });

  // Load the catalogue to identify this user's existing library URLs even
  // while source-only mode hides the library results panel.
  // Server-side rather than filtering libraryCatalog in memory: that query is
  // capped at 50 rows, so an author with a large library would not find their
  // pending items client-side.
  const gatedParams = {
    // Only when set: the empty string is "no filter", not a value the API
    // accepts.
    ...(verificationFilter
      ? { verification: verificationFilter as ListResourcesVerification }
      : {}),
    limit: 50,
    offset: 0,
  };
  const { data: gatedResults, isLoading: gatedLoading } = useListResources(
    gatedParams,
    {
      query: {
        enabled: isLoggedIn && verificationFilter !== "",
        queryKey: getListResourcesQueryKey(gatedParams),
      },
    },
  );

  const libraryCatalogParams = { limit: 50, offset: 0 };
  const { data: libraryCatalog, isLoading: libraryCatalogLoading } =
    useListResources(libraryCatalogParams, {
      query: {
        enabled: isLoggedIn,
        queryKey: getListResourcesQueryKey(libraryCatalogParams),
      },
    });
  // A user's library is the set of resources they submitted, not the entire
  // shared catalogue. Scope the grid to the current account so it only shows
  // (and offers Remove on) resources this user actually owns; browsing the
  // full catalogue is what the Search view is for.
  const uniqueLibraryCatalog = dedupeByWork(
    (libraryCatalog ?? []).filter(
      (resource) => resource.submittedById === me?.id,
    ),
  );
  const uniqueLibraryResults = dedupeByWork(libraryResults ?? []);
  const uniqueStarterResults = dedupeByWork(starterResults ?? []);
  const savedLibraryUrls = new Set(
    (libraryCatalog ?? [])
      .filter((resource) => resource.submittedById === me?.id)
      .map((resource) => canonicalResourceUrl(resource.url)),
  );
  const visibleWebResults = dedupeDiscoveredResources(allWebResults).filter(
    (resource) =>
      !hiddenSourceUrls.includes(resource.url) &&
      !savedLibraryUrls.has(canonicalResourceUrl(resource.url)) &&
      !uniqueLibraryResults.some((libraryResource) =>
        isSameWork(libraryResource, resource),
      ),
  );
  const hasWebResults = visibleWebResults.length > 0;
  // Results came back, but every one of them is already saved. That is a
  // different answer from "the catalog has nothing", and saying the wrong one
  // sends people off to re-search for what they already own.
  const allWebResultsAlreadySaved = !hasWebResults && allWebResults.length > 0;

  const activeLearningGoals = (learningGoals ?? []).filter(
    (goal) => goal.status === "active",
  );
  const selectedContinueGoal = activeLearningGoals.find(
    (goal) => String(goal.id) === continueGoalId,
  );
  const continueResources = continueResourceIds
    .map((id) => (libraryCatalog ?? []).find((resource) => resource.id === id))
    .filter(
      (resource): resource is NonNullable<typeof resource> =>
        resource !== undefined,
    );

  useEffect(() => {
    if (!activeLearningGoals.length) {
      setContinueGoalId("");
      return;
    }
    const routeGoal = new URLSearchParams(routeSearch).get("goal");
    const requestedGoal = routeGoal
      ? activeLearningGoals.find(
          (goal) =>
            goal.title.toLocaleLowerCase() === routeGoal.toLocaleLowerCase(),
        )
      : undefined;
    const currentGoalExists = activeLearningGoals.some(
      (goal) => String(goal.id) === continueGoalId,
    );
    if (requestedGoal) setContinueGoalId(String(requestedGoal.id));
    else if (!currentGoalExists)
      setContinueGoalId(String(activeLearningGoals[0].id));
  }, [learningGoals, routeSearch, continueGoalId]);

  useEffect(() => {
    if (!me?.id || !selectedContinueGoal) {
      setContinueResourceIds([]);
      return;
    }
    const saved =
      accountPreferences?.continueStudying[String(selectedContinueGoal.id)];
    const local = getContinueStudyingResourceIds(
      me.id,
      selectedContinueGoal.id,
    );
    setContinueResourceIds(saved ?? local);
    if (accountPreferences && !saved && local.length)
      updateAccountPreferences.mutate({
        continueStudying: {
          ...accountPreferences.continueStudying,
          [String(selectedContinueGoal.id)]: local,
        },
      });
  }, [accountPreferences, me?.id, selectedContinueGoal?.id]);

  function setContinueResource(resourceId: number, selected: boolean) {
    if (!me?.id || !selectedContinueGoal) return;
    setContinueResourceIds((current) => {
      const next = selected
        ? current.includes(resourceId) || current.length >= 6
          ? current
          : [...current, resourceId]
        : current.filter((id) => id !== resourceId);
      localStorage.setItem(
        continueStudyingStorageKey(me.id, selectedContinueGoal.id),
        JSON.stringify(next),
      );
      updateAccountPreferences.mutate({
        continueStudying: {
          ...(accountPreferences?.continueStudying ?? {}),
          [String(selectedContinueGoal.id)]: next,
        },
      });
      return next;
    });
  }

  // Web discover (shown when searching), accumulate across pages
  const discoverParams = {
    q: submittedSearch?.query ?? "",
    ...(submittedSearch?.resultType === DiscoverResourcesResultType.content &&
    submittedSearch.format &&
    submittedSearch.format !== "all"
      ? { format: submittedSearch.format }
      : {}),
    ...(submittedSearch?.subject ? { subject: submittedSearch.subject } : {}),
    ...(submittedSearch?.resultType === DiscoverResourcesResultType.content &&
    submittedSearch.gradeLevel
      ? { gradeLevel: submittedSearch.gradeLevel }
      : {}),
    language: submittedSearch?.language ?? searchLanguage,
    page: webPage,
    // Where the last page got to, so the next one resumes from there. Sent as
    // well as the page, not instead of it: the page number still decides which
    // window of each open provider is read, while the cursor decides where the
    // stored catalog resumes. Without it a "search more" page was measured
    // handing back a third of what the reader already had, because the catalog
    // keeps growing underneath a positional offset.
    ...(webCursor.after
      ? { after: webCursor.after, sinceId: webCursor.sinceId }
      : {}),
    resultType:
      submittedSearch?.resultType ?? DiscoverResourcesResultType.content,
    ...(submittedSearch?.exactPhrase
      ? { exactPhrase: submittedSearch.exactPhrase }
      : {}),
    ...(submittedSearch?.excludedWords
      ? { exclude: submittedSearch.excludedWords }
      : {}),
    ...(submittedSearch?.sourceDomain
      ? { source: submittedSearch.sourceDomain }
      : {}),
    ...(submittedSearch?.excludeSource
      ? { excludeSource: submittedSearch.excludeSource }
      : {}),
    ...(submittedSearch?.freshness
      ? { freshness: submittedSearch.freshness as DiscoverResourcesFreshness }
      : {}),
    ...(submittedSearch?.sourceQuality
      ? { sourceQuality: submittedSearch.sourceQuality as DiscoverResourcesSourceQuality }
      : {}),
    ...(submittedSearch?.material
      ? { material: submittedSearch.material }
      : {}),
    ...(submittedSearch?.excludeSubjects
      ? { excludeSubjects: submittedSearch.excludeSubjects }
      : {}),
    ...(submittedSearch?.author ? { author: submittedSearch.author } : {}),
    ...(submittedSearch?.titleOnly ? { titleOnly: true } : {}),
    ...(submittedSearch?.publishedFrom
      ? { publishedFrom: Number(submittedSearch.publishedFrom) }
      : {}),
    ...(submittedSearch?.publishedTo
      ? { publishedTo: Number(submittedSearch.publishedTo) }
      : {}),
    ...(submittedSearch?.resultType === DiscoverResourcesResultType.content &&
    submittedSearch.difficulty
      ? { difficulty: submittedSearch.difficulty as DiscoverResourcesDifficulty }
      : {}),
    ...(submittedSearch?.resultType === DiscoverResourcesResultType.content &&
    submittedSearch.access
      ? { accessType: submittedSearch.access as DiscoverResourcesAccessType }
      : {}),
    ...(submittedSearch?.resultType === DiscoverResourcesResultType.content &&
    submittedSearch.license
      ? { license: submittedSearch.license as DiscoverResourcesLicense }
      : {}),
    ...(submittedSearch?.resultType === DiscoverResourcesResultType.content &&
    submittedSearch.contentLength
      ? { contentLength: submittedSearch.contentLength as DiscoverResourcesContentLength }
      : {}),
    ...(submittedSearch?.resultType === DiscoverResourcesResultType.content &&
    submittedSearch.captions
      ? { captions: true }
      : {}),
    ...(submittedSearch?.resultType === DiscoverResourcesResultType.content &&
    submittedSearch.transcript
      ? { transcript: true }
      : {}),
  };
  const {
    data: webResults,
    isFetching: webLoading,
    isError: webError,
    error: webErrorObj,
    refetch: retryWebSearch,
  } = useDiscoverResources(discoverParams, {
    query: {
      enabled: submittedSearch !== null && resourceView === "search",
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retryOnMount: false,
      queryKey: getDiscoverResourcesQueryKey(discoverParams),
      retry: false,
    },
  });

  // The generated client throws ApiError with .status and parsed response data.
  const webErrorResponse = webErrorObj as {
    status?: number;
    data?: { retryAfter?: number; error?: string; code?: string };
  } | null;
  const webRateLimited = webError && webErrorResponse?.status === 429;
  const webDailyLimited =
    webRateLimited && /daily/i.test(webErrorResponse?.data?.error ?? "");
  const webRateLimitRetryAfter = webRateLimited
    ? (webErrorResponse?.data?.retryAfter ?? 60)
    : 0;
  const webCreditsExhausted =
    webErrorResponse?.status === 503 &&
    webErrorResponse.data?.code === "AI_CREDITS_EXHAUSTED";
  const webAuthenticationRequired = webErrorResponse?.status === 401;

  // Reset accumulated results when query changes; append on page increment
  useEffect(() => {
    if (previousActiveQueryRef.current === activeQuery) return;
    previousActiveQueryRef.current = activeQuery;
    resetWebSearch();
  }, [activeQuery]);

  useEffect(() => {
    if (webLoading || !webResults) return;
    // Merge each response once. Folding the same page in twice would look
    // like a page that returned nothing new, which is the signal used below
    // to decide the catalog is exhausted.
    if (mergedWebResponseRef.current === webResults) return;
    mergedWebResponseRef.current = webResults;
    const base = webPage === 1 ? [] : accumulatedWebResultsRef.current;
    const merged = dedupeDiscoveredResources([...base, ...webResults]);
    replaceWebResults(merged);
    // The catalog is finite, and the response is a plain list with no "more"
    // flag, so a page that adds nothing new is how the end announces itself.
    setWebExhausted(merged.length === base.length);
  }, [webResults, webPage, webLoading]);

  useEffect(() => {
    if (!isLoggedIn || !isSearching || webLoading) return;
    void queryClient.invalidateQueries({ queryKey: getGetMyUsageQueryKey() });
  }, [isLoggedIn, isSearching, queryClient, webError, webLoading, webResults]);

  const isTeacher = (me?.activeRole ?? me?.role) === UserRole.teacher;

  // Classes for "Assign to class" teacher flow
  const { data: classes } = useListClasses({
    query: { enabled: isTeacher, queryKey: getListClassesQueryKey() },
  });
  const assignResource = useAssignResourceToClass();
  const [assignTarget, setAssignTarget] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [assignClassId, setAssignClassId] = useState("");

  async function handleAssign() {
    if (!assignTarget || !assignClassId) return;
    try {
      await assignResource.mutateAsync({
        id: Number(assignClassId),
        data: { resourceId: assignTarget.id },
      });
      queryClient.invalidateQueries({
        queryKey: getGetClassResourcesListQueryKey(Number(assignClassId)),
      });
      toast({
        title: "Assigned!",
        description: `"${assignTarget.title}" added to the class resource list.`,
      });
      setAssignTarget(null);
      setAssignClassId("");
    } catch {
      toast({
        title: "Error",
        description: "Could not assign the resource.",
        variant: "destructive",
      });
    }
  }

  const createResource = useCreateResource();
  const deleteResource = useDeleteResource();
  const prefetchMetadata = usePrefetchResourceMetadata();

  async function handleRemoveCard(resourceId: number, title: string) {
    // DELETE /resources is permanent and cascades to the resource's reviews,
    // so the trash icon must not be a single-click action.
    const confirmed = window.confirm(
      `Remove "${title}" from the library?\n\nThe resource and its reviews are deleted permanently. This cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      await deleteResource.mutateAsync({ id: resourceId });
      queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetResourceRecommendationsQueryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: getGetDashboardSummaryQueryKey(),
      });
      toast({
        title: "Removed",
        description: `"${title}" has been removed from the library.`,
      });
    } catch (err: unknown) {
      // The trash icon is offered on search results to any signed-in user, not
      // only the submitter, so 403 is a routine outcome here and "Could not
      // remove the resource" told that user nothing about why. The helper this
      // patch introduces already has the right sentence for it.
      toast({
        title: "Error",
        description: describeApiError(err, "Could not remove the resource."),
        variant: "destructive",
      });
    }
  }
  const [addingUrl, setAddingUrl] = useState<string | null>(null);

  // Submit form
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newFormat, setNewFormat] = useState<ResourceInputFormat>(
    ResourceInputFormat.article,
  );
  const [newSubject, setNewSubject] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [prefetching, setPrefetching] = useState(false);
  const [prefetchedThumbnailUrl, setPrefetchedThumbnailUrl] = useState<
    string | null
  >(null);
  // Track which URL is currently being fetched so stale responses don't clobber newer edits
  const prefetchingUrlRef = useRef<string>("");

  async function handleUrlBlur() {
    const url = newUrl.trim();
    if (!url) return;
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
    } catch {
      return;
    } // not a valid URL yet, skip
    // Don't prefetch if title is already filled (user typed it themselves)
    if (newTitle.trim()) return;

    prefetchingUrlRef.current = url;
    setPrefetching(true);
    try {
      const meta = await prefetchMetadata.mutateAsync({ data: { url } });
      // Only apply if the URL hasn't changed since we fired this request
      if (prefetchingUrlRef.current !== url) return;
      // Use functional updaters so we read the *current* state, not the closure-captured one.
      // This prevents a stale response from overwriting text the user typed while waiting.
      if (meta.title) setNewTitle((cur) => (cur.trim() ? cur : meta.title));
      if (meta.description)
        setNewDesc((cur) => (cur.trim() ? cur : meta.description));
      if (meta.format)
        setNewFormat((cur) =>
          cur !== ResourceInputFormat.article
            ? cur
            : (meta.format as ResourceInputFormat),
        );
      setPrefetchedThumbnailUrl(meta.thumbnailUrl ?? null);
    } catch {
      // silently ignore, user can fill in manually
    } finally {
      if (prefetchingUrlRef.current === url) setPrefetching(false);
    }
  }

  function clearSearch() {
    setInputValue("");
    setActiveQuery("");
    setSubmittedSearch(null);
    resetWebSearch();
    sessionStorage.removeItem(RESOURCE_SEARCH_STATE_KEY);
    updateAccountPreferences.mutate({ resourceSearchState: null });
    inputRef.current?.focus();
  }

  function resetAdvancedFilters() {
    setExactPhraseFilter("");
    setExcludedWordsFilter("");
    setSourceDomainFilter("");
    setExcludeSourceFilter("");
    setDateAddedFilter("");
    setMinReviewsFilter("");
    setThumbnailFilter("");
    setLibrarySortFilter("");
    setFreshnessFilter("");
    setDifficultyFilter("");
    setAccessFilter("");
    setLicenseFilter("");
    setContentLengthFilter("");
    setSourceQualityFilter("");
    setMaterialFilter("");
    setExcludeSubjectsFilter("");
    setAuthorFilter("");
    setTitleOnlyFilter(false);
    setPublishedFromFilter("");
    setPublishedToFilter("");
    setCaptionsRequired(false);
    setTranscriptRequired(false);
  }

  const activeAdvancedFilterCount = [
    exactPhraseFilter,
    excludedWordsFilter,
    sourceDomainFilter,
    excludeSourceFilter,
    dateAddedFilter,
    minReviewsFilter,
    thumbnailFilter,
    librarySortFilter,
    freshnessFilter,
    difficultyFilter,
    accessFilter,
    licenseFilter,
    contentLengthFilter,
    sourceQualityFilter,
    materialFilter,
    excludeSubjectsFilter,
    authorFilter,
    titleOnlyFilter,
    publishedFromFilter,
    publishedToFilter,
    captionsRequired,
    transcriptRequired,
  ].filter(Boolean).length;

  /** Everything except the words: what the filter controls currently say. */
  function currentSearchFilters(): SubmittedResourceFilters {
    return {
      format: formatFilter,
      subject: subjectFilter.trim(),
      gradeLevel: gradeLevelFilter,
      language: searchLanguage,
      resultType: resultTypeFilter,
      sortBy: sortByFilter,
      minRating: minRatingFilter,
      exactPhrase: exactPhraseFilter.trim(),
      excludedWords: excludedWordsFilter.trim(),
      sourceDomain: sourceDomainFilter.trim(),
      excludeSource: excludeSourceFilter.trim(),
      dateAdded: dateAddedFilter,
      minReviews: minReviewsFilter,
      thumbnail: thumbnailFilter,
      librarySort: librarySortFilter,
      freshness: freshnessFilter,
      difficulty: difficultyFilter,
      access: accessFilter,
      license: licenseFilter,
      contentLength: contentLengthFilter,
      sourceQuality: sourceQualityFilter,
      material: materialFilter,
      excludeSubjects: excludeSubjectsFilter,
      author: authorFilter,
      titleOnly: titleOnlyFilter,
      publishedFrom: publishedFromFilter,
      publishedTo: publishedToFilter,
      captions: captionsRequired,
      transcript: transcriptRequired,
    };
  }

  /** Put the filter controls back to a remembered set. */
  function applySearchFilters(filters: SubmittedResourceFilters) {
    setFormatFilter(filters.format);
    setSubjectFilter(filters.subject);
    setGradeLevelFilter(filters.gradeLevel);
    setSearchLanguage(filters.language);
    setResultTypeFilter(filters.resultType);
    setSortByFilter(filters.sortBy);
    setMinRatingFilter(filters.minRating);
    setExactPhraseFilter(filters.exactPhrase);
    setExcludedWordsFilter(filters.excludedWords);
    setSourceDomainFilter(filters.sourceDomain);
    setExcludeSourceFilter(filters.excludeSource);
    setDateAddedFilter(filters.dateAdded);
    setMinReviewsFilter(filters.minReviews);
    setThumbnailFilter(filters.thumbnail);
    setLibrarySortFilter(filters.librarySort);
    setFreshnessFilter(filters.freshness);
    setDifficultyFilter(filters.difficulty);
    setAccessFilter(filters.access);
    setLicenseFilter(filters.license);
    setContentLengthFilter(filters.contentLength);
    setSourceQualityFilter(filters.sourceQuality);
    setMaterialFilter(filters.material);
    setExcludeSubjectsFilter(filters.excludeSubjects);
    setAuthorFilter(filters.author);
    setTitleOnlyFilter(filters.titleOnly);
    setPublishedFromFilter(filters.publishedFrom);
    setPublishedToFilter(filters.publishedTo);
    setCaptionsRequired(filters.captions);
    setTranscriptRequired(filters.transcript);
  }

  /**
   * Run a search for these words and these filters.
   *
   * Both the form and the recent-search chips come through here, and the
   * filters are passed in rather than read from state. A chip has to set the
   * controls *and* search with the same values, and React applies the setters
   * after this function returns — reading state would search with whatever the
   * previous search had.
   */
  function runSearch(query: string, filters: SubmittedResourceFilters) {
    const q = query.trim();
    if (!q) return;
    setInputValue(q);
    setSubmittedSearch({ query: q, ...filters });
    setActiveQuery(q);
    resetWebSearch();
    setLibraryLimit(12); // reset pagination on new search
    if (me?.id) {
      // The filters travel with the query, so the chip can put the reader back
      // in the search they actually ran rather than only its words.
      const nextHistory = addSearchHistory(me.id, q, filters);
      setSearchHistory(nextHistory);
      updateAccountPreferences.mutate({ searchHistory: nextHistory });
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch(inputValue, currentSearchFilters());
  }

  /**
   * Rebuild a complete filter set from a stored history entry.
   *
   * Stored entries are untrusted: defaults were dropped to keep them small,
   * older ones predate some filters, and the value came back through the API.
   * Anything missing or unrecognised falls back to the default rather than
   * being trusted into a filter control.
   */
  function filtersFromHistory(
    stored: SearchHistoryFilters,
  ): SubmittedResourceFilters {
    const text = (name: string) =>
      typeof stored[name] === "string" ? (stored[name] as string) : "";
    const oneOf = <T extends string>(name: string, allowed: readonly T[]) => {
      const value = text(name);
      return (allowed as readonly string[]).includes(value)
        ? (value as T)
        : undefined;
    };
    return {
      format: text("format"),
      subject: text("subject"),
      gradeLevel: text("gradeLevel"),
      language:
        oneOf(
          "language",
          SEARCH_LANGUAGE_OPTIONS.map((option) => option.code),
        ) ?? searchLanguage,
      resultType:
        oneOf("resultType", Object.values(DiscoverResourcesResultType)) ??
        DiscoverResourcesResultType.content,
      sortBy: oneOf("sortBy", Object.values(ListResourcesSortBy)) ?? "",
      minRating:
        typeof stored.minRating === "number" ? stored.minRating : "",
      exactPhrase: text("exactPhrase"),
      excludedWords: text("excludedWords"),
      sourceDomain: text("sourceDomain"),
      excludeSource: text("excludeSource"),
      dateAdded: text("dateAdded"),
      minReviews: text("minReviews"),
      thumbnail: text("thumbnail"),
      librarySort: text("librarySort"),
      freshness: text("freshness"),
      difficulty: text("difficulty"),
      access: text("access"),
      license: text("license"),
      contentLength: text("contentLength"),
      sourceQuality: text("sourceQuality"),
      material: text("material"),
      excludeSubjects: text("excludeSubjects"),
      author: text("author"),
      titleOnly: stored.titleOnly === true,
      publishedFrom: text("publishedFrom"),
      publishedTo: text("publishedTo"),
      captions: stored.captions === true,
      transcript: stored.transcript === true,
    };
  }

  /** Re-run a search from the recent list, filters and all. */
  function runSearchFromHistory(item: SearchHistoryItem) {
    const filters = item.filters
      ? filtersFromHistory(item.filters)
      : currentSearchFilters();
    applySearchFilters(filters);
    runSearch(item.query, filters);
  }

  function resetForm() {
    setNewTitle("");
    setNewUrl("");
    setNewDesc("");
    setNewFormat(ResourceInputFormat.article);
    setNewSubject("");
    setNewGrade("");
    setPrefetchedThumbnailUrl(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createResource.mutateAsync({
        data: {
          title: newTitle,
          url: newUrl,
          description: newDesc || undefined,
          format: newFormat,
          subject: newSubject,
          gradeLevel: newGrade,
          thumbnailUrl: prefetchedThumbnailUrl ?? undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetResourceRecommendationsQueryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: getGetDashboardSummaryQueryKey(),
      });
      toast({
        title: "Resource submitted!",
        description: `"${newTitle}" has been added.`,
      });
      resetForm();
      setDialogOpen(false);
    } catch (err) {
      toast({
        title: "Resource was not submitted",
        description: describeApiError(
          err,
          "Check the title, URL, subject and grade level, then try again.",
        ),
        variant: "destructive",
      });
    }
  }

  async function handleAddWeb(resource: DiscoveredResource): Promise<boolean> {
    if (!isLoggedIn) {
      setLocation("/auth/login");
      return false;
    }
    setAddingUrl(resource.url);
    try {
      await createResource.mutateAsync({
        data: {
          title: resource.title,
          url: resource.url,
          description: resource.description,
          format: resource.format as ResourceInputFormat,
          subject: resource.subject ?? "General",
          gradeLevel: resource.gradeLevel ?? "All grades",
          thumbnailUrl: resource.thumbnailUrl ?? undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetResourceRecommendationsQueryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: getGetDashboardSummaryQueryKey(),
      });
      toast({
        title: "Saved to library!",
        description: `"${resource.title}" added.`,
      });
      return true;
    } catch (err) {
      toast({
        title: "Not saved to your library",
        description: describeApiError(
          err,
          `"${resource.title}" could not be saved. Try again in a moment.`,
        ),
        variant: "destructive",
      });
      return false;
    } finally {
      setAddingUrl(null);
    }
  }

  async function handleSaveSource(resource: DiscoveredResource) {
    const saved = await handleAddWeb(resource);
    if (saved) {
      // Advance immediately; the invalidated library query also ensures this
      // URL remains excluded if the search results are rebuilt.
      setHiddenSourceUrls((urls) => [...new Set([...urls, resource.url])]);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Resources</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {resourceView === "library"
              ? "Saved learning resources and goal collections"
              : isSearching
                ? `Showing library results and web results for "${activeQuery}"`
                : isLoggedIn
                  ? "Your personalised library, based on what you've been learning"
                  : "Browse the library or search the open education catalog"}
          </p>
        </div>
        {/*
          Wraps, because these two labels are longer in every other language.
          At 375px "Generador de citas / Enviar recurso" ran 9px past the right
          edge and "Zitiergenerator / Ressource einreichen" ran 32px past it.

          Measured rather than assumed: <main> has overflow-x: auto, so the
          button was reachable by dragging the page sideways, not lost. That
          makes it a smaller bug than it looks and still a bug -- a phone page
          that scrolls horizontally is a defect, and a primary action that
          starts off the edge of the screen is one whether or not you can drag
          to it.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => openCitation()}
            data-testid="citation-maker-button"
          >
            <Quote size={15} className="mr-1.5" /> Citation maker
          </Button>
          {isLoggedIn ? (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="submit-resource-button">
                  <Plus size={16} className="mr-1.5" /> Submit Resource
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Submit a Resource</DialogTitle>
                  <DialogDescription>
                    Share a learning resource with the community
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="res-title">Title</Label>
                    <Input
                      id="res-title"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      required
                      data-testid="resource-title-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="res-url"
                      className="flex items-center gap-1.5"
                    >
                      URL
                      {prefetching && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" />{" "}
                          auto-filling…
                        </span>
                      )}
                      {!prefetching && newTitle && newUrl && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Wand2 size={10} /> auto-filled
                        </span>
                      )}
                    </Label>
                    <Input
                      id="res-url"
                      type="url"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      onBlur={handleUrlBlur}
                      required
                      data-testid="resource-url-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="res-desc">Description (optional)</Label>
                    <Textarea
                      id="res-desc"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      rows={2}
                      data-testid="resource-desc-input"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Format</Label>
                      <Select
                        value={newFormat}
                        onValueChange={(v) =>
                          setNewFormat(v as ResourceInputFormat)
                        }
                      >
                        <SelectTrigger data-testid="resource-format-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(ResourceInputFormat).map((f) => (
                            <SelectItem
                              key={f}
                              value={f}
                              className="capitalize"
                            >
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="res-subject">Subject</Label>
                      <Input
                        id="res-subject"
                        value={newSubject}
                        onChange={(e) => setNewSubject(e.target.value)}
                        required
                        data-testid="resource-subject-input"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="res-grade">Grade Level</Label>
                    <Input
                      id="res-grade"
                      value={newGrade}
                      onChange={(e) => setNewGrade(e.target.value)}
                      required
                      data-testid="resource-grade-input"
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setDialogOpen(false);
                        resetForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createResource.isPending}
                      data-testid="submit-resource-confirm"
                    >
                      {createResource.isPending ? "Submitting…" : "Submit"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : (
            <Button variant="outline" asChild data-testid="sign-in-to-submit">
              <Link href="/auth/login">
                <LogIn size={15} className="mr-1.5" /> Sign in
              </Link>
            </Button>
          )}
        </div>
      </div>

      <CitationDialog
        open={citationOpen}
        onOpenChange={setCitationOpen}
        resource={citationResource}
      />
      <UnsavedSourceResearchDialog
        resource={researchResource}
        open={researchOpen}
        onOpenChange={setResearchOpen}
        isLoggedIn={isLoggedIn}
        onRequireLogin={() => setLocation("/auth/login")}
      />

      <div
        className="inline-flex w-full overflow-hidden rounded-lg border bg-card p-1 text-card-foreground sm:w-auto"
        role="tablist"
        aria-label="Resource views"
      >
        <button
          type="button"
          role="tab"
          aria-selected={resourceView === "search"}
          onClick={() => setResourceView("search")}
          className={`flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium sm:flex-none ${resourceView === "search" ? "bg-primary text-primary-foreground" : "text-card-foreground/70 hover:text-card-foreground"}`}
        >
          <Search size={15} /> Search
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={resourceView === "library"}
          onClick={() => setResourceView("library")}
          className={`flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium sm:flex-none ${resourceView === "library" ? "bg-primary text-primary-foreground" : "text-card-foreground/70 hover:text-card-foreground"}`}
        >
          <BookOpen size={15} /> Library
        </button>
      </div>

      {/* Search bar */}
      {resourceView === "search" && (
        <form
          onSubmit={handleSearchSubmit}
          className="space-y-2"
          role="search"
          aria-label="Resource search"
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={inputRef}
                /*
                  The right padding is there to clear the X, and the X only
                  exists once something is typed. Held unconditionally it cost
                  24px of an already-tight phone row, which was the difference
                  between "Rechercher des ressources…" fitting and being cut.
                */
                className={`h-11 pl-9 text-base ${inputValue ? "pr-9" : "pr-3"}`}
                aria-label="Search resources"
                /*
                  The examples are the point of this placeholder and a phone
                  never sees them: at 375px the field has room for about
                  "Search anything, " and the rest is simply gone, in every
                  language. A short instruction that fits beats a long one
                  truncated mid-example.
                */
                placeholder={
                  isMobile
                    ? "Search resources…"
                    : 'Search anything, "photosynthesis", "MIT calculus", "Python for beginners"…'
                }
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                data-testid="search-input"
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear resource search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            {/*
              The word is a desktop luxury. With it, the button took 150px of a
              375px row and left the field 176 -- room for "Search resource"
              and not the rest, before any translation made it worse. Icon only
              below sm, with the name kept on the button so a screen reader
              still hears "Search" either way.
            */}
            <Button
              type="submit"
              size="lg"
              className="shrink-0 px-3 sm:px-8"
              aria-label="Search"
              disabled={!inputValue.trim()}
            >
              <Search size={15} className="sm:mr-1.5" aria-hidden="true" />
              <span className="hidden sm:inline">Search</span>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={resultTypeFilter}
              onValueChange={(value) =>
                setResultTypeFilter(value as DiscoverResourcesResultType)
              }
            >
              <SelectTrigger
                // Wide enough for the longest label in the longest language.
                // At w-44 it clipped "Source: specific content" in English and
                // every translation of it in the other five.
                className="w-60 h-8 text-xs"
                data-testid="source-filter"
                aria-label="Source type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DiscoverResourcesResultType.content}>
                  Source: specific content
                </SelectItem>
                <SelectItem value={DiscoverResourcesResultType.source}>
                  Source: websites & channels
                </SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={searchLanguage}
              onValueChange={(value) =>
                setSearchLanguage(value as SearchLanguage)
              }
            >
              <SelectTrigger
                className="w-36 h-8 text-xs"
                data-testid="search-language-filter"
                aria-label="Search language"
              >
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                {SEARCH_LANGUAGE_OPTIONS.map((language) => (
                  <SelectItem key={language.code} value={language.code}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isSourceMode && (
              <>
                <MultiSelectFilter
                  value={formatFilter}
                  onChange={setFormatFilter}
                  options={FORMAT_OPTIONS.map((f) => ({ value: f, label: f }))}
                  label="formats"
                  allLabel="All formats"
                  className="w-36 h-8 text-xs"
                  testId="format-filter"
                />
                <Input
                  className="w-36 h-8 text-xs"
                  aria-label="Subject"
                  placeholder="Subject…"
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  data-testid="subject-filter"
                />
                <MultiSelectFilter
                  value={gradeLevelFilter}
                  onChange={setGradeLevelFilter}
                  options={GRADE_LEVEL_OPTIONS.map((g) => ({
                    value: g,
                    label: g,
                  }))}
                  label="grades"
                  allLabel="All grades"
                  className="w-36 h-8 text-xs"
                  testId="grade-filter"
                />
                <Select
                  value={
                    minRatingFilter === "" ? "any" : String(minRatingFilter)
                  }
                  onValueChange={(v) =>
                    setMinRatingFilter(v === "any" ? "" : Number(v))
                  }
                >
                  <SelectTrigger
                    className="w-44 h-8 text-xs"
                    data-testid="rating-filter"
                    aria-label="Minimum rating"
                  >
                    <SelectValue placeholder="Any rating" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any rating</SelectItem>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {"★".repeat(n)} & up
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={librarySortFilter || sortByFilter || "newest"}
                  onValueChange={(v) => {
                    if (
                      v === ListResourcesSortBy.top_rated ||
                      v === ListResourcesSortBy.most_reviewed
                    ) {
                      setSortByFilter(v as ListResourcesSortBy);
                      setLibrarySortFilter("");
                    } else {
                      setSortByFilter("");
                      setLibrarySortFilter(v === "newest" ? "" : v);
                    }
                  }}
                >
                  <SelectTrigger
                    className="w-48 h-8 text-xs"
                    data-testid="sort-filter"
                    aria-label="Sort order"
                  >
                    <SelectValue placeholder="Newest first" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="title_asc">Title A–Z</SelectItem>
                    <SelectItem value="title_desc">Title Z–A</SelectItem>
                    <SelectItem value={ListResourcesSortBy.top_rated}>
                      Top rated
                    </SelectItem>
                    <SelectItem value={ListResourcesSortBy.most_reviewed}>
                      Most reviewed
                    </SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvancedFilters((current) => !current)}
              aria-expanded={showAdvancedFilters}
              data-testid="advanced-filters-toggle"
            >
              <SlidersHorizontal size={14} className="mr-1.5" />
              More filters
              {activeAdvancedFilterCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {activeAdvancedFilterCount}
                </span>
              )}
            </Button>

            {activeAdvancedFilterCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetAdvancedFilters}
                className="text-muted-foreground"
              >
                <RotateCcw size={13} className="mr-1.5" /> Reset
              </Button>
            )}
          </div>

          {showAdvancedFilters && (
            <div
              className="space-y-4 border-t pt-4"
              data-testid="advanced-filters"
            >
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Match
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="exact-phrase-filter" className="text-xs">
                      Exact phrase
                    </Label>
                    <Input
                      id="exact-phrase-filter"
                      className="h-9 text-sm"
                      value={exactPhraseFilter}
                      onChange={(event) =>
                        setExactPhraseFilter(event.target.value)
                      }
                      placeholder="e.g. cellular respiration"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="exclude-filter" className="text-xs">
                      Exclude words
                    </Label>
                    <Input
                      id="exclude-filter"
                      className="h-9 text-sm"
                      value={excludedWordsFilter}
                      onChange={(event) =>
                        setExcludedWordsFilter(event.target.value)
                      }
                      placeholder="comma or space separated"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="source-domain-filter" className="text-xs">
                      Website, publisher, or creator
                    </Label>
                    <Input
                      id="source-domain-filter"
                      className="h-9 text-sm"
                      value={sourceDomainFilter}
                      onChange={(event) =>
                        setSourceDomainFilter(event.target.value)
                      }
                      placeholder="e.g. mit.edu"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="author-filter" className="text-xs">
                      Author or contributor
                    </Label>
                    <Input
                      id="author-filter"
                      className="h-9 text-sm"
                      value={authorFilter}
                      onChange={(event) => setAuthorFilter(event.target.value)}
                      placeholder="e.g. Feynman"
                      data-testid="author-filter"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="exclude-subjects-filter" className="text-xs">
                      Exclude subjects
                    </Label>
                    <Input
                      id="exclude-subjects-filter"
                      className="h-9 text-sm"
                      value={excludeSubjectsFilter}
                      onChange={(event) =>
                        setExcludeSubjectsFilter(event.target.value)
                      }
                      placeholder="e.g. Medicine, Law"
                      data-testid="exclude-subjects-filter"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Published between</Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        className="h-9 text-sm"
                        inputMode="numeric"
                        value={publishedFromFilter}
                        onChange={(event) =>
                          setPublishedFromFilter(
                            event.target.value.replace(/\D/g, "").slice(0, 4),
                          )
                        }
                        placeholder="From"
                        aria-label="Published from year"
                        data-testid="published-from-filter"
                      />
                      <span className="text-xs text-muted-foreground">–</span>
                      <Input
                        className="h-9 text-sm"
                        inputMode="numeric"
                        value={publishedToFilter}
                        onChange={(event) =>
                          setPublishedToFilter(
                            event.target.value.replace(/\D/g, "").slice(0, 4),
                          )
                        }
                        placeholder="To"
                        aria-label="Published to year"
                        data-testid="published-to-filter"
                      />
                    </div>
                  </div>
                  <div className="flex items-end">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={titleOnlyFilter}
                        onCheckedChange={(checked) =>
                          setTitleOnlyFilter(checked === true)
                        }
                        data-testid="title-only-filter"
                      />
                      <span>Topic must be in the title</span>
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="exclude-source-filter" className="text-xs">
                      Exclude a website, publisher, or creator
                    </Label>
                    <Input
                      id="exclude-source-filter"
                      className="h-9 text-sm"
                      value={excludeSourceFilter}
                      onChange={(event) =>
                        setExcludeSourceFilter(event.target.value)
                      }
                      placeholder="e.g. wikipedia"
                      data-testid="exclude-source-filter"
                    />
                  </div>
                </div>
              </div>

              {!isSourceMode && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Saved library
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Date added</Label>
                      <Select
                        value={dateAddedFilter || "any"}
                        onValueChange={(value) =>
                          setDateAddedFilter(value === "any" ? "" : value)
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any time</SelectItem>
                          <SelectItem value="day">Past 24 hours</SelectItem>
                          <SelectItem value="week">Past week</SelectItem>
                          <SelectItem value="month">Past month</SelectItem>
                          <SelectItem value="year">Past year</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Minimum reviews</Label>
                      <Select
                        value={minReviewsFilter || "any"}
                        onValueChange={(value) =>
                          setMinReviewsFilter(value === "any" ? "" : value)
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any review count</SelectItem>
                          <SelectItem value="1">1 or more</SelectItem>
                          <SelectItem value="3">3 or more</SelectItem>
                          <SelectItem value="5">5 or more</SelectItem>
                          <SelectItem value="10">10 or more</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Preview image</Label>
                      <Select
                        value={thumbnailFilter || "any"}
                        onValueChange={(value) =>
                          setThumbnailFilter(value === "any" ? "" : value)
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">With or without</SelectItem>
                          <SelectItem value="with">
                            Has preview image
                          </SelectItem>
                          <SelectItem value="without">
                            No preview image
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Web discovery
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Published or updated</Label>
                    <Select
                      value={freshnessFilter || "any"}
                      onValueChange={(value) =>
                        setFreshnessFilter(value === "any" ? "" : value)
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any time</SelectItem>
                        <SelectItem value="week">Past week</SelectItem>
                        <SelectItem value="month">Past month</SelectItem>
                        <SelectItem value="year">Past year</SelectItem>
                        <SelectItem value="three_years">
                          Past 3 years
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Material</Label>
                    <MultiSelectFilter
                      value={materialFilter}
                      onChange={setMaterialFilter}
                      options={[
                        { value: "book", label: "Books and textbooks" },
                        { value: "course", label: "Courses and lesson series" },
                        { value: "reference", label: "Encyclopedia and reference" },
                        { value: "paper", label: "Peer-reviewed papers" },
                        { value: "primary", label: "Primary source texts" },
                        { value: "video", label: "Video lessons" },
                      ]}
                      label="materials"
                      allLabel="Any material"
                      className="h-9 w-full text-sm"
                      testId="material-filter"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Source credibility</Label>
                    <MultiSelectFilter
                      value={sourceQualityFilter}
                      onChange={setSourceQualityFilter}
                      options={[
                        { value: "academic", label: "Academic and peer-reviewed" },
                        { value: "institutional", label: "Universities and institutions" },
                        { value: "established", label: "Established learning platforms" },
                        { value: "independent", label: "Vetted independent sources" },
                      ]}
                      label="tiers"
                      allLabel="Any credibility"
                      className="h-9 w-full text-sm"
                      testId="source-credibility-filter"
                    />
                  </div>
                  {!isSourceMode && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Difficulty</Label>
                        <Select
                          value={difficultyFilter || "any"}
                          onValueChange={(value) =>
                            setDifficultyFilter(value === "any" ? "" : value)
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any difficulty</SelectItem>
                            <SelectItem value="beginner">Beginner</SelectItem>
                            <SelectItem value="intermediate">
                              Intermediate
                            </SelectItem>
                            <SelectItem value="advanced">Advanced</SelectItem>
                            <SelectItem value="mixed">Mixed levels</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Access</Label>
                        <Select
                          value={accessFilter || "any"}
                          onValueChange={(value) =>
                            setAccessFilter(value === "any" ? "" : value)
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any access</SelectItem>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="no_account">
                              No account required
                            </SelectItem>
                            <SelectItem value="open">
                              Open access preferred
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Usage rights</Label>
                        <Select
                          value={licenseFilter || "any"}
                          onValueChange={(value) =>
                            setLicenseFilter(value === "any" ? "" : value)
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any license</SelectItem>
                            <SelectItem value="reusable">
                              Reusable or open
                            </SelectItem>
                            <SelectItem value="known">
                              License stated
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Learning length</Label>
                        <Select
                          value={contentLengthFilter || "any"}
                          onValueChange={(value) =>
                            setContentLengthFilter(value === "any" ? "" : value)
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Any length</SelectItem>
                            <SelectItem value="short">
                              Up to 15 minutes
                            </SelectItem>
                            <SelectItem value="medium">
                              15–45 minutes
                            </SelectItem>
                            <SelectItem value="long">
                              More than 45 minutes
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="flex min-h-9 items-center gap-2 text-sm">
                        <Checkbox
                          checked={captionsRequired}
                          onCheckedChange={(checked) =>
                            setCaptionsRequired(checked === true)
                          }
                        />
                        Captions available
                      </label>
                      <label className="flex min-h-9 items-center gap-2 text-sm">
                        <Checkbox
                          checked={transcriptRequired}
                          onCheckedChange={(checked) =>
                            setTranscriptRequired(checked === true)
                          }
                        />
                        Transcript available
                      </label>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </form>
      )}

      {resourceView === "search" && isLoggedIn && searchHistory.length > 0 && (
        <section aria-label="Recent searches" className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent searches
          </p>
          <div className="flex flex-wrap gap-2">
            {searchHistory.map((item) => (
              <span
                key={item.query}
                className="inline-flex items-center rounded-full border bg-card"
              >
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm hover:text-primary-text"
                  onClick={() => runSearchFromHistory(item)}
                >
                  {item.query}
                </button>
                <button
                  type="button"
                  className="border-l px-2 py-1.5 text-muted-foreground hover:text-destructive-text"
                  aria-label={`Delete ${item.query} from search history`}
                  onClick={() => {
                    if (!me?.id) return;
                    const nextHistory = deleteSearchHistory(me.id, item.query);
                    setSearchHistory(nextHistory);
                    updateAccountPreferences.mutate({
                      searchHistory: nextHistory,
                    });
                  }}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}

      {resourceView === "search" && !isSearching && (
        <section
          aria-labelledby="starter-resources-heading"
          className="space-y-4"
        >
          <div>
            <h2
              id="starter-resources-heading"
              className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <BookOpen size={14} /> Top-rated in the Casparel library
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a community resource now, or search above for something
              specific.
            </p>
          </div>
          {starterLoading ? (
            <CardSkeletons count={3} />
          ) : starterError ? (
            <p className="border-y py-8 text-center text-sm text-muted-foreground">
              The starter library could not be loaded. Search is still available
              above.
            </p>
          ) : uniqueStarterResults.length ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {uniqueStarterResults.map((resource) => (
                <LibraryCard
                  key={resource.id}
                  resource={resource}
                  onClick={() => setLocation(`/resources/${resource.id}`)}
                  onCitation={() => openCitation(resource)}
                  onRemove={
                    me && resource.submittedById === me.id
                      ? () => handleRemoveCard(resource.id, resource.title)
                      : undefined
                  }
                  onAssign={
                    isTeacher
                      ? () =>
                          setAssignTarget({
                            id: resource.id,
                            title: resource.title,
                          })
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <p className="border-y py-8 text-center text-sm text-muted-foreground">
              No public resources have been added yet. Try the open catalog
              search above.
            </p>
          )}
        </section>
      )}

      {/* ── CONTINUE STUDYING ─────────────────────────────────────── */}
      {resourceView === "library" && isLoggedIn && (
        <section id="continue-studying" className="scroll-mt-16 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Target size={14} /> Continue studying
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Keep the library resources you use for each active goal
                together.
              </p>
            </div>
            {activeLearningGoals.length > 0 && (
              <div className="w-full sm:w-72">
                <Label htmlFor="continue-goal" className="sr-only">
                  Learning goal
                </Label>
                <Select
                  value={continueGoalId}
                  onValueChange={setContinueGoalId}
                >
                  <SelectTrigger id="continue-goal">
                    <SelectValue placeholder="Choose a learning goal" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeLearningGoals.map((goal) => (
                      <SelectItem key={goal.id} value={String(goal.id)}>
                        {goal.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {!activeLearningGoals.length ? (
            <div className="border-y py-8 text-center">
              <p className="font-medium">No active learning goals</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create or resume a goal before choosing study resources.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/goals">Open learning goals</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
                <div>
                  <p className="font-medium">{selectedContinueGoal?.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedContinueGoal?.subject}
                    {continueResourceIds.length
                      ? ` · ${continueResourceIds.length} selected`
                      : " · No resources selected"}
                  </p>
                </div>
                <Dialog
                  open={chooseContinueResourcesOpen}
                  onOpenChange={setChooseContinueResourcesOpen}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <BookOpen size={14} className="mr-1.5" /> Choose resources
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Choose resources</DialogTitle>
                      <DialogDescription>
                        Select up to six library resources for this goal.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                      {(libraryCatalog ?? []).length ? (
                        (libraryCatalog ?? []).map((resource) => {
                          const checked = continueResourceIds.includes(
                            resource.id,
                          );
                          const disabled =
                            !checked && continueResourceIds.length >= 6;
                          return (
                            <label
                              key={resource.id}
                              className="flex cursor-pointer items-start gap-3 border-b py-3 last:border-b-0"
                            >
                              <Checkbox
                                checked={checked}
                                disabled={disabled}
                                onCheckedChange={(value) =>
                                  setContinueResource(
                                    resource.id,
                                    value === true,
                                  )
                                }
                                aria-label={`Use ${resource.title} for this goal`}
                              />
                              <span className="min-w-0">
                                <span className="block font-medium">
                                  {resource.title}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {metaLine(resource.subject, resource.format)}
                                </span>
                              </span>
                            </label>
                          );
                        })
                      ) : (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          Your library is empty. Save a resource first.
                        </p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => setChooseContinueResourcesOpen(false)}
                      >
                        Done
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {continueResources.length ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {continueResources.map((resource) => (
                    <LibraryCard
                      key={resource.id}
                      resource={resource}
                      onClick={() => setLocation(`/resources/${resource.id}`)}
                      onCitation={() => openCitation(resource)}
                    />
                  ))}
                </div>
              ) : (
                <div className="border-b py-8 text-center text-muted-foreground">
                  <BookOpen size={30} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium text-foreground">
                    Choose resources for this goal
                  </p>
                  <p className="mt-1 text-sm">
                    They will stay here whenever you return to continue
                    studying.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {resourceView === "library" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Library</h2>
              <p className="text-sm text-muted-foreground">
                Resources saved in Casparel. Open, cite, assign, or remove them
                here.
              </p>
            </div>
            {isLoggedIn ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={
                    verificationFilter === "pending" ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() =>
                    setVerificationFilter((current) =>
                      current === "pending" ? "" : "pending",
                    )
                  }
                  aria-pressed={verificationFilter === "pending"}
                  data-testid="filter-pending-review"
                >
                  <ShieldAlert size={14} className="mr-1.5" />
                  Pending review
                </Button>
                <Button
                  type="button"
                  variant={
                    verificationFilter === "rejected" ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() =>
                    setVerificationFilter((current) =>
                      current === "rejected" ? "" : "rejected",
                    )
                  }
                  aria-pressed={verificationFilter === "rejected"}
                  data-testid="filter-rejected"
                >
                  <ShieldX size={14} className="mr-1.5" />
                  Not approved
                </Button>
              </div>
            ) : null}
          </div>

          {verificationFilter ? (
            gatedLoading ? (
              <CardSkeletons count={3} />
            ) : !gatedResults?.length ? (
              <div className="border-y py-10 text-center">
                <ShieldCheck className="mx-auto mb-3 size-7 text-muted-foreground" />
                <p className="font-medium">
                  {verificationFilter === "pending"
                    ? "Nothing waiting on review"
                    : "Nothing was turned down"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {verificationFilter === "pending"
                    ? "Resources you submit are checked before they appear in the public library."
                    : "Rejected submissions show the reviewer's reason here."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {gatedResults.map((resource) => (
                  <LibraryCard
                    key={resource.id}
                    resource={resource}
                    onClick={() =>
                      setLocation(`/resources/${resource.id}?from=library`)
                    }
                    onCitation={() => openCitation(resource)}
                    onRemove={
                      me && resource.submittedById === me.id
                        ? () => handleRemoveCard(resource.id, resource.title)
                        : undefined
                    }
                  />
                ))}
              </div>
            )
          ) : meLoading || libraryCatalogLoading ? (
            // Both flags, not just the catalog's. The catalog query is gated on
            // isLoggedIn, which is derived from /users/me, so while that call is
            // in flight the catalog is DISABLED and reports loading false - and
            // the empty state painted for the whole round trip. Skeletons for
            // the catalog alone only narrowed the window; this closes it.
            // useGetMe has retry: false, so a signed-out visitor's 401 settles
            // at once and they still reach the empty state promptly.
            <CardSkeletons count={3} />
          ) : !uniqueLibraryCatalog.length ? (
            <div className="border-y py-12 text-center">
              <BookOpen className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">Your library is empty</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setResourceView("search")}
              >
                <Search size={14} className="mr-1.5" />
                Find resources
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {uniqueLibraryCatalog.map((resource) => (
                <LibraryCard
                  key={resource.id}
                  resource={resource}
                  onClick={() =>
                    setLocation(`/resources/${resource.id}?from=library`)
                  }
                  onCitation={() => openCitation(resource)}
                  onRemove={
                    me && resource.submittedById === me.id
                      ? () => handleRemoveCard(resource.id, resource.title)
                      : undefined
                  }
                  onAssign={
                    isTeacher
                      ? () =>
                          setAssignTarget({
                            id: resource.id,
                            title: resource.title,
                          })
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── SEARCH RESULTS ────────────────────────────────────────────── */}
      {resourceView === "search" && isSearching && (
        <>
          {/* Casparel library search results */}
          {!isSubmittedSourceMode && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-1.5">
                <BookOpen size={14} /> Casparel library, "{activeQuery}"
              </h2>
              {libraryLoading ? (
                <CardSkeletons count={3} />
              ) : uniqueLibraryResults.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No saved Casparel resources match "{activeQuery}" yet. Results
                  from the open catalog below can be saved to add them.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {uniqueLibraryResults.map((r) => (
                      <LibraryCard
                        key={r.id}
                        resource={r}
                        onClick={() => setLocation(`/resources/${r.id}`)}
                        onCitation={() => openCitation(r)}
                        onRemove={
                          me && r.submittedById === me.id
                            ? () => handleRemoveCard(r.id, r.title)
                            : undefined
                        }
                        onAssign={
                          isTeacher
                            ? () =>
                                setAssignTarget({ id: r.id, title: r.title })
                            : undefined
                        }
                      />
                    ))}
                  </div>
                  {uniqueLibraryResults.length >= libraryLimit && (
                    <div className="mt-4 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLibraryLimit((n) => n + 12)}
                      >
                        Show more results
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* Open catalog results */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-1.5">
              <Sparkles size={14} />{" "}
              {submittedSearch?.resultType ===
              DiscoverResourcesResultType.source
                ? "Sources & channels"
                : "Open education catalog"}{" "}
              , "{activeQuery}"
            </h2>

            {/* Placeholders only stand in for results that are not there yet.
                While a further page loads there are already results on screen,
                and putting a screenful of placeholders above them shoved
                everything the reader was looking at two thousand pixels down
                the page. That case is handled under the grid instead. */}
            {webLoading && !hasWebResults && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Searching the
                  education catalog…
                </p>
                <CardSkeletons />
              </div>
            )}

            {webError && !webLoading && webRateLimited && (
              <div className="py-6 text-center">
                <p className="text-sm text-amber-600 font-medium">
                  {webDailyLimited
                    ? "Your daily search limit has been reached."
                    : "Too many searches were started at once."}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {webDailyLimited ? (
                    "Your allowance resets daily."
                  ) : (
                    <>
                      Try again in {webRateLimitRetryAfter} second
                      {webRateLimitRetryAfter !== 1 ? "s" : ""}.
                    </>
                  )}
                </p>
              </div>
            )}

            {webError && !webLoading && !webRateLimited && (
              <div className="py-6 text-center">
                <p className="text-sm text-destructive-text font-medium">
                  {webAuthenticationRequired
                    ? hasWebResults
                      ? "The catalog has no more matches for this search. Sign in to use your AI discovery allowance."
                      : "The stored catalog has no matches. Sign in to use your AI discovery allowance."
                    : webCreditsExhausted
                    ? isAdmin
                      ? "Optional AI fallback is unavailable because the OpenAI project has no credits."
                      : "Optional AI fallback is temporarily unavailable."
                    : hasWebResults
                    ? "Could not load more results, please try again."
                    : "Catalog search failed, please try again."}
                </p>
                {webAuthenticationRequired ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setLocation("/auth/login")}
                  >
                    Sign in
                  </Button>
                ) : webCreditsExhausted && isAdmin ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add credits in OpenAI billing, then retry this search.
                  </p>
                ) : null}
                {!webAuthenticationRequired ? <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void retryWebSearch()}
                >
                  Retry
                </Button> : null}
              </div>
            )}

            {/* Results survive a failed later page: losing a screenful of
                catalog cards because "Search more" hit a rate limit is worse
                than the error itself. */}
            {visibleWebResults.length > 0 && (
              <>
                {!isSubmittedSourceMode && !isLoggedIn && (
                  <p className="text-xs text-muted-foreground mb-3">
                    <Link
                      href="/auth/login"
                      className="text-primary-text underline"
                    >
                      Sign in
                    </Link>{" "}
                    to save web results to your library.
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleWebResults.map((r, i) =>
                    isSubmittedSourceMode ? (
                      <SourceCard
                        key={r.url}
                        resource={r}
                        onSave={handleSaveSource}
                        saving={addingUrl === r.url}
                        onResearch={() => openResearch(r)}
                      />
                    ) : (
                      <WebCard
                        key={i}
                        resource={r}
                        onAdd={handleAddWeb}
                        adding={addingUrl === r.url}
                        onCitation={() => openCitation(r)}
                        onResearch={() => openResearch(r)}
                      />
                    ),
                  )}
                </div>
                {/* A further page loads where it will appear: under the
                    results, never above them. */}
                {webLoading ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" /> Looking for
                      more…
                    </p>
                    <CardSkeletons count={3} />
                  </div>
                ) : /* Offering "Search more" after the catalog is spent is what
                      made the button look broken: it fetched, found nothing new
                      and left the page exactly as it was. */
                webExhausted && !webError ? (
                  <p className="mt-4 text-center text-xs text-muted-foreground">
                    That is everything the open catalog has for "{activeQuery}".
                    {!isLoggedIn
                      ? " Sign in to search further with your AI discovery allowance."
                      : " Try different words, or narrow the filters."}
                  </p>
                ) : webError ? null : (
                  <div className="mt-4 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadMoreWebResults}
                    >
                      <Sparkles size={12} className="mr-1.5" /> Search more{" "}
                      {isSubmittedSourceMode ? "sources" : "resources"}
                    </Button>
                  </div>
                )}
              </>
            )}

            {!webError && !webLoading && !hasWebResults && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {allWebResultsAlreadySaved
                  ? `Every open-catalog match for "${activeQuery}" is already in your library.`
                  : `The open catalog has nothing for "${activeQuery}" yet. Try different words, clear a filter, or submit the resource yourself.`}
              </p>
            )}
          </section>

          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              className="text-muted-foreground"
            >
              <X size={13} className="mr-1.5" /> Clear search, back to library
            </Button>
          </div>
        </>
      )}

      {/* Assign to Class dialog (teacher) */}
      <Dialog
        open={!!assignTarget}
        onOpenChange={(open) => {
          if (!open) {
            setAssignTarget(null);
            setAssignClassId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Class</DialogTitle>
            <DialogDescription>
              Add <strong>{assignTarget?.title}</strong> to a class resource
              list for your students.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!classes || classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You don't have any classes yet.
              </p>
            ) : (
              <Select value={assignClassId} onValueChange={setAssignClassId}>
                <SelectTrigger data-testid="assign-class-select">
                  <SelectValue placeholder="Select a class…" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setAssignTarget(null);
                  setAssignClassId("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                disabled={!assignClassId || assignResource.isPending}
                data-testid="assign-to-class-confirm"
              >
                {assignResource.isPending ? "Assigning…" : "Assign"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
