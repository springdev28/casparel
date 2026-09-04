/**
 * @fileOverview Web UI role: provides the reusable Class Assignments component or bridge.
 * System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useIntlLocale } from "@/lib/date-locale";
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  Clipboard,
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Button } from "@workspace/edu-ds/components/ui/button";
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
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/edu-ds/components/ui/select";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { counted } from "@/lib/counted";
import { playFeedback } from "../lib/feedback";
import { toast } from "@workspace/edu-ds/hooks/use-toast";

type LinkedResource = { id: number; title: string; url: string };
type Activity = { id: number; title: string };
type Assignment = {
  id: number;
  title: string;
  instructions: string | null;
  resourceId: number | null;
  activityId: number | null;
  resourceTitle: string | null;
  resourceUrl: string | null;
  activityTitle: string | null;
  dueAt: string | null;
  completed: boolean;
};
type Analytics = {
  studentCount: number;
  assignments: Array<{
    id: number;
    title: string;
    completions: number;
    completionRate: number;
  }>;
};

/**
 * Analytics, or nothing -- decided once, here, rather than at five call sites.
 *
 * `analytics?.assignments.length` guards the wrong level: the chain stops if
 * `analytics` is null and then reads `.length` off whatever `.assignments`
 * turns out to be. Anything truthy that is not this shape -- an array, an
 * error body, an endpoint answering something else -- crashes the whole
 * assignments tab into the error boundary. It did: the class workspace was
 * unusable for a teacher and fine for a student, because only a teacher asks
 * for this.
 *
 * The same shape of bug as the resource page's `workflow?.steps[key]`, and
 * the same fix: decide at the boundary what came back, so nothing downstream
 * has to ask.
 *
 * Returning null on a bad answer is deliberate. Completion percentages are a
 * detail on a row; the assignments themselves are the page, and losing the
 * detail must not lose the page.
 */
function asAnalytics(value: unknown): Analytics | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Analytics>;
  if (!Array.isArray(candidate.assignments)) return null;
  return {
    studentCount:
      typeof candidate.studentCount === "number" ? candidate.studentCount : 0,
    assignments: candidate.assignments,
  };
}

const TOKEN_KEY = "schoolar_token";
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload as T;
}

