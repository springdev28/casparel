import { useCallback, useEffect, useState } from "react";
import {
  useParams,
  useLocation,
  useSearch as useRouteSearch,
  Link,
} from "wouter";
import {
  ArrowLeft,
  ExternalLink,
  Plus,
  BookOpen,
  LogIn,
  Search,
  ShieldCheck,
  ShieldAlert,
  Shield,
  ShieldX,
  ExternalLink as LinkIcon,
  Trash2,
  GraduationCap,
  Send,
  UserRoundSearch,
  CheckCircle2,
  WandSparkles,
  ClipboardList,
} from "lucide-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import { Separator } from "@workspace/edu-ds/components/ui/separator";
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
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useDateLocale, useIntlLocale } from "@/lib/date-locale";
import {
  useGetResource,
  useListResourceReviews,
  useCreateResourceReview,
  useListResourceLists,
  useAddListItem,
  useGetMe,
  useGetResourceSourceReview,
  useDeleteResource,
  useListClasses,
  useAssignResourceToClass,
  useRecommendResourceToClass,
  getListClassResourceRecommendationsQueryKey,
  getListResourceReviewsQueryKey,
  getGetResourceQueryKey,
  getListResourcesQueryKey,
  getGetMeQueryKey,
  getListResourceListsQueryKey,
  getGetResourceSourceReviewQueryKey,
  getGetResourceRecommendationsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetClassResourcesListQueryKey,
  getListClassesQueryKey,
  UserRole,
} from "@workspace/api-client-react";
import type { SourceReview } from "@workspace/api-client-react";
import { StarRating } from "../components/StarRating";
import { metaLine } from "../lib/format-meta";
import { counted } from "@/lib/counted";
import { formatName } from "@/lib/resource-format";

// ── Media helpers ────────────────────────────────────────────────────────────

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

function getVimeoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("vimeo.com")) return null;
    // /123456789 or /video/123456789
    const m = u.pathname.match(/\/(?:video\/)?(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function getLoomId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("loom.com")) return null;
    // /share/abc123def or /embed/abc123def
    const m = u.pathname.match(/\/(?:share|embed)\/([a-zA-Z0-9]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function getGoogleDriveId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("drive.google.com")) return null;
    // https://drive.google.com/file/d/{fileId}/view  or  /preview  or  /edit
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (m) return m[1];
    // https://drive.google.com/open?id={fileId}
    const id = u.searchParams.get("id");
    return id || null;
  } catch {
    return null;
  }
}

function isPdf(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith(".pdf");
  } catch {
    return url.toLowerCase().endsWith(".pdf");
  }
}

