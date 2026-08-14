import { useState, useMemo, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  Trash2,
  Clock,
  X,
  BookOpen,
  List,
  Users,
  ExternalLink,
  Video,
  Check,
  XCircle,
  ChevronDown,
  Download,
} from "lucide-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { Card, CardContent } from "@workspace/edu-ds/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/edu-ds/components/ui/dialog";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format, addDays, startOfWeek, isSameDay, parseISO } from "date-fns";
import {
  useListScheduleBlocks,
  useCreateScheduleBlock,
  useDeleteScheduleBlock,
  useGetResource,
  useListResources,
  useListResourceLists,
  useListStudySessions,
  useCreateStudySession,
  useRsvpStudySession,
  useDeleteStudySession,
  useSearchUsers,
  useGetMe,
  getListResourcesQueryKey,
  getListScheduleBlocksQueryKey,
  getListStudySessionsQueryKey,
  getGetCalendarStatusQueryKey,
} from "@workspace/api-client-react";

/** Download a .ics file for a schedule block using the authenticated API */
async function downloadBlockIcs(blockId: number): Promise<void> {
  const token = localStorage.getItem("schoolar_token");
  const resp = await fetch(`/api/schedule/${blockId}/export.ics`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) return;
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `block-${blockId}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download a .ics file for a study session using the authenticated API */
async function downloadSessionIcs(sessionId: number): Promise<void> {
  const token = localStorage.getItem("schoolar_token");
  const resp = await fetch(`/api/study-sessions/${sessionId}/export.ics`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) return;
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `session-${sessionId}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Build a Google Calendar quick-add URL for a study session */
function buildGoogleCalUrl(session: {
  title: string;
  startsAt: string;
  durationMinutes: number;
  meetingUrl: string;
  topic?: string | null;
}): string {
  const start = new Date(session.startsAt);
  const end = new Date(start.getTime() + session.durationMinutes * 60 * 1000);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(".000", "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: session.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    location: session.meetingUrl,
    details: session.topic ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
import type { StudySessionWithParticipants } from "@workspace/api-client-react";
import { Link, useSearch as useRouteSearch } from "wouter";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BLOCK_COLORS = [
  "bg-blue-100 border-l-4 border-blue-500 text-blue-900",
  "bg-teal-100 border-l-4 border-teal-500 text-teal-900",
  "bg-purple-100 border-l-4 border-purple-500 text-purple-900",
  "bg-amber-100 border-l-4 border-amber-500 text-amber-900",
  "bg-emerald-100 border-l-4 border-emerald-500 text-emerald-900",
];

function getColor(id: number) {
  return BLOCK_COLORS[id % BLOCK_COLORS.length];
}

/** Detect meeting platform from URL */
function detectPlatform(url: string): { label: string; color: string } | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("meet.google"))
      return { label: "Google Meet", color: "text-green-700" };
    if (host.includes("zoom.us"))
      return { label: "Zoom", color: "text-blue-700" };
    if (host.includes("teams.microsoft"))
      return { label: "Teams", color: "text-purple-700" };
    return null;
  } catch {
    return null;
  }
}

/** Small badge shown on a block card when a resource is attached */
function ResourceBadge({ resourceId }: { resourceId: number }) {
  const { data: resource } = useGetResource(resourceId);
  if (!resource) return null;
  return (
    <Link
      to={`/resources/${resourceId}`}
      onClick={(e) => e.stopPropagation()}
      className="mt-1 flex items-center gap-1 text-[10px] underline underline-offset-2 opacity-80 hover:opacity-100 truncate"
      data-testid="block-resource-link"
    >
      {resource.thumbnailUrl ? (
        <img
          src={resource.thumbnailUrl}
          alt=""
          className="w-3 h-3 rounded-sm object-cover shrink-0"
        />
      ) : (
        <BookOpen size={10} className="shrink-0" />
      )}
      <span className="truncate">{resource.title}</span>
    </Link>
  );
}

/** Small badge shown on a block card when a reading list is attached */
function ListBadge({ listId }: { listId: number }) {
  const { data: lists } = useListResourceLists();
  const list = lists?.find((l) => l.id === listId);
  if (!list) return null;
  return (
    <Link
      to={`/lists/${listId}`}
      onClick={(e) => e.stopPropagation()}
      className="mt-1 flex items-center gap-1 text-[10px] underline underline-offset-2 opacity-80 hover:opacity-100 truncate"
      data-testid="block-list-link"
    >
      <List size={10} className="shrink-0" />
      <span className="truncate">{list.name}</span>
    </Link>
  );
}

