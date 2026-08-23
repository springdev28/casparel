/**
 * @fileOverview Web UI role: provides the reusable Class Assignments component or bridge.
 * System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  Clipboard,
  Download,
  ExternalLink,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useLocation } from "wouter";
import {
  createClassAssignment,
  deleteClassAssignment,
  getClassAssignmentAnalytics,
  listClassAssignments,
  listStudyActivities,
  updateAssignmentCompletion,
  type ClassAssignment,
  type ClassAssignmentAnalytics,
  type StudyActivity,
} from "@workspace/api-client-react";
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
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { classJoinUrl } from "../lib/class-join-link";
import { LoadFailure } from "./LoadFailure";

type LinkedResource = { id: number; title: string; url: string };
type Activity = Pick<StudyActivity, "id" | "title">;

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
  const [, setLocation] = useLocation();
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [analytics, setAnalytics] = useState<ClassAssignmentAnalytics | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [linkedType, setLinkedType] = useState("none");
  const [linkedId, setLinkedId] = useState("none");
  const handledWorkflowHandoff = useRef(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      // Load the primary collection first. If a teacher-only supporting read
      // fails afterwards, the assignments remain usable under a warning.
      const assignmentRows = await listClassAssignments(classId);
      setAssignments(assignmentRows);
      const [activityRows, analyticsRows, codeRows] = await Promise.all([
        isTeacher ? listStudyActivities() : Promise.resolve([]),
        isTeacher ? getClassAssignmentAnalytics(classId) : Promise.resolve(null),
        isTeacher
          ? request<{ joinCode: string | null }>(`/classes/${classId}/join-code`)
          : Promise.resolve(null),
      ]);
      setActivities(activityRows);
      setAnalytics(analyticsRows);
      setJoinCode(codeRows?.joinCode ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Please try again");
    } finally {
      setLoading(false);
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
      await createClassAssignment(classId, {
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

  async function setCompleted(assignment: ClassAssignment, completed: boolean) {
    await updateAssignmentCompletion(assignment.id, { completed });
    setAssignments((rows) =>
      rows.map((row) =>
        row.id === assignment.id ? { ...row, completed } : row,
      ),
    );
  }

  async function deleteAssignment(id: number) {
    await deleteClassAssignment(classId, id);
    await load();
  }

  async function refreshCode() {
    const result = await request<{ joinCode: string }>(
      `/classes/${classId}/join-code`,
      { method: "POST" },
    );
    setJoinCode(result.joinCode);
  }

  async function copyJoinValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({
        title: `Could not copy ${label.toLowerCase()}`,
        description: "Copy it manually and try again.",
        variant: "destructive",
      });
    }
  }

  function copyInviteLink() {
    if (!joinCode) return;
    const url = classJoinUrl(
      window.location.origin,
      import.meta.env.BASE_URL,
      joinCode,
    );
    if (url) void copyJoinValue(url, "Invite link");
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
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyJoinValue(joinCode, "Join code")}
                  title="Copy class join code"
                  data-testid="class-join-code"
                >
                  <Clipboard size={14} className="mr-1.5" /> {joinCode}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyInviteLink}
                  title="Copy a sign-in-safe class invite link"
                  data-testid="copy-class-join-link"
                >
                  <Link2 size={14} className="mr-1.5" /> Copy invite link
                </Button>
              </>
            ) : null}
            <Button variant="outline" size="sm" onClick={refreshCode} data-testid="create-join-code-button">
              <RefreshCw size={14} className="mr-1.5" />{" "}
              {joinCode ? "New code" : "Create join code"}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="assign-work-button">
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
                      data-testid="assignment-title-input"
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
                      data-testid="assignment-instructions-input"
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
                        <SelectTrigger data-testid="assignment-link-type">
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
                        <SelectTrigger data-testid="assignment-linked-item">
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
                      data-testid="publish-assignment-button"
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
          <BarChart3 size={14} /> {analytics.studentCount} students ·{" "}
          {Math.round(
            analytics.assignments.reduce(
              (sum, item) => sum + item.completionRate,
              0,
            ) / Math.max(analytics.assignments.length, 1),
          )}
          % average completion
        </div>
      )}
      {loadError && assignments.length > 0 ? (
        <LoadFailure
          variant="banner"
          title="Some class-work details could not be refreshed"
          description={loadError}
          onRetry={() => void load()}
          retrying={loading}
        />
      ) : null}
      {loading && assignments.length === 0 ? (
        <div className="border py-10 text-center text-sm text-muted-foreground">
          Loading assignments…
        </div>
      ) : loadError && assignments.length === 0 ? (
        <LoadFailure
          title="Assignments could not be loaded"
          description={loadError}
          onRetry={() => void load()}
          retrying={loading}
          testId="class-assignments-load-error"
        />
      ) : assignments.length === 0 ? (
        <div className="border py-10 text-center text-sm text-muted-foreground">
          No assignments yet.
        </div>
      ) : (
        <div className="space-y-2">
          {assignments.map((assignment) => (
            <Card key={assignment.id} data-testid="assignment-card">
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <button
                  type="button"
                  onClick={() =>
                    !isTeacher &&
                    void setCompleted(assignment, !assignment.completed)
                  }
                  disabled={isTeacher}
                  className={`flex size-8 items-center justify-center rounded-full border ${assignment.completed ? "bg-primary text-primary-foreground" : "bg-background"}`}
                  title={
                    assignment.completed ? "Mark incomplete" : "Mark complete"
                  }
                  data-testid="assignment-completion-toggle"
                >
                  {assignment.completed && <Check size={15} />}
                </button>
                <div className="min-w-48 flex-1">
                  <p
                    className={`text-sm font-medium ${assignment.completed ? "line-through text-muted-foreground" : ""}`}
                  >
                    {assignment.title}
                  </p>
                  {assignment.instructions && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {assignment.instructions}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {assignment.dueAt && (
                      <span>
                        Due {new Date(assignment.dueAt).toLocaleString()}
                      </span>
                    )}
                    {assignment.resourceTitle && (
                      <span>Resource: {assignment.resourceTitle}</span>
                    )}
                    {assignment.activityTitle && (
                      <span>Activity: {assignment.activityTitle}</span>
                    )}
                    {isTeacher && analytics && (
                      <span>
                        {analytics.assignments.find(
                          (item) => item.id === assignment.id,
                        )?.completionRate ?? 0}
                        % complete
                      </span>
                    )}
                  </div>
                </div>
                {assignment.resourceId && (
                  <Button
                    size="sm"
                    variant="outline"
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
                    <ExternalLink size={13} />
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
                    onClick={() => void deleteAssignment(assignment.id)}
                  >
                    <Trash2 size={14} />
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