export function ClassAssignments({
  classId,
  isTeacher,
  resources,
  initialActivityId,
  initialResourceId,
}: {
  classId: number;
  isTeacher: boolean;
  resources: LinkedResource[];
  initialActivityId?: number | null;
  initialResourceId?: number | null;
}) {
  const intlLocale = useIntlLocale();
  const [, setLocation] = useLocation();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [linkedType, setLinkedType] = useState("none");
  const [linkedId, setLinkedId] = useState("none");
  const [justCompletedId, setJustCompletedId] = useState<number | null>(null);
  const handledWorkflowHandoff = useRef(false);

  async function load() {
    try {
      const [assignmentRows, activityRows, analyticsRows, codeRows] =
        await Promise.all([
          request<Assignment[]>(`/classes/${classId}/assignments`),
          isTeacher
            ? request<Activity[]>("/study-activities")
            : Promise.resolve([]),
          isTeacher
            ? request<Analytics>(`/classes/${classId}/analytics`)
            : Promise.resolve(null),
          isTeacher
            ? request<{ joinCode: string | null }>(
                `/classes/${classId}/join-code`,
              )
            : Promise.resolve(null),
        ]);
      setAssignments(assignmentRows);
      setActivities(activityRows);
      setAnalytics(asAnalytics(analyticsRows));
      setJoinCode(codeRows?.joinCode ?? null);
    } catch (error) {
      toast({
        title: "Could not load class work",
        description:
          error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  }
  useEffect(() => {
    void load();
  }, [classId, isTeacher]);

  useEffect(() => {
    if (!isTeacher || handledWorkflowHandoff.current) return;
    if (initialActivityId) {
      const activity = activities.find((item) => item.id === initialActivityId);
      if (!activity) return;
      handledWorkflowHandoff.current = true;
      setLinkedType("activity");
      setLinkedId(String(activity.id));
      setTitle(`${activity.title} assignment`);
      setOpen(true);
      return;
    }
    if (initialResourceId) {
      const resource = resources.find((item) => item.id === initialResourceId);
      if (!resource) return;
      handledWorkflowHandoff.current = true;
      setLinkedType("resource");
      setLinkedId(String(resource.id));
      setTitle(`${resource.title} assignment`);
      setOpen(true);
    }
  }, [activities, initialActivityId, initialResourceId, isTeacher, resources]);

  const linkedOptions = linkedType === "resource" ? resources : activities;
  const dueSoon = useMemo(
    () =>
      assignments.filter(
        (assignment) =>
          !assignment.completed &&
          assignment.dueAt &&
          new Date(assignment.dueAt).getTime() - Date.now() <
            48 * 60 * 60 * 1000,
      ).length,
    [assignments],
  );

  async function createAssignment(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await request(`/classes/${classId}/assignments`, {
        method: "POST",
        body: JSON.stringify({
          title,
          instructions,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          resourceId:
            linkedType === "resource" && linkedId !== "none"
              ? Number(linkedId)
              : null,
          activityId:
            linkedType === "activity" && linkedId !== "none"
              ? Number(linkedId)
              : null,
        }),
      });
      setTitle("");
      setInstructions("");
      setDueAt("");
      setLinkedType("none");
      setLinkedId("none");
      setOpen(false);
      await load();
      toast({ title: "Assignment published" });
    } catch (error) {
      toast({
        title: "Could not create assignment",
        description:
          error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function setCompleted(assignment: Assignment, completed: boolean) {
    setJustCompletedId(null);
    try {
      await request(`/assignments/${assignment.id}/completion`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      });
      setAssignments((rows) =>
        rows.map((row) =>
          row.id === assignment.id ? { ...row, completed } : row,
        ),
      );
      if (completed) {
        playFeedback("pop");
        setJustCompletedId(assignment.id);
      }
    } catch (error) {
      toast({
        title: "Could not update assignment",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  async function deleteAssignment(id: number) {
    await request(`/classes/${classId}/assignments/${id}`, {
      method: "DELETE",
    });
    await load();
  }

  async function refreshCode() {
    const result = await request<{ joinCode: string }>(
      `/classes/${classId}/join-code`,
      { method: "POST" },
    );
    setJoinCode(result.joinCode);
  }

  function exportAnalytics() {
    if (!analytics) return;
    const rows = [
      ["Assignment", "Completions", "Students", "Completion rate"],
      ...analytics.assignments.map((item) => [
        item.title,
        item.completions,
        analytics.studentCount,
        `${item.completionRate}%`,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "class-assignment-progress.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4" data-testid="class-assignments">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarDays size={18} /> Assignments{" "}
            {dueSoon > 0 && (
              <Badge variant="destructive">
                <Bell size={12} className="mr-1" /> {dueSoon} due soon
              </Badge>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            Resources, activities, deadlines, and completion in one place.
          </p>
        </div>
        {isTeacher && (
          <div className="flex flex-wrap gap-2">
            {analytics?.assignments.length ? (
              <Button variant="outline" size="sm" onClick={exportAnalytics}>
                <Download size={14} className="mr-1.5" /> Export progress
              </Button>
            ) : null}
            {joinCode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(joinCode)}
                title="Copy class join code"
              >
                <Clipboard size={14} className="mr-1.5" aria-hidden="true" />{" "}
                {/*
                  A join code is a code. It is read out to a room and typed in
                  by thirty people, and the bridge would happily rewrite it the
                  day it matched an entry.
                */}
                <span translate="no">{joinCode}</span>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={refreshCode}>
              <RefreshCw size={14} className="mr-1.5" />{" "}
              {joinCode ? "New code" : "Create join code"}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus size={14} className="mr-1.5" /> Assign work
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign class work</DialogTitle>
                  <DialogDescription>
                    Link a library resource or one of your activities and
                    optionally add a deadline.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={createAssignment} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="assignment-title">Title</Label>
                    <Input
                      id="assignment-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="assignment-instructions">
                      Instructions
                    </Label>
                    <Textarea
                      id="assignment-instructions"
                      value={instructions}
                      onChange={(event) => setInstructions(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Link</Label>
                      <Select
                        value={linkedType}
                        onValueChange={(value) => {
                          setLinkedType(value);
                          setLinkedId("none");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No linked item</SelectItem>
                          <SelectItem value="resource">
                            Class resource
                          </SelectItem>
                          <SelectItem value="activity">
                            Study activity
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Item</Label>
                      <Select
                        value={linkedId}
                        onValueChange={setLinkedId}
                        disabled={linkedType === "none"}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Choose later</SelectItem>
                          {linkedOptions.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                              {item.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="assignment-due">Due date</Label>
                    <Input
                      id="assignment-due"
                      type="datetime-local"
                      value={dueAt}
                      onChange={(event) => setDueAt(event.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={saving || title.trim().length < 2}
                    >
                      {saving ? "Publishing…" : "Publish assignment"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
      {isTeacher && analytics && assignments.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BarChart3 size={14} aria-hidden="true" />
          {/*
            Two whole phrases, each in one text node. Written inline this was
            "{n} students ·", the number, and "% average completion" -- four
            nodes, and the bridge matches whole nodes, so none of them could
            ever be an entry. counted() and a shape rule instead.
          */}
          <span>{counted(analytics.studentCount, "student", "students")}</span>
          <span aria-hidden="true">·</span>
          <span>
            {`${Math.round(
              analytics.assignments.reduce(
                (sum, item) => sum + item.completionRate,
                0,
              ) / Math.max(analytics.assignments.length, 1),
            )}% average completion`}
          </span>
        </div>
      )}
      {assignments.length === 0 ? (
        <div className="border py-10 text-center text-sm text-muted-foreground">
          No assignments yet.
        </div>
      ) : (
        <div className="space-y-2">
          {assignments.map((assignment) => (
            <Card key={assignment.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <button
                  type="button"
                  onClick={() =>
                    !isTeacher &&
                    void setCompleted(assignment, !assignment.completed)
                  }
                  disabled={isTeacher}
                  className={`flex size-8 items-center justify-center rounded-full border ${assignment.completed ? "bg-primary text-primary-foreground" : "bg-background"}${justCompletedId === assignment.id ? " feedback-pop" : ""}`}
                  title={
                    assignment.completed ? "Mark incomplete" : "Mark complete"
                  }
                >
                  {assignment.completed && <Check size={15} />}
                </button>
                <div className="min-w-48 flex-1">
                  {/*
                    The teacher's own words, all three: what they set, what
                    they said about it, and the resource they attached. The
                    bridge would rewrite an assignment title into whichever
                    language the reader happens to be in.
                  */}
                  <p
                    translate="no"
                    className={`text-sm font-medium ${assignment.completed ? "line-through text-muted-foreground" : ""}`}
                  >
                    {assignment.title}
                  </p>
                  {assignment.instructions && (
                    <p
                      translate="no"
                      className="mt-0.5 line-clamp-1 text-xs text-muted-foreground"
                    >
                      {assignment.instructions}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {assignment.dueAt && (
                      <span>
                        Due {new Date(assignment.dueAt).toLocaleString(intlLocale)}
                      </span>
                    )}
                    {assignment.resourceTitle && (
                      <span>
                        Resource: <span translate="no">{assignment.resourceTitle}</span>
                      </span>
                    )}
                    {assignment.activityTitle && (
                      <span>
                        Activity: <span translate="no">{assignment.activityTitle}</span>
                      </span>
                    )}
                    {isTeacher && analytics && (
                      <span>
                        {`${
                          analytics.assignments.find(
                            (item) => item.id === assignment.id,
                          )?.completionRate ?? 0
                        }% complete`}
                      </span>
                    )}
                  </div>
                </div>
                {assignment.resourceId && (
                  <Button
                    size="sm"
                    variant="outline"
                    // Icon and nothing else, in a list of assignments: named
                    // after the resource it opens, or the row it belongs to,
                    // so a screen reader hears which one. The title is the
                    // teacher's own, so the label is a shape rule.
                    aria-label={`Open ${assignment.resourceTitle ?? assignment.title}`}
                    onClick={() =>
                      assignment.resourceUrl
                        ? window.open(
                            assignment.resourceUrl,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        : setLocation(`/resources/${assignment.resourceId}`)
                    }
                  >
                    <ExternalLink size={13} aria-hidden="true" />
                  </Button>
                )}
                {assignment.activityId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setLocation(
                        `/activities?activity=${assignment.activityId}`,
                      )
                    }
                  >
                    <BookOpen size={13} className="mr-1" /> Study
                  </Button>
                )}
                {isTeacher && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive-text"
                    // Named after what it deletes. This is the button that
                    // removes a piece of set work from a whole class, in a
                    // list where every row has one, and it was announced as
                    // "button".
                    aria-label={`Delete ${assignment.title}`}
                    onClick={() => void deleteAssignment(assignment.id)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