/** Reading list picker used inside the Add Block dialog */
function ListPicker({
  selected,
  onSelect,
}: {
  selected: { id: number; name: string } | null;
  onSelect: (l: { id: number; name: string } | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: lists } = useListResourceLists();
  const filtered =
    lists?.filter(
      (l) =>
        query.length === 0 ||
        l.name.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      )
        setOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted text-sm">
        <List size={14} className="text-muted-foreground shrink-0" />
        <span className="flex-1 truncate">{selected.name}</span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Remove reading list"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder="Search reading lists…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        data-testid="list-search-input"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
          {filtered.map((l) => (
            <button
              key={l.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({ id: l.id, name: l.name });
                setQuery("");
                setOpen(false);
              }}
              data-testid="list-search-result"
            >
              <List size={14} className="text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{l.name}</span>
              {l.itemCount != null && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {l.itemCount} items
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}
      {open && query && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
          No reading lists found
        </div>
      )}
    </div>
  );
}

/** Resource search + picker used inside the Add Block and Study Session dialogs */
function ResourcePicker({
  selected,
  onSelect,
}: {
  selected: { id: number; title: string } | null;
  onSelect: (r: { id: number; title: string } | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const resourceSearchParams = { q: debouncedQuery || undefined, limit: 6 };
  const { data: results } = useListResources(resourceSearchParams, {
    query: {
      enabled: debouncedQuery.length >= 1 && open,
      queryKey: getListResourcesQueryKey(resourceSearchParams),
    },
  });

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      )
        setOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted text-sm">
        <BookOpen size={14} className="text-muted-foreground shrink-0" />
        <span className="flex-1 truncate">{selected.title}</span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Remove resource"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder="Search resources…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        data-testid="resource-search-input"
      />
      {open && results && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({ id: r.id, title: r.title });
                setQuery("");
                setOpen(false);
              }}
              data-testid="resource-search-result"
            >
              {r.thumbnailUrl ? (
                <img
                  src={r.thumbnailUrl}
                  alt=""
                  className="w-6 h-6 rounded-sm object-cover shrink-0"
                />
              ) : (
                <BookOpen
                  size={14}
                  className="text-muted-foreground shrink-0"
                />
              )}
              <span className="truncate flex-1">{r.title}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {r.format}
              </Badge>
            </button>
          ))}
        </div>
      )}
      {open && debouncedQuery && (!results || results.length === 0) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
          No resources found
        </div>
      )}
    </div>
  );
}