function ResourceEmbed({ url }: { url: string }) {
  const ytId = getYouTubeId(url);
  if (ytId) {
    return (
      <div
        className="relative w-full overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio: "16/9" }}
      >
        <iframe
          src={`https://www.youtube.com/embed/${ytId}`}
          title="YouTube video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    );
  }

  const vimeoId = getVimeoId(url);
  if (vimeoId) {
    return (
      <div
        className="relative w-full overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio: "16/9" }}
      >
        <iframe
          src={`https://player.vimeo.com/video/${vimeoId}?badge=0&autopause=0`}
          title="Vimeo video player"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    );
  }

  const loomId = getLoomId(url);
  if (loomId) {
    return (
      <div
        className="relative w-full overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio: "16/9" }}
      >
        <iframe
          src={`https://www.loom.com/embed/${loomId}`}
          title="Loom video player"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    );
  }

  const driveId = getGoogleDriveId(url);
  if (driveId) {
    return (
      <div
        className="relative w-full overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio: "16/9" }}
      >
        <iframe
          src={`https://drive.google.com/file/d/${driveId}/preview`}
          title="Google Drive video player"
          allow="autoplay"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      </div>
    );
  }

  if (isPdf(url)) {
    return (
      <div
        className="w-full rounded-lg overflow-hidden border bg-muted"
        style={{ height: "520px" }}
      >
        <iframe
          src={url}
          title="PDF viewer"
          className="w-full h-full border-0"
        />
      </div>
    );
  }

  return null;
}

// ── Trust metadata ────────────────────────────────────────────────────────────

type ResourceFilterProfile = {
  provider: string | null;
  author: string | null;
  sourceDomain: string | null;
  uploadTime: string | null;
  lastEdited: string | null;
  addedToSchoolar: string;
  subject: string;
  gradeLevel: string;
  format: string;
  language: string | null;
  difficulty: string | null;
  accessType: string | null;
  license: string | null;
  duration: string | null;
  readingTime: string | null;
  captions: boolean | null;
  transcript: boolean | null;
  audience: string | null;
  keywords: string[];
  hasThumbnail: boolean;
  avgRating: number;
  reviewCount: number;
};

/**
 * How many unknown fields make the grid worth summarising instead of printing.
 * Well under the row count on purpose: a source with two or three known facts
 * is still mostly a wall of blanks to read.
 */
const FACTS_MOSTLY_UNKNOWN = 10;

function knownBoolean(value: boolean | null) {
  return value === null ? "Not available" : value ? "Yes" : "No";
}

function schoolarDate(value: string, intlLocale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(intlLocale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

const TRUST_META: Record<
  SourceReview["trustLevel"],
  { label: string; icon: typeof ShieldCheck; color: string }
> = {
  high: { label: "Highly Trusted", icon: ShieldCheck, color: "text-success-text" },
  medium: {
    label: "Generally Trusted",
    icon: Shield,
    color: "text-yellow-600",
  },
  low: {
    label: "Use with Caution",
    icon: ShieldAlert,
    color: "text-orange-500",
  },
  unknown: {
    label: "Trust Unknown",
    icon: ShieldX,
    color: "text-muted-foreground",
  },
};

function SourceReviewPanel({
  resourceId,
  isLoggedIn,
  onReviewed,
}: {
  resourceId: number;
  isLoggedIn: boolean;
  onReviewed?: () => void;
}) {
  const intlLocale = useIntlLocale();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"quick" | "deep" | null>(null);

  const {
    data: quickData,
    isLoading: quickLoading,
    isError: quickError,
    error: quickFailure,
  } = useGetResourceSourceReview(
    resourceId,
    { mode: "quick" },
    {
      query: {
        enabled: mode === "quick",
        queryKey: getGetResourceSourceReviewQueryKey(resourceId, {
          mode: "quick",
        }),
        staleTime: 1000 * 60 * 10,
      },
    },
  );
  const {
    data: deepData,
    isLoading: deepLoading,
    isError: deepError,
    error: deepFailure,
  } = useGetResourceSourceReview(
    resourceId,
    { mode: "deep" },
    {
      query: {
        enabled: mode === "deep",
        queryKey: getGetResourceSourceReviewQueryKey(resourceId, {
          mode: "deep",
        }),
        staleTime: 1000 * 60 * 10,
      },
    },
  );

  const data =
    mode === "quick" ? quickData : mode === "deep" ? deepData : undefined;

  useEffect(() => {
    if (data) onReviewed?.();
  }, [data, onReviewed]);
  const profile = data
    ? (
        data as SourceReview & {
          resourceProfile?: ResourceFilterProfile;
        }
      ).resourceProfile
    : undefined;
  const isLoading =
    mode === "quick" ? quickLoading : mode === "deep" ? deepLoading : false;
  const isError =
    mode === "quick" ? quickError : mode === "deep" ? deepError : false;
  const failure =
    mode === "quick" ? quickFailure : mode === "deep" ? deepFailure : null;
  /**
   * What actually went wrong, in the server's own words.
   *
   * This panel used to render one sentence for every failure: "Could not
   * retrieve source information. Please try again later." The server never
   * says anything so vague -- it distinguishes a deep report already running
   * ("please wait for it to finish"), a daily limit, a monthly limit, the
   * service-wide budget, and the AI provider being unreachable, and it sends
   * Retry-After with the ones that have a clock. Telling somebody whose
   * monthly allowance is spent to try again later is simply untrue, and it
   * was the same sentence a provider outage produced, so nobody could tell a
   * five-minute problem from a thirty-day one.
   */
  const failureMessage = (() => {
    const detail = (failure as { data?: { error?: string } } | null)?.data
      ?.error;
    /*
     * The server's sentence, when it is one.
     *
     * Some routes pass a Zod error straight through, and `ZodError.message` is
     * a JSON array of issue objects -- this route does exactly that for an
     * invalid resource id. Printing that at a reader is worse than any
     * fallback, so a leading bracket, a newline, or anything past a couple of
     * hundred characters means it is a serialised error rather than prose.
     */
    const readsLikeASentence =
      typeof detail === "string" &&
      detail.trim().length > 0 &&
      detail.trim().length <= 200 &&
      !/^[[{]/.test(detail.trim()) &&
      !detail.includes("\n");
    if (readsLikeASentence) return detail.trim();
    return "Could not retrieve source information. Please try again later.";
  })();
  /**
   * Deep research failing does not mean the source cannot be checked: the
   * quick check reads the maintained registry, needs no AI, costs nothing,
   * and works when the provider is down. Offering it is more useful than an
   * apology, and it is the whole feature for most readers anyway.
   */
  const canFallBackToQuick = mode === "deep" && isError;

  function handleOpen() {
    setOpen(true);
  }

  function handleModeSelect(selected: "quick" | "deep") {
    // Every plan carries a deep-research allowance — Free's is a small taste —
    // so the client no longer pre-blocks; the server answers 429 with a
    // Retry-After when the allowance is spent.
    setMode(selected);
  }

  const trust = data ? TRUST_META[data.trustLevel] : null;
  const loadingLabel =
    mode === "deep"
      ? "Searching forums, comments, reviews, and the wider web…"
      : "Looking up source and resource facts…";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          onClick={handleOpen}
          data-testid="review-source-button"
        >
          <Search size={14} className="mr-1.5" /> Review the Source
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Source Review</DialogTitle>
          <DialogDescription>
            Check maintained source provenance, or use paid AI for deeper live-web research.
          </DialogDescription>
        </DialogHeader>

        {/* Mode picker, shown when no mode has been chosen yet */}
        {mode === null && (
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Choose how thoroughly to research this source:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleModeSelect("quick")}
                data-testid="mode-quick"
                className="flex flex-col gap-1.5 rounded-lg border p-4 text-left hover:border-primary hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-sm font-semibold">Quick Overlook</span>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  Maintained source provenance and key resource facts. No AI.
                </span>
              </button>
              <button
                onClick={() => handleModeSelect("deep")}
                data-testid="mode-deep"
                disabled={!isLoggedIn}
                className="flex flex-col gap-1.5 rounded-lg border p-4 text-left hover:border-primary hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-sm font-semibold">Deep Research</span>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  AI research across forums, comments, reviews, articles, and
                  other mentions. Uses your plan's deep-research allowance.
                </span>
              </button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3 py-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="text-xs text-muted-foreground text-center pt-1">
              {loadingLabel}
            </div>
          </div>
        )}

        {isError && (
          <div className="space-y-3 py-4 text-center">
            <p className="text-sm text-destructive-text">{failureMessage}</p>
            {canFallBackToQuick && (
              <div className="space-y-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMode("quick")}
                  data-testid="fall-back-to-quick"
                >
                  Run the free source check instead
                </Button>
                <p className="text-xs text-muted-foreground">
                  Reads the maintained provenance registry. No AI, no
                  allowance.
                </p>
              </div>
            )}
          </div>
        )}

        {data && trust && (
          <div className="space-y-4 py-1">
            {/* Source identity */}
            <div>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">
                      {data.sourceName}
                    </p>
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {data.mode === "deep" ? "Deep Research" : "Quick"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">
                    {data.sourceType.replace(/-/g, " ")}
                  </p>
                </div>
                <div
                  className={`flex items-center gap-1.5 text-sm font-medium ${trust.color}`}
                >
                  <trust.icon size={16} />
                  <span>{trust.label}</span>
                </div>
              </div>
            </div>

            {/* Meta row */}
            {(data.founded || data.headquarters) && (
              <div className="flex gap-4 text-xs text-muted-foreground">
                {data.founded && <span>Founded: {data.founded}</span>}
                {data.headquarters && (
                  <span>Location: {data.headquarters}</span>
                )}
              </div>
            )}

            {profile && (() => {
            // One list, read twice: once to count what is unknown and once to
            // render. Two copies would drift and the notice would start
            // describing a grid that no longer matches it.
            const factRows: [string, string | null][] =
            [
            ["Uploaded / published", profile.uploadTime],
            ["Last edited", profile.lastEdited],
            ["Added to Casparel", schoolarDate(profile.addedToSchoolar, intlLocale)],
            ["Subject", profile.subject],
            ["Grade", profile.gradeLevel],
            ["Format", profile.format],
            ["Language", profile.language],
            ["Difficulty", profile.difficulty],
            ["Access", profile.accessType],
            ["Usage rights", profile.license],
            ["Duration", profile.duration],
            ["Reading time", profile.readingTime],
            ["Captions", knownBoolean(profile.captions)],
            ["Transcript", knownBoolean(profile.transcript)],
            ["Author / uploader", profile.author],
            ["Provider", profile.provider],
            ["Source domain", profile.sourceDomain],
            ["Audience", profile.audience],
            ["Preview image", profile.hasThumbnail ? "Yes" : "No"],
            [
            "Casparel rating",
            profile.avgRating > 0
            ? `${profile.avgRating.toFixed(1)} / 5`
            : "Not rated",
            ],
            ["Casparel reviews", String(profile.reviewCount)],
            [
            "Keywords",
            profile.keywords.length > 0
            ? profile.keywords.join(", ")
            : null,
            ],
            ["Source quality", trust.label],
            ];
            const unknownFactCount = factRows.filter(
              ([, value]) => !value || value === "Not available",
            ).length;
            return (
              <section className="border-y py-4" data-testid="resource-facts">
                <h3 className="mb-3 text-sm font-semibold">Resource facts</h3>
                {/* A quick review reads maintained provenance and never touches
                    the live web, so a source outside the catalogue genuinely
                    has nothing to show. Printing fifteen rows of "Not
                    available" states that fifteen times and reads as broken
                    software rather than an honest "we do not know this
                    source". Say it once, point at the thing that CAN answer,
                    and keep the grid available for anyone who wants to see
                    exactly which fields were checked. */}
                {unknownFactCount >= FACTS_MOSTLY_UNKNOWN ? (
                  <div className="mb-3 rounded-md border border-dashed p-3">
                    <p className="text-sm font-medium text-foreground">
                      Casparel holds no maintained details for this source
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      A quick review only reads provenance we already maintain,
                      and this source is not in the catalogue, so{" "}
                      {unknownFactCount} of {factRows.length} fields are unknown
                      rather than empty. Deep research reads the live web and
                      cites what it finds.
                    </p>
                    {mode === "quick" ? (
                      <Button
                        size="sm"
                        className="mt-3"
                        onClick={() => handleModeSelect("deep")}
                      >
                        Run deep research
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  {factRows.map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="mt-0.5 break-words text-sm text-foreground">
                        {value || "Not available"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
            })()}

            {!profile && <Separator />}

            {/* Summary */}
            <p className="text-sm text-foreground leading-relaxed">
              {data.summary}
            </p>

            {/* Trust reason */}
            {data.trustReason && (
              <p className="text-xs text-muted-foreground italic border-l-2 pl-3">
                {data.trustReason}
              </p>
            )}

            {data.mode === "deep" &&
              (data.reputationAnalysis ||
                data.audienceSentiment ||
                data.contentQuality ||
                data.currencyAssessment) && (
                <div className="space-y-4">
                  {[
                    ["Reputation and independence", data.reputationAnalysis],
                    ["Audience sentiment", data.audienceSentiment],
                    ["Educational content quality", data.contentQuality],
                    ["Currency and outdatedness", data.currencyAssessment],
                  ].map(([heading, body]) =>
                    body ? (
                      <section
                        key={heading}
                        className="rounded-lg border bg-muted/20 p-4"
                      >
                        <h3 className="mb-2 text-sm font-semibold">
                          {heading}
                        </h3>
                        <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">
                          {body}
                        </p>
                      </section>
                    ) : null,
                  )}
                </div>
              )}

            {data.mode === "deep" &&
              ((data.strengths?.length ?? 0) > 0 ||
                (data.concerns?.length ?? 0) > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <section className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <h3 className="mb-2 text-sm font-semibold text-success-text">
                      Evidence-backed strengths
                    </h3>
                    <ul className="space-y-2 text-xs leading-relaxed">
                      {data.strengths?.map((item, i) => (
                        <li key={i}>• {item}</li>
                      ))}
                    </ul>
                  </section>
                  <section className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                    <h3 className="mb-2 text-sm font-semibold text-warning-text">
                      Concerns and caveats
                    </h3>
                    <ul className="space-y-2 text-xs leading-relaxed">
                      {data.concerns?.map((item, i) => (
                        <li key={i}>• {item}</li>
                      ))}
                    </ul>
                  </section>
                </div>
              )}

            {data.mentions && data.mentions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  What others say
                </p>
                {data.mentions.map((mention, i) => (
                  <a
                    key={i}
                    href={mention.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border p-3 hover:bg-muted/50"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <Badge variant="outline" className="capitalize">
                        {mention.sourceType}
                      </Badge>
                      <span className="text-[11px] capitalize text-muted-foreground">
                        {mention.sentiment}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed">{mention.summary}</p>
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary-text">
                      <LinkIcon size={10} /> View evidence
                    </span>
                  </a>
                ))}
              </div>
            )}

            {data.mode === "deep" &&
              ((data.limitations?.length ?? 0) > 0 || data.researchScope) && (
                <section className="rounded-lg border border-dashed p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Research scope and limitations
                  </h3>
                  {data.researchScope && (
                    <p className="mb-2 text-xs leading-relaxed">
                      {data.researchScope}
                    </p>
                  )}
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {data.limitations?.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                </section>
              )}

            {/* Links */}
            {data.links && data.links.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Learn more
                </p>
                <div className="flex flex-wrap gap-2">
                  {data.links.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary-text hover:underline"
                    >
                      <LinkIcon size={11} />
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground pt-1">
              {data.mode === "deep"
                ? "This review uses live web research; open the evidence links to verify each claim."
                : "This quick review uses a brief live lookup; verify important details on the resource page."}
            </p>

            {/* Switch mode */}
            <button
              onClick={() => setMode(null)}
              className="text-xs text-primary-text hover:underline"
            >
              Switch mode
            </button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type RecommendationPerson = {
  id: number;
  name: string;
  role: string;
  avatarUrl: string | null;
  bio: string | null;
};

type ResourceWorkflow = {
  resourceId: number;
  steps: {
    reviewed: boolean;
    saved: boolean;
    activityCreated: boolean;
    classShared: boolean;
    assignmentCreated: boolean;
  };
  assignmentRequired: boolean;
  nextAction:
    | "review"
    | "save"
    | "create_activity"
    | "share_class"
    | "assign_class"
    | "complete";
  activity: { id: number; title: string } | null;
  classShare: { id: number; name: string | null } | null;
  assignment: { id: number; title: string } | null;
};

function apiUrl(path: string) {
  return import.meta.env.BASE_URL.replace(/\/$/, "") + "/api" + path;
}

async function authenticatedRequest(path: string, init?: RequestInit) {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Authorization: "Bearer " + localStorage.getItem("schoolar_token"),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Request failed");
  }
  return response.status === 204 ? null : response.json();
}

export default function ResourceDetailPage() {
  const locale = useDateLocale();
  const intlLocale = useIntlLocale();
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const routeSearch = useRouteSearch();
  const queryClient = useQueryClient();
  const resourceId = Number(id);
  const returnToResources =
    new URLSearchParams(routeSearch).get("from") === "library"
      ? "/resources?view=library"
      : "/resources";

  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState("");
  const [listNote, setListNote] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [personRecommendOpen, setPersonRecommendOpen] = useState(false);
  const [personQuery, setPersonQuery] = useState("");
  const [recommendationPeople, setRecommendationPeople] = useState<RecommendationPerson[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<number | null>(null);
  const [personRecommendNote, setPersonRecommendNote] = useState("");
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [personSending, setPersonSending] = useState(false);
  const [workflow, setWorkflow] = useState<ResourceWorkflow | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);

  const { data: resource, isLoading: resourceLoading } = useGetResource(
    resourceId,
    {
      query: {
        enabled: !!resourceId,
        queryKey: getGetResourceQueryKey(resourceId),
      },
    },
  );
  const { data: reviews, isLoading: reviewsLoading } = useListResourceReviews(
    resourceId,
    {
      query: {
        enabled: !!resourceId,
        queryKey: getListResourceReviewsQueryKey(resourceId),
      },
    },
  );
  const { data: me } = useGetMe({
    query: { retry: false, queryKey: getGetMeQueryKey() },
  });
  const { data: lists } = useListResourceLists({
    query: { enabled: !!me, queryKey: getListResourceListsQueryKey() },
  });
  const createReview = useCreateResourceReview();
  const addListItem = useAddListItem();
  const deleteResource = useDeleteResource();

  const isLoggedIn = !!me;
  const isTeacher = (me?.activeRole ?? me?.role) === UserRole.teacher;

  const loadWorkflow = useCallback(async () => {
    if (!isLoggedIn || !resourceId) return;
    setWorkflowLoading(true);
    try {
      setWorkflow(
        (await authenticatedRequest(
          `/workflow/resources/${resourceId}`,
        )) as ResourceWorkflow,
      );
    } catch {
      // The resource remains usable if analytics are temporarily unavailable.
    } finally {
      setWorkflowLoading(false);
    }
  }, [isLoggedIn, resourceId]);

  useEffect(() => {
    void loadWorkflow();
  }, [loadWorkflow]);

  // Assign to class
  const { data: classes } = useListClasses({
    query: { enabled: isLoggedIn, queryKey: getListClassesQueryKey() },
  });
  const assignResource = useAssignResourceToClass();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignClassId, setAssignClassId] = useState("");
  const [recommendDialogOpen, setRecommendDialogOpen] = useState(false);
  const [recommendClassId, setRecommendClassId] = useState("");
  const [recommendNote, setRecommendNote] = useState("");
  const recommendResource = useRecommendResourceToClass();

  async function handleAssign() {
    if (!assignClassId) return;
    try {
      await assignResource.mutateAsync({
        id: Number(assignClassId),
        data: { resourceId },
      });
      queryClient.invalidateQueries({
        queryKey: getGetClassResourcesListQueryKey(Number(assignClassId)),
      });
      toast({
        title: "Assigned!",
        description: "Resource added to class resource list.",
      });
      setAssignDialogOpen(false);
      setAssignClassId("");
    } catch {
      toast({
        title: "Error",
        description: "Could not assign the resource.",
        variant: "destructive",
      });
    }
  }

  async function handleRecommend() {
    if (!recommendClassId) return;
    try {
      await recommendResource.mutateAsync({ id: Number(recommendClassId), data: { resourceId, note: recommendNote.trim() || undefined } });
      queryClient.invalidateQueries({ queryKey: getListClassResourceRecommendationsQueryKey(Number(recommendClassId)) });
      toast({ title: "Recommendation sent", description: "Your teacher was notified and can approve it." });
      setRecommendDialogOpen(false);
      setRecommendClassId("");
      setRecommendNote("");
    } catch (err: unknown) {
      toast({ title: "Could not recommend resource", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    }
  }

  async function searchRecommendationPeople() {
    const query = personQuery.trim();
    if (!query) {
      setRecommendationPeople([]);
      setSelectedRecipientId(null);
      return;
    }

    setPeopleLoading(true);
    try {
      const params = new URLSearchParams({
        scope: "all",
        q: query,
        limit: "30",
      });
      const people = (await authenticatedRequest("/users/search?" + params.toString())) as RecommendationPerson[];
      setRecommendationPeople(people);
      if (selectedRecipientId && !people.some((person) => person.id === selectedRecipientId)) {
        setSelectedRecipientId(null);
      }
    } catch (error) {
      toast({
        title: "Could not load people",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPeopleLoading(false);
    }
  }

  async function handleRecommendToPerson() {
    if (!selectedRecipientId) return;
    setPersonSending(true);
    try {
      await authenticatedRequest("/resources/" + resourceId + "/recommend", {
        method: "POST",
        body: JSON.stringify({
          recipientId: selectedRecipientId,
          note: personRecommendNote.trim() || undefined,
        }),
      });
      const recipient = recommendationPeople.find((person) => person.id === selectedRecipientId);
      toast({
        title: "Recommendation sent",
        description: recipient ? recipient.name + " was notified." : "The user was notified.",
      });
      setPersonRecommendOpen(false);
      setSelectedRecipientId(null);
      setPersonRecommendNote("");
      setPersonQuery("");
    } catch (error) {
      toast({
        title: "Could not send recommendation",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPersonSending(false);
    }
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reviewRating === 0) {
      toast({
        title: "Select a rating",
        description: "Please choose 1–5 stars.",
        variant: "destructive",
      });
      return;
    }
    try {
      await createReview.mutateAsync({
        id: resourceId,
        data: { rating: reviewRating, comment: reviewComment || undefined },
      });
      queryClient.invalidateQueries({
        queryKey: getListResourceReviewsQueryKey(resourceId),
      });
      queryClient.invalidateQueries({
        queryKey: getGetResourceQueryKey(resourceId),
      });
      queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      toast({ title: "Review submitted!" });
      setReviewRating(0);
      setReviewComment("");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to submit review";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  }

  async function handleDelete() {
    try {
      await deleteResource.mutateAsync({ id: resourceId });
      queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetResourceRecommendationsQueryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: getGetDashboardSummaryQueryKey(),
      });
      toast({ title: "Resource removed from library." });
      setLocation(returnToResources);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to remove resource";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  }

  async function handleAddToList(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedListId) return;
    try {
      await addListItem.mutateAsync({
        id: Number(selectedListId),
        data: { resourceId, note: listNote || undefined },
      });
      toast({ title: "Added to list!" });
      await loadWorkflow();
      setAddToListOpen(false);
      setSelectedListId("");
      setListNote("");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to add to list";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  }

  if (resourceLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-40" />
        <Card>
          <CardHeader>
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-5 w-1/3 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-64">
        <BookOpen size={40} className="text-muted-foreground mb-3" />
        <p className="text-foreground font-semibold">Resource not found</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => setLocation(returnToResources)}
        >
          Back to Resources
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:space-y-6 sm:p-6">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocation(returnToResources)}
        data-testid="back-button"
      >
        <ArrowLeft size={16} className="mr-1.5" /> Resources
      </Button>

      {/* Resource Info */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <CardTitle translate="no" className="text-xl">{resource.title}</CardTitle>
              <CardDescription translate="no" className="mt-1">
                {metaLine(resource.subject, resource.gradeLevel)}
              </CardDescription>
            </div>
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {formatName(resource.format)}
              </Badge>

              {/* Review the Source */}
              <SourceReviewPanel
                resourceId={resourceId}
                isLoggedIn={!!me}
                onReviewed={loadWorkflow}
              />

              {/* Add to List, auth-gated */}
              {isLoggedIn ? (
                <Dialog open={addToListOpen} onOpenChange={setAddToListOpen}>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="add-to-list-button"
                    >
                      <Plus size={14} className="mr-1" /> Add to List
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add to a List</DialogTitle>
                      <DialogDescription>
                        Choose which list to add this resource to
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddToList} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="list-select">List</Label>
                        {lists && lists.length > 0 ? (
                          <Select
                            value={selectedListId}
                            onValueChange={setSelectedListId}
                          >
                            <SelectTrigger
                              id="list-select"
                              data-testid="list-select"
                            >
                              <SelectValue placeholder="Select a list…" />
                            </SelectTrigger>
                            <SelectContent>
                              {lists.map((l) => (
                                <SelectItem key={l.id} value={String(l.id)}>
                                  {l.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No lists yet. Create one first.
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="list-note">Note (optional)</Label>
                        <Textarea
                          id="list-note"
                          value={listNote}
                          onChange={(e) => setListNote(e.target.value)}
                          rows={2}
                          data-testid="list-note-input"
                        />
                      </div>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setAddToListOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={!selectedListId || addListItem.isPending}
                          data-testid="add-to-list-confirm"
                        >
                          {addListItem.isPending ? "Adding…" : "Add to List"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  data-testid="sign-in-to-save"
                >
                  <Link href="/auth/login">
                    <Plus size={14} className="mr-1" /> Save to List
                  </Link>
                </Button>
              )}

              {/* Assign to Class, teachers only */}
              {isLoggedIn && isTeacher && (
                <Dialog
                  open={assignDialogOpen}
                  onOpenChange={setAssignDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="assign-to-class-button"
                    >
                      <GraduationCap size={14} className="mr-1" /> Assign to
                      Class
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Assign to Class</DialogTitle>
                      <DialogDescription>
                        Add this resource to a class resource list for your
                        students.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Class</Label>
                        {!classes || classes.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No classes found. Create a class first.
                          </p>
                        ) : (
                          <Select
                            value={assignClassId}
                            onValueChange={setAssignClassId}
                          >
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
                      </div>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setAssignDialogOpen(false)}
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
              )}

              {isLoggedIn && Boolean(classes?.length) && (
                <Dialog open={recommendDialogOpen} onOpenChange={setRecommendDialogOpen}>
                  <DialogTrigger asChild><Button size="sm" variant="outline" data-testid="recommend-to-class-button"><GraduationCap size={14} className="mr-1" /> Recommend to Class</Button></DialogTrigger>
                  <DialogContent><DialogHeader><DialogTitle>Recommend to Class</DialogTitle><DialogDescription>Your teacher must approve this suggestion before it appears in class resources.</DialogDescription></DialogHeader>
                    <div className="space-y-4"><div className="space-y-1.5"><Label>Class</Label><Select value={recommendClassId} onValueChange={setRecommendClassId}><SelectTrigger><SelectValue placeholder="Select a class…" /></SelectTrigger><SelectContent>{classes?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Why do you recommend it? (optional)</Label><Textarea value={recommendNote} onChange={(event) => setRecommendNote(event.target.value)} maxLength={500} /></div></div>
                    <DialogFooter><Button variant="outline" onClick={() => setRecommendDialogOpen(false)}>Cancel</Button><Button onClick={handleRecommend} disabled={!recommendClassId || recommendResource.isPending}>{recommendResource.isPending ? "Sending…" : "Send Recommendation"}</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {isLoggedIn && (
                <Dialog
                  open={personRecommendOpen}
                  onOpenChange={setPersonRecommendOpen}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" data-testid="recommend-to-person-button">
                      <Send size={14} className="mr-1" /> Recommend to Person
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Recommend to a person</DialogTitle>
                      <DialogDescription>
                        Send this resource to any discoverable Casparel account. Students, teachers, and administrators can all recommend resources.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <form
                        className="flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void searchRecommendationPeople();
                        }}
                      >
                        <Input
                          value={personQuery}
                          onChange={(event) => setPersonQuery(event.target.value)}
                          placeholder="Search by name or subject..."
                          aria-label="Search recommendation recipients"
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          disabled={peopleLoading || !personQuery.trim()}
                        >
                          <UserRoundSearch className="size-4" />
                          <span className="sr-only">Search</span>
                        </Button>
                      </form>
                      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                        {peopleLoading ? (
                          <p className="p-3 text-sm text-muted-foreground">Loading people...</p>
                        ) : recommendationPeople.length ? (
                          recommendationPeople.map((person) => (
                            <button
                              key={person.id}
                              type="button"
                              onClick={() => setSelectedRecipientId(person.id)}
                              className={"flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors " + (selectedRecipientId === person.id ? "bg-accent text-accent-foreground" : "hover:bg-muted")}
                            >
                              <span><b>{person.name}</b><span className="ml-2 text-xs capitalize text-muted-foreground">{person.role}</span></span>
                              {selectedRecipientId === person.id && <span className="text-xs font-medium">Selected</span>}
                            </button>
                          ))
                        ) : (
                          <p className="p-3 text-sm text-muted-foreground">No matching accounts.</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="person-recommend-note">Message (optional)</Label>
                        <Textarea
                          id="person-recommend-note"
                          value={personRecommendNote}
                          onChange={(event) => setPersonRecommendNote(event.target.value)}
                          maxLength={500}
                          placeholder="Why this resource may be useful..."
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setPersonRecommendOpen(false)}>Cancel</Button>
                      <Button onClick={handleRecommendToPerson} disabled={!selectedRecipientId || personSending}>
                        {personSending ? "Sending..." : "Send recommendation"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {/* Remove from library, only for submitter */}
              {isLoggedIn && me?.id === resource.submittedById && (
                <Dialog
                  open={deleteConfirmOpen}
                  onOpenChange={setDeleteConfirmOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive-text hover:text-destructive-text"
                      data-testid="remove-resource-button"
                    >
                      <Trash2 size={14} className="mr-1" /> Remove
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Remove this resource?</DialogTitle>
                      <DialogDescription>
                        This will permanently delete "{resource.title}" and all
                        its reviews. This cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setDeleteConfirmOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={deleteResource.isPending}
                        data-testid="confirm-remove-button"
                      >
                        {deleteResource.isPending ? "Removing…" : "Remove"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              <Button size="sm" asChild>
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="open-resource-link"
                >
                  <ExternalLink size={14} className="mr-1" /> Open
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Inline embed for YouTube and PDF resources */}
          <ResourceEmbed url={resource.url} />

          {resource.description && (
            <p translate="no" className="text-sm text-muted-foreground">
              {resource.description}
            </p>
          )}
          <div className="flex items-center gap-3">
            <StarRating value={resource.avgRating} />
            <span className="text-sm text-muted-foreground">
              {resource.avgRating.toFixed(1)} ·{" "}
              {counted(resource.reviewCount, "review", "reviews")}
            </span>
          </div>
        </CardContent>
      </Card>

      {isLoggedIn ? (
        <Card className="overflow-hidden border-primary/30" data-testid="resource-workflow">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <WandSparkles className="size-4 text-primary-text" /> Turn this source into learning
                </CardTitle>
                <CardDescription className="mt-1">
                  Verify it, organize it, build an activity, then put it into use.
                </CardDescription>
              </div>
              {workflow?.nextAction === "complete" ? (
                <Badge className="bg-emerald-600">Workflow complete</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {workflowLoading && !workflow ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className={workflow?.assignmentRequired ? "grid grid-cols-2 gap-2 sm:grid-cols-5" : "grid grid-cols-2 gap-2 sm:grid-cols-4"}>
                {[
                  ["reviewed", "1", "Verify source"],
                  ["saved", "2", "Save to list"],
                  ["activityCreated", "3", "Create activity"],
                  ["classShared", "4", "Share to class"],
                  ...(workflow?.assignmentRequired
                    ? [["assignmentCreated", "5", "Create assignment"]]
                    : []),
                ].map(([key, number, label]) => {
                  // `?.steps?.[…]`, both of them. The outer chain guards
                  // a missing workflow and the inner one guards a workflow
                  // that arrived without its steps -- and only the second
                  // kind took the page down, which is the opposite of what
                  // loadWorkflow's catch promises ("the resource remains
                  // usable if analytics are temporarily unavailable").
                  const complete = Boolean(
                    workflow?.steps?.[key as keyof ResourceWorkflow["steps"]],
                  );
                  return (
                    <div
                      key={key}
                      className={
                        "flex items-center gap-2 rounded-md border p-3 text-sm " +
                        (complete ? "border-emerald-500/40 bg-emerald-500/10" : "bg-muted/30")
                      }
                    >
                      {complete ? (
                        <CheckCircle2 className="size-4 shrink-0 text-success-text" />
                      ) : (
                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px]">
                          {number}
                        </span>
                      )}
                      <span className={complete ? "font-medium" : "text-muted-foreground"}>{label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-sm text-muted-foreground">
                {workflow?.nextAction === "review"
                  ? "Start with the free source check."
                  : workflow?.nextAction === "save"
                    ? "Keep the verified resource in a focused list."
                    : workflow?.nextAction === "create_activity"
                      ? "Use this source as the foundation for a study activity."
                      : workflow?.nextAction === "share_class"
                        ? `Your activity${workflow.activity?.title ? ` “${workflow.activity.title}”` : ""} is ready to share.`
                        : workflow?.nextAction === "assign_class"
                          ? `Shared${workflow?.classShare?.name ? ` with ${workflow.classShare.name}` : " with a class"}. Add instructions and a deadline next.`
                          : workflow?.assignment?.title
                            ? `Assigned as “${workflow.assignment.title}”.`
                            : `Shared${workflow?.classShare?.name ? ` with ${workflow.classShare.name}` : " with a class"}.`}
              </p>
              {workflow?.nextAction === "review" ? (
                <Button
                  size="sm"
                  onClick={() =>
                    (document.querySelector('[data-testid="review-source-button"]') as HTMLButtonElement | null)?.click()
                  }
                >
                  <Search className="mr-2 size-4" /> Verify source
                </Button>
              ) : workflow?.nextAction === "save" ? (
                lists?.length ? (
                  <Button size="sm" onClick={() => setAddToListOpen(true)}>
                    <Plus className="mr-2 size-4" /> Save to a list
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setLocation("/lists")}>
                    <Plus className="mr-2 size-4" /> Create a list
                  </Button>
                )
              ) : workflow?.nextAction === "create_activity" ? (
                <Button size="sm" onClick={() => setLocation(`/activities?fromResource=${resourceId}`)}>
                  <WandSparkles className="mr-2 size-4" /> Create activity
                </Button>
              ) : workflow?.nextAction === "share_class" && workflow.activity ? (
                <Button
                  size="sm"
                  onClick={() =>
                    setLocation(
                      `/activities?continueResource=${resourceId}&activity=${workflow.activity!.id}`,
                    )
                  }
                >
                  <GraduationCap className="mr-2 size-4" /> Share activity
                </Button>
              ) : workflow?.nextAction === "assign_class" && workflow.activity && workflow.classShare ? (
                <Button
                  size="sm"
                  onClick={() =>
                    setLocation(
                      `/classes/${workflow.classShare!.id}?tab=assignments&resource=${resourceId}&activity=${workflow.activity!.id}`,
                    )
                  }
                >
                  <ClipboardList className="mr-2 size-4" /> Create assignment
                </Button>
              ) : workflow?.activity ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLocation(`/activities?continueResource=${resourceId}&activity=${workflow.activity!.id}`)}
                >
                  Open activity
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Reviews */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Reviews</h2>

        {/* Write a Review, auth-gated */}
        {isLoggedIn ? (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Write a Review</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleReviewSubmit} className="space-y-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Your rating</Label>
                  <StarRating
                    value={reviewRating}
                    onChange={setReviewRating}
                    data-testid="review-rating"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="review-comment" className="text-xs">
                    Comment (optional)
                  </Label>
                  <Textarea
                    id="review-comment"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Share your thoughts…"
                    rows={2}
                    data-testid="review-comment-input"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={createReview.isPending}
                  data-testid="submit-review-button"
                >
                  {createReview.isPending ? "Submitting…" : "Submit Review"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-4 border-dashed">
            <CardContent className="py-5 flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Sign in to write a review and help others find great resources.
              </p>
              <Button size="sm" asChild data-testid="sign-in-to-review">
                <Link href="/auth/login">
                  <LogIn size={14} className="mr-1.5" /> Sign in
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Review List */}
        {reviewsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="py-3">
                  <div className="flex gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-12 w-full mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !reviews || reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No reviews yet. Be the first!
          </p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <Card key={review.id} data-testid="review-item">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {review.user.name}
                      </span>
                      <StarRating value={review.rating} size="sm" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(review.createdAt), {
                        addSuffix: true,
                        locale,
                      })}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="text-sm text-muted-foreground">
                      {review.comment}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
      <Separator />
    </div>
  );
}