/** Invitee picker, searches users who share a class with the requester */
function InviteePicker({
  selected,
  onAdd,
  onRemove,
}: {
  selected: { id: number; name: string }[];
  onAdd: (u: { id: number; name: string }) => void;
  onRemove: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const searchParams = { q: debouncedQuery || undefined, scope: "all" as const };
  const { data: results } = useSearchUsers(searchParams, {
    query: {
      enabled: debouncedQuery.length >= 1 && open,
      queryKey: ["searchUsers", searchParams] as const,
    },
  });

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      )
        setOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const selectedIds = new Set(selected.map((u) => u.id));

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-1"
            >
              {u.name}
              <button
                type="button"
                onClick={() => onRemove(u.id)}
                aria-label={`Remove ${u.name}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div ref={containerRef} className="relative">
        <Input
          placeholder="Search classmates or people to invite…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          data-testid="invitee-search-input"
        />
        {open && results && results.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
            {results
              .filter((r) => !selectedIds.has(r.id))
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onAdd({ id: r.id, name: r.name ?? String(r.id) });
                    setQuery("");
                    setOpen(false);
                  }}
                  data-testid="invitee-search-result"
                >
                  {r.avatarUrl ? (
                    <img
                      src={r.avatarUrl}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Users size={12} className="text-muted-foreground" />
                    </div>
                  )}
                  <span className="truncate flex-1">{r.name}</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] shrink-0 capitalize"
                  >
                    {r.role}
                  </Badge>
                </button>
              ))}
          </div>
        )}
        {open &&
          debouncedQuery &&
          (!results ||
            results.filter((r) => !selectedIds.has(r.id)).length === 0) && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
              No people found
            </div>
          )}
      </div>
    </div>
  );
}

/** Detail panel for a study session */
function StudySessionDetail({
  session,
  currentUserId,
  onClose,
}: {
  session: StudySessionWithParticipants;
  currentUserId?: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const rsvp = useRsvpStudySession();
  const deleteSession = useDeleteStudySession();
  const isOrganiser = session.organizerId === currentUserId;
  const platform = detectPlatform(session.meetingUrl);

  const startsAt = new Date(session.startsAt);
  const endsAt = new Date(
    startsAt.getTime() + session.durationMinutes * 60 * 1000,
  );

  async function handleRsvp(status: "accepted" | "declined") {
    try {
      await rsvp.mutateAsync({ id: session.id, data: { status } });
      queryClient.invalidateQueries({
        queryKey: getListStudySessionsQueryKey(),
      });
      toast({
        title: status === "accepted" ? "Session accepted!" : "Session declined",
      });
    } catch {
      toast({
        title: "Error",
        description: "Could not update RSVP",
        variant: "destructive",
      });
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel this study session? All invitees will lose access."))
      return;
    try {
      await deleteSession.mutateAsync({ id: session.id });
      queryClient.invalidateQueries({
        queryKey: getListStudySessionsQueryKey(),
      });
      toast({ title: "Session cancelled" });
      onClose();
    } catch {
      toast({
        title: "Error",
        description: "Could not cancel session",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* Meeting link */}
      <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
        <a
          href={session.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <Video size={14} />
          {platform ? platform.label : "Join Meeting"}
          <ExternalLink size={12} />
        </a>
        <p className="text-xs text-muted-foreground truncate">
          {session.meetingUrl}
        </p>
      </div>

      {/* Time */}
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Clock size={14} />
        <span>
          {format(startsAt, "EEE, MMM d · h:mm a")} – {format(endsAt, "h:mm a")}{" "}
          ({session.durationMinutes} min)
        </span>
      </div>

      {/* Topic */}
      {session.topic && (
        <p className="text-sm text-foreground">{session.topic}</p>
      )}

      {/* Resource */}
      {session.resourceId != null && (
        <div className="text-sm">
          <ResourceBadge resourceId={session.resourceId} />
        </div>
      )}

      {/* Participants */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Participants
        </p>
        <div className="space-y-1.5">
          {session.participants.map((p) => (
            <div key={p.userId} className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                {p.avatarUrl ? (
                  <img
                    src={p.avatarUrl}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <Users size={12} className="text-muted-foreground" />
                )}
              </div>
              <span className="text-sm flex-1 truncate">
                {p.name ?? `User ${p.userId}`}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] capitalize ${
                  p.status === "accepted"
                    ? "border-green-500 text-green-700"
                    : p.status === "declined"
                      ? "border-red-400 text-red-600"
                      : "text-muted-foreground"
                }`}
              >
                {p.status}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <Button asChild size="sm" className="gap-1.5">
          <a
            href={session.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Video size={14} /> Join
          </a>
        </Button>

        {!isOrganiser && session.myStatus === "pending" && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-green-500 text-green-700 hover:bg-green-50"
              onClick={() => handleRsvp("accepted")}
              disabled={rsvp.isPending}
            >
              <Check size={14} /> Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-red-400 text-red-600 hover:bg-red-50"
              onClick={() => handleRsvp("declined")}
              disabled={rsvp.isPending}
            >
              <XCircle size={14} /> Decline
            </Button>
          </>
        )}

        {!isOrganiser && session.myStatus === "accepted" && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-muted-foreground"
            onClick={() => handleRsvp("declined")}
            disabled={rsvp.isPending}
          >
            <XCircle size={14} /> Decline
          </Button>
        )}

        {/* Export to Calendar */}
        <div className="relative group">
          <Button size="sm" variant="outline" className="gap-1.5">
            <Calendar size={14} /> Export <ChevronDown size={12} />
          </Button>
          <div className="hidden group-hover:flex absolute right-0 top-full mt-1 z-50 min-w-max flex-col rounded-md border bg-popover shadow-md text-sm overflow-hidden">
            <a
              href={buildGoogleCalUrl(session)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 hover:bg-accent"
            >
              <ExternalLink size={13} /> Add to Google Calendar
            </a>
            <button
              type="button"
              onClick={() => downloadSessionIcs(session.id)}
              className="flex items-center gap-2 px-3 py-2 hover:bg-accent text-left"
            >
              <Download size={13} /> Download .ics
            </button>
          </div>
        </div>

        {isOrganiser && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 ml-auto"
            onClick={handleCancel}
            disabled={deleteSession.isPending}
          >
            <Trash2 size={14} /> Cancel session
          </Button>
        )}
      </div>
    </div>
  );
}

/** Study session block rendered in the weekly grid */
function StudySessionBlock({
  session,
  onClick,
}: {
  session: StudySessionWithParticipants;
  onClick: () => void;
}) {
  const startsAt = new Date(session.startsAt);
  const endsAt = new Date(
    startsAt.getTime() + session.durationMinutes * 60 * 1000,
  );
  const isPending = session.myStatus === "pending";

  return (
    <button
      onClick={onClick}
      className={`w-full rounded p-1.5 text-xs text-left transition-opacity hover:opacity-90 ${
        isPending
          ? "bg-violet-50 border-l-4 border-violet-400 border border-violet-200 text-violet-900"
          : "bg-violet-100 border-l-4 border-violet-500 border text-violet-900"
      }`}
      data-testid="study-session-block"
    >
      <div className="flex items-center gap-1 mb-0.5">
        <Users size={9} className="shrink-0 opacity-70" />
        <span className="font-semibold truncate flex-1">{session.title}</span>
      </div>
      <div className="flex items-center gap-0.5 opacity-80">
        <Clock size={10} />
        <span>
          {format(startsAt, "h:mm a")}–{format(endsAt, "h:mm a")}
        </span>
      </div>
      {isPending && (
        <Badge
          variant="outline"
          className="mt-0.5 text-[9px] border-violet-400 text-violet-700 px-1"
        >
          Pending
        </Badge>
      )}
    </button>
  );
}

/** New Study Session creation dialog */
function NewStudySessionDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("14:00");
  const [duration, setDuration] = useState(60);
  const [topic, setTopic] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [selectedResource, setSelectedResource] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [invitees, setInvitees] = useState<{ id: number; name: string }[]>([]);
  const createSession = useCreateStudySession();
  const queryClient = useQueryClient();

  function reset() {
    setTitle("");
    setDate("");
    setStartTime("14:00");
    setDuration(60);
    setTopic("");
    setMeetingUrl("");
    setSelectedResource(null);
    setInvitees([]);
  }

  const platform = meetingUrl ? detectPlatform(meetingUrl) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !title || !meetingUrl) return;

    const startsAt = new Date(`${date}T${startTime}:00`).toISOString();
    try {
      await createSession.mutateAsync({
        data: {
          title,
          startsAt,
          durationMinutes: duration,
          topic: topic || undefined,
          resourceId: selectedResource?.id ?? undefined,
          meetingUrl,
          inviteeIds: invitees.map((u) => u.id),
        },
      });
      queryClient.invalidateQueries({
        queryKey: getListStudySessionsQueryKey(),
      });
      toast({
        title: "Study session created!",
        description: `"${title}" is scheduled.`,
      });
      reset();
      setOpen(false);
      onCreated();
    } catch {
      toast({
        title: "Error",
        description: "Failed to create study session",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="new-study-session-button">
          <Users size={16} className="mr-1.5" /> New Study Session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Study Session</DialogTitle>
          <DialogDescription>
            Schedule a collaborative session with classmates or people you follow
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ss-title">Title</Label>
            <Input
              id="ss-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. Calculus review"
              data-testid="ss-title-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ss-date">Date</Label>
              <Input
                id="ss-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                data-testid="ss-date-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ss-time">Start time</Label>
              <Input
                id="ss-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                data-testid="ss-time-input"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ss-duration">Duration (minutes)</Label>
            <Input
              id="ss-duration"
              type="number"
              min={5}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              required
              data-testid="ss-duration-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ss-meeting-url">
              Meeting link{" "}
              <span className="text-muted-foreground font-normal text-xs">
                (Google Meet, Zoom, Teams, or any URL)
              </span>
            </Label>
            <div className="relative">
              <Input
                id="ss-meeting-url"
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                required
                placeholder="https://meet.google.com/…"
                data-testid="ss-meeting-url-input"
              />
              {platform && (
                <span
                  className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium ${platform.color}`}
                >
                  {platform.label}
                </span>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ss-topic">
              Topic{" "}
              <span className="text-muted-foreground font-normal text-xs">
                (optional)
              </span>
            </Label>
            <Textarea
              id="ss-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={2}
              placeholder="What will you study?"
              data-testid="ss-topic-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Resource{" "}
              <span className="text-muted-foreground font-normal text-xs">
                (optional)
              </span>
            </Label>
            <ResourcePicker
              selected={selectedResource}
              onSelect={setSelectedResource}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Invite people{" "}
              <span className="text-muted-foreground font-normal text-xs">
                (optional)
              </span>
            </Label>
            <InviteePicker
              selected={invitees}
              onAdd={(u) => setInvitees((prev) => [...prev, u])}
              onRemove={(id) =>
                setInvitees((prev) => prev.filter((u) => u.id !== id))
              }
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createSession.isPending}
              data-testid="ss-create-confirm"
            >
              {createSession.isPending ? "Creating…" : "Create Session"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pending invitations banner */
function PendingInvitationsBanner({
  sessions,
  onOpen,
}: {
  sessions: StudySessionWithParticipants[];
  onOpen: (s: StudySessionWithParticipants) => void;
}) {
  const queryClient = useQueryClient();
  const rsvp = useRsvpStudySession();
  const [expanded, setExpanded] = useState(true);
  const pending = sessions.filter((s) => s.myStatus === "pending");
  if (pending.length === 0) return null;

  async function handleRsvp(
    sessionId: number,
    status: "accepted" | "declined",
  ) {
    try {
      await rsvp.mutateAsync({ id: sessionId, data: { status } });
      queryClient.invalidateQueries({
        queryKey: getListStudySessionsQueryKey(),
      });
    } catch {
      toast({
        title: "Error",
        description: "Could not update RSVP",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 space-y-3">
      <button
        type="button"
        className="flex w-full items-center justify-between"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Users size={16} className="text-violet-600" />
          <span className="font-semibold text-sm text-violet-900">
            {pending.length} pending study session
            {pending.length > 1 ? "s" : ""}
          </span>
        </div>
        <ChevronDown
          size={16}
          className={`text-violet-600 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="space-y-2">
          {pending.map((s) => {
            const startsAt = new Date(s.startsAt);
            return (
              <div key={s.id} className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => onOpen(s)}
                  className="flex-1 text-left min-w-0"
                >
                  <p className="text-sm font-medium text-violet-900 truncate">
                    {s.title}
                  </p>
                  <p className="text-xs text-violet-700">
                    {format(startsAt, "EEE, MMM d · h:mm a")}
                  </p>
                </button>
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    className="h-7 px-2.5 text-xs gap-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handleRsvp(s.id, "accepted")}
                    disabled={rsvp.isPending}
                  >
                    <Check size={12} /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => handleRsvp(s.id, "declined")}
                    disabled={rsvp.isPending}
                  >
                    <XCircle size={12} /> Decline
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SchedulePage() {
  const routeSearch = useRouteSearch();
  const queryClient = useQueryClient();
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("10:00");
  const [newNotes, setNewNotes] = useState("");
  const [selectedResource, setSelectedResource] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [selectedList, setSelectedList] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [selectedSession, setSelectedSession] =
    useState<StudySessionWithParticipants | null>(null);

  useEffect(() => {
    const goal = new URLSearchParams(routeSearch).get("goal");
    if (goal) {
      setNewTitle("Study: " + goal);
      setNewNotes("Learning goal: " + goal);
      setDialogOpen(true);
    }
  }, [routeSearch]);

  const weekStartStr = format(currentWeekStart, "yyyy-MM-dd");

  const { data: me } = useGetMe();
  const { data: blocks, isLoading } = useListScheduleBlocks({
    weekStart: weekStartStr,
  });
  const { data: studySessions } = useListStudySessions();
  const createBlock = useCreateScheduleBlock();
  const deleteBlock = useDeleteScheduleBlock();

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)),
    [currentWeekStart],
  );

  function prevWeek() {
    setCurrentWeekStart((d) => addDays(d, -7));
  }
  function nextWeek() {
    setCurrentWeekStart((d) => addDays(d, 7));
  }

  function resetForm() {
    setNewTitle("");
    setNewDate("");
    setNewStart("09:00");
    setNewEnd("10:00");
    setNewNotes("");
    setSelectedResource(null);
    setSelectedList(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createBlock.mutateAsync({
        data: {
          title: newTitle,
          date: newDate,
          startTime: newStart,
          endTime: newEnd,
          notes: newNotes || undefined,
          resourceId: selectedResource?.id ?? undefined,
          listId: selectedList?.id ?? undefined,
        },
      });
      queryClient.invalidateQueries({
        queryKey: getListScheduleBlocksQueryKey({ weekStart: weekStartStr }),
      });
      toast({
        title: "Block added!",
        description: `"${newTitle}" has been scheduled.`,
      });
      resetForm();
      setDialogOpen(false);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to create block",
        variant: "destructive",
      });
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteBlock.mutateAsync({ id });
      queryClient.invalidateQueries({
        queryKey: getListScheduleBlocksQueryKey({ weekStart: weekStartStr }),
      });
      toast({ title: "Block deleted" });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to delete block",
        variant: "destructive",
      });
    }
  }

  const blocksForDay = (day: Date) => {
    if (!blocks) return [];
    return blocks.filter((b) => {
      try {
        return isSameDay(parseISO(b.date), day);
      } catch {
        return false;
      }
    });
  };

  const studySessionsForDay = (day: Date) => {
    if (!studySessions) return [];
    return studySessions.filter((s) => {
      try {
        const sessionDate = new Date(s.startsAt);
        return isSameDay(sessionDate, day);
      } catch {
        return false;
      }
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Schedule</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your weekly study plan
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NewStudySessionDialog onCreated={() => {}} />
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button data-testid="add-block-button">
                <Plus size={16} className="mr-1.5" /> Add Block
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Schedule Block</DialogTitle>
                <DialogDescription>
                  Block out time for studying, classes, or assignments
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="block-title">Title</Label>
                  <Input
                    id="block-title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                    placeholder="e.g. Math Study Session"
                    data-testid="block-title-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="block-date">Date</Label>
                  <Input
                    id="block-date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                    data-testid="block-date-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="block-start">Start time</Label>
                    <Input
                      id="block-start"
                      type="time"
                      value={newStart}
                      onChange={(e) => setNewStart(e.target.value)}
                      required
                      data-testid="block-start-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="block-end">End time</Label>
                    <Input
                      id="block-end"
                      type="time"
                      value={newEnd}
                      onChange={(e) => setNewEnd(e.target.value)}
                      required
                      data-testid="block-end-input"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="block-notes">Notes (optional)</Label>
                  <Textarea
                    id="block-notes"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    rows={2}
                    data-testid="block-notes-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Resource (optional)</Label>
                  <ResourcePicker
                    selected={selectedResource}
                    onSelect={setSelectedResource}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Reading list (optional)</Label>
                  <ListPicker
                    selected={selectedList}
                    onSelect={setSelectedList}
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
                    disabled={createBlock.isPending}
                    data-testid="add-block-confirm"
                  >
                    {createBlock.isPending ? "Adding…" : "Add Block"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Pending invitations */}
      {studySessions && studySessions.length > 0 && (
        <PendingInvitationsBanner
          sessions={studySessions}
          onOpen={setSelectedSession}
        />
      )}

      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={prevWeek}
          data-testid="prev-week-button"
        >
          <ChevronLeft size={16} />
        </Button>
        <span className="text-sm font-medium text-foreground">
          {format(currentWeekStart, "MMM d")} –{" "}
          {format(addDays(currentWeekStart, 6), "MMM d, yyyy")}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={nextWeek}
          data-testid="next-week-button"
        >
          <ChevronRight size={16} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
          }
          data-testid="today-button"
        >
          Today
        </Button>
      </div>

      {/* Weekly Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-2 rounded-xl border bg-card/90 p-3 text-card-foreground shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/80 md:grid-cols-7 [&_.text-muted-foreground]:text-card-foreground/70">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 rounded-xl border bg-card/90 p-3 text-card-foreground shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/80 md:grid-cols-7 [&_.text-muted-foreground]:text-card-foreground/70">
          {weekDays.map((day, i) => {
            const dayBlocks = blocksForDay(day);
            const daySessions = studySessionsForDay(day);
            const isToday = isSameDay(day, new Date());
            return (
              <div key={i} className="min-h-32">
                <div
                  className={`text-center py-1.5 rounded-t-md text-sm font-medium mb-1 ${
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <div className="font-semibold">{DAY_LABELS[i]}</div>
                  <div className="text-xs">{format(day, "MMM d")}</div>
                </div>
                <div className="space-y-1.5 min-h-24">
                  {dayBlocks.length === 0 && daySessions.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-3">
                      , 
                    </div>
                  ) : (
                    <>
                      {dayBlocks.map((block) => (
                        <div
                          key={block.id}
                          className={`rounded p-1.5 text-xs ${getColor(block.id)}`}
                          data-testid="schedule-block"
                        >
                          <div className="font-semibold truncate">
                            {block.title}
                          </div>
                          <div className="flex items-center gap-0.5 mt-0.5 opacity-80">
                            <Clock size={10} />
                            <span>
                              {block.startTime.slice(0, 5)}–
                              {block.endTime.slice(0, 5)}
                            </span>
                          </div>
                          {block.notes && (
                            <p className="mt-0.5 opacity-75 truncate">
                              {block.notes}
                            </p>
                          )}
                          {block.resourceId != null && (
                            <ResourceBadge resourceId={block.resourceId} />
                          )}
                          {block.listId != null && (
                            <ListBadge listId={block.listId} />
                          )}
                          <div className="flex items-center gap-1.5 mt-1">
                            <button
                              onClick={() => handleDelete(block.id)}
                              className="opacity-60 hover:opacity-100 transition-opacity"
                              data-testid="delete-block-button"
                              aria-label="Delete block"
                            >
                              <Trash2 size={11} />
                            </button>
                            <button
                              onClick={() => downloadBlockIcs(block.id)}
                              className="opacity-60 hover:opacity-100 transition-opacity"
                              aria-label="Download .ics"
                              title="Export to Calendar"
                            >
                              <Download size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {daySessions.map((session) => (
                        <StudySessionBlock
                          key={`ss-${session.id}`}
                          session={session}
                          onClick={() => setSelectedSession(session)}
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Session detail panel */}
      {selectedSession && (
        <Dialog
          open={!!selectedSession}
          onOpenChange={(o) => {
            if (!o) setSelectedSession(null);
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users size={18} className="text-violet-600" />
                {selectedSession.title}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="text-[10px] border-violet-400 text-violet-700"
                >
                  Collaborative
                </Badge>
              </DialogDescription>
            </DialogHeader>
            <StudySessionDetail
              session={selectedSession}
              currentUserId={me?.id}
              onClose={() => setSelectedSession(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Upcoming blocks list (mobile fallback / extra context) */}
      {!isLoading && blocks && blocks.length > 0 && (
        <div className="md:hidden space-y-2">
          <h2 className="font-semibold text-foreground text-sm">
            This week&apos;s blocks
          </h2>
          {blocks.map((block) => (
            <Card key={block.id} data-testid="schedule-block-mobile">
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{block.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {block.date} · {block.startTime.slice(0, 5)}–
                    {block.endTime.slice(0, 5)}
                  </p>
                  {block.resourceId != null && (
                    <ResourceBadge resourceId={block.resourceId} />
                  )}
                  {block.listId != null && <ListBadge listId={block.listId} />}
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {format(parseISO(block.date), "EEE")}
                </Badge>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-primary h-8 w-8 p-0"
                    onClick={() => downloadBlockIcs(block.id)}
                    title="Export to Calendar"
                  >
                    <Download size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                    onClick={() => handleDelete(block.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Study sessions mobile list */}
      {studySessions && studySessions.length > 0 && (
        <div className="md:hidden space-y-2">
          <h2 className="font-semibold text-foreground text-sm flex items-center gap-1.5">
            <Users size={14} className="text-violet-600" /> Study Sessions
          </h2>
          {studySessions.map((session) => {
            const startsAt = new Date(session.startsAt);
            return (
              <Card
                key={session.id}
                className="cursor-pointer hover:border-violet-400 transition-colors"
                onClick={() => setSelectedSession(session)}
              >
                <CardContent className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {session.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(startsAt, "EEE, MMM d · h:mm a")} ·{" "}
                      {session.durationMinutes} min
                    </p>
                  </div>
                  {session.myStatus === "pending" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-violet-400 text-violet-700 shrink-0"
                    >
                      Pending
                    </Badge>
                  )}
                  {session.myStatus === "accepted" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-green-500 text-green-700 shrink-0"
                    >
                      Accepted
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
