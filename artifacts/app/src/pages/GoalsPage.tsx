import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarPlus,
  Check,
  CheckCircle2,
  Copy,
  Pause,
  Pencil,
  LayoutDashboard,
  Download,
  Plus,
  Share2,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
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
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/edu-ds/components/ui/select";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { authedRequest } from "../lib/api-request";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { cn } from "@workspace/edu-ds/lib/utils";
import {
  getListLearningGoalsQueryKey,
  getListResourcesQueryKey,
  LearningGoalInputLevel,
  LearningGoalStatus,
  UserRole,
  useCreateLearningGoal,
  useDeleteLearningGoal,
  useGetMe,
  useListLearningGoals,
  useListResources,
  useUpdateLearningGoal,
  useListClasses,
  useListClassStudentGoals,
  useUpdateClassStudentGoal,
  getListClassesQueryKey,
  getListClassStudentGoalsQueryKey,
  type StudentLearningGoal,
  type LearningGoal,
} from "@workspace/api-client-react";

import { getDashboardGoalId, setDashboardGoalId } from "../lib/dashboardGoal";
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from "../lib/user-preferences";

type CommunityPath = {
  id: number;
  creatorId: number;
  creatorName: string;
  sourceGoalId: number;
  title: string;
  subject: string;
  description: string | null;
  level: string;
  pathSteps: Array<{
    id: string;
    title: string;
    query: string;
    completed: boolean;
  }>;
  useCount: number;
  createdAt: string;
};

function escapeStudyPackHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

export default function GoalsPage() {
  const client = useQueryClient();
  const { data: me } = useGetMe();
  const workspaceRole = me?.activeRole ?? me?.role;
  const { data: accountPreferences } = useUserPreferences(Boolean(me));
  const updateAccountPreferences = useUpdateUserPreferences();
  const [dashboardGoalId, setDashboardGoal] = useState<number | null>(null);
  const isTeacher = workspaceRole === UserRole.teacher;
  const { data: classes } = useListClasses({ query: { enabled: isTeacher, queryKey: getListClassesQueryKey() } });
  const teacherClasses = (classes ?? []).filter((item) => item.teacherId === me?.id);
  const [managedClassId, setManagedClassId] = useState(0);
  useEffect(() => { if (!managedClassId && teacherClasses[0]) setManagedClassId(teacherClasses[0].id); }, [managedClassId, teacherClasses]);
  const { data: studentGoals, isLoading: studentGoalsLoading } = useListClassStudentGoals(managedClassId, { query: { enabled: isTeacher && managedClassId > 0, queryKey: getListClassStudentGoalsQueryKey(managedClassId) } });
  const updateStudentGoal = useUpdateClassStudentGoal();
  async function manageStudentGoal(goalId: number, data: { status?: LearningGoalStatus; targetDate?: string | null }) {
    await updateStudentGoal.mutateAsync({ id: managedClassId, goalId, data });
    await client.invalidateQueries({ queryKey: getListClassStudentGoalsQueryKey(managedClassId) });
    toast({ title: "Student goal updated" });
  }
  useEffect(() => {
    const localGoal = getDashboardGoalId(me?.id, workspaceRole);
    const savedForRole = workspaceRole
      ? accountPreferences?.dashboardGoalIds[workspaceRole]
      : undefined;
    setDashboardGoal(savedForRole ?? localGoal);
    if (accountPreferences && workspaceRole && !savedForRole && localGoal)
      updateAccountPreferences.mutate({
        dashboardGoalIds: {
          ...accountPreferences.dashboardGoalIds,
          [workspaceRole]: localGoal,
        },
      });
  }, [accountPreferences, me?.id, workspaceRole]);
  const { data: goals, isLoading } = useListLearningGoals({
    query: { queryKey: getListLearningGoalsQueryKey() },
  });
  const [communityPaths, setCommunityPaths] = useState<CommunityPath[]>([]);
  const [communityPathsLoading, setCommunityPathsLoading] = useState(false);
  const [sharingGoalId, setSharingGoalId] = useState<number | null>(null);
  const [cloningPathId, setCloningPathId] = useState<number | null>(null);
  const libraryParams = { limit: 50, offset: 0 };
  const { data: libraryResources } = useListResources(libraryParams, {
    query: {
      enabled: Boolean(me?.id),
      queryKey: getListResourcesQueryKey(libraryParams),
    },
  });
  const createGoal = useCreateLearningGoal();
  const updateGoal = useUpdateLearningGoal();
  const deleteGoal = useDeleteLearningGoal();
  const [open, setOpen] = useState(false);

  async function refreshCommunityPaths() {
    if (!me?.id) return;
    setCommunityPathsLoading(true);
    try {
      setCommunityPaths(
        await authedRequest<CommunityPath[]>("/learning-goal-templates"),
      );
    } catch (error) {
      toast({
        title: "Could not load community paths",
        description:
          error instanceof Error ? error.message : "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setCommunityPathsLoading(false);
    }
  }

  useEffect(() => {
    if (me?.id) void refreshCommunityPaths();
  }, [me?.id]);
  /**
   * The community grid is other people's paths.
   *
   * The endpoint returns every shared path including your own, and the grid
   * used to render all of them. So an account that shared its three goals then
   * saw those three goals again below, under a heading that says "shared by
   * students and teachers", credited to itself, with a button offering to add
   * a copy -- which does exactly that, silently producing a second identical
   * goal in the same account.
   *
   * The full list is still what the share button reads, because "have I
   * already shared this goal" is a question about your own paths and that
   * button's label is the only confirmation a share ever worked.
   */
  const sharedByOthers = communityPaths.filter(
    (path) => path.creatorId !== me?.id,
  );
  const hasSharedOwnPath = communityPaths.some(
    (path) => path.creatorId === me?.id,
  );
  const [newStepTitles, setNewStepTitles] = useState<Record<number, string>>({});
  const [form, setForm] = useState({
    title: "",
    subject: "",
    description: "",
    level: LearningGoalInputLevel.beginner,
    targetDate: "",
  });
  const [editingGoal, setEditingGoal] = useState<LearningGoal | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    subject: string;
    description: string;
    level: LearningGoalInputLevel;
    targetDate: string;
  }>({
    title: "",
    subject: "",
    description: "",
    level: LearningGoalInputLevel.beginner,
    targetDate: "",
  });
  async function refresh() {
    await client.invalidateQueries({
      queryKey: getListLearningGoalsQueryKey(),
    });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await createGoal.mutateAsync({
        data: {
          title: form.title.trim(),
          subject: form.subject.trim(),
          description: form.description.trim() || null,
          level: form.level,
          targetDate: form.targetDate || null,
          preferredFormats: [],
        },
      });
      await refresh();
      setOpen(false);
      setForm({
        title: "",
        subject: "",
        description: "",
        level: LearningGoalInputLevel.beginner,
        targetDate: "",
      });
      toast({
        title: "Learning goal created",
        description: "Your checklist is ready.",
      });
    } catch (error) {
      toast({
        title: "Could not create goal",
        description:
          error instanceof Error
            ? error.message
            : "Please check the form and try again.",
        variant: "destructive",
      });
    }
  }
  function startEditing(goal: LearningGoal) {
    setEditingGoal(goal);
    setEditForm({
      title: goal.title,
      subject: goal.subject,
      description: goal.description ?? "",
      level: goal.level as LearningGoalInputLevel,
      targetDate: goal.targetDate ?? "",
    });
  }

  async function submitEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingGoal) return;
    try {
      await patch(editingGoal.id, {
        title: editForm.title.trim(),
        subject: editForm.subject.trim(),
        description: editForm.description.trim() || null,
        level: editForm.level,
        targetDate: editForm.targetDate || null,
      });
      setEditingGoal(null);
      toast({ title: "Learning goal updated" });
    } catch (error) {
      toast({
        title: "Could not update goal",
        description: error instanceof Error ? error.message : "Please check the form and try again.",
        variant: "destructive",
      });
    }
  }

  async function patch(
    id: number,
    data: Parameters<typeof updateGoal.mutateAsync>[0]["data"],
  ) {
    await updateGoal.mutateAsync({ id, data });
    await refresh();
  }
  async function toggleStep(goal: LearningGoal, stepId: string) {
    await patch(goal.id, {
      pathSteps: goal.pathSteps.map((step) =>
        step.id === stepId ? { ...step, completed: !step.completed } : step,
      ),
    });
  }
  async function renameStep(goal: LearningGoal, stepId: string, title: string) {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    await patch(goal.id, { pathSteps: goal.pathSteps.map((step) => step.id === stepId ? { ...step, title: cleanTitle, query: cleanTitle } : step) });
  }
  async function addStep(goal: LearningGoal) {
    const title = newStepTitles[goal.id]?.trim();
    if (!title) return;
    await patch(goal.id, { pathSteps: [...goal.pathSteps, { id: crypto.randomUUID(), title, query: title, completed: false }] });
    setNewStepTitles((current) => ({ ...current, [goal.id]: "" }));
  }
  async function deleteStep(goal: LearningGoal, stepId: string) {
    await patch(goal.id, { pathSteps: goal.pathSteps.filter((step) => step.id !== stepId) });
  }
  async function moveStep(goal: LearningGoal, index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= goal.pathSteps.length) return;
    const pathSteps = [...goal.pathSteps];
    [pathSteps[index], pathSteps[target]] = [pathSteps[target], pathSteps[index]];
    await patch(goal.id, { pathSteps });
  }
  async function remove(id: number) {
    if (!confirm("Delete this learning goal?")) return;
    await deleteGoal.mutateAsync({ id });
    await refresh();
  }

  async function shareGoalPath(goal: LearningGoal) {
    setSharingGoalId(goal.id);
    try {
      await authedRequest("/learning-goal-templates", {
        method: "POST",
        body: JSON.stringify({ goalId: goal.id }),
      });
      await refreshCommunityPaths();
      toast({
        title: "Community path shared",
        description: "Other learners can now clone this checklist.",
      });
    } catch (error) {
      toast({
        title: "Could not share path",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSharingGoalId(null);
    }
  }

  async function cloneCommunityPath(path: CommunityPath) {
    setCloningPathId(path.id);
    try {
      await authedRequest(`/learning-goal-templates/${path.id}/clone`, {
        method: "POST",
      });
      await Promise.all([refresh(), refreshCommunityPaths()]);
      toast({
        title: "Path added to your goals",
        description: `You can now personalize “${path.title}”.`,
      });
    } catch (error) {
      toast({
        title: "Could not use community path",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCloningPathId(null);
    }
  }

  function downloadStudyPack(goal: LearningGoal) {
    const selectedIds = (() => {
      if (!me?.id) return [] as number[];
      try {
        const parsed = JSON.parse(
          localStorage.getItem(
            `schoolar_continue_studying:${me.id}:${goal.id}`,
          ) ?? "[]",
        ) as unknown;
        return Array.isArray(parsed)
          ? parsed.filter((id): id is number => Number.isInteger(id))
          : [];
      } catch {
        return [] as number[];
      }
    })();
    const resources = selectedIds
      .map((id) => libraryResources?.find((resource) => resource.id === id))
      .filter(
        (resource): resource is NonNullable<typeof resource> =>
          resource !== undefined,
      );
    const steps = goal.pathSteps
      .map(
        (step) =>
          `<li><span class="box">${step.completed ? "✓" : ""}</span> ${escapeStudyPackHtml(step.title)}</li>`,
      )
      .join("");
    const resourceLinks = resources.length
      ? resources
          .map(
            (resource) =>
              `<li><a href="${escapeStudyPackHtml(resource.url)}">${escapeStudyPackHtml(resource.title)}</a><small>${escapeStudyPackHtml(resource.subject)} · ${escapeStudyPackHtml(resource.format)}</small></li>`,
          )
          .join("")
      : "<li>No library resources selected yet.</li>";
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeStudyPackHtml(goal.title)} study pack</title><style>body{font:16px system-ui;max-width:760px;margin:40px auto;padding:0 20px;color:#172033}h1{color:#006f7a}section{margin:28px 0}li{margin:12px 0}.box{display:inline-flex;width:20px;height:20px;border:2px solid #0b8793;align-items:center;justify-content:center}a{color:#006f7a;font-weight:600}small{display:block;color:#596273;margin-left:28px}@media print{body{margin:0}}</style></head><body><p>Casparel offline study pack</p><h1>${escapeStudyPackHtml(goal.title)}</h1><p><strong>${escapeStudyPackHtml(goal.subject)}</strong> · ${escapeStudyPackHtml(goal.level)}</p>${goal.description ? `<p>${escapeStudyPackHtml(goal.description)}</p>` : ""}<section><h2>Learning path</h2><ol>${steps}</ol></section><section><h2>Selected resources</h2><ul>${resourceLinks}</ul></section><p><small>Generated from Casparel. Links require an internet connection; the learning path remains available offline.</small></p></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      goal.title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") +
      "-study-pack.html";
    anchor.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Offline study pack downloaded",
      description: `${goal.pathSteps.length} steps and ${resources.length} selected resources included.`,
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Target className="size-6 text-primary-text" />
            Learning goals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each goal builds a path you can complete, or undo, one step at a time.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" />
              New goal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a learning goal</DialogTitle>
              <DialogDescription>
                Be specific about the outcome you want, not just the subject.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="goal-title">Outcome</Label>
                <Input
                  id="goal-title"
                  value={form.title}
                  onChange={(e) =>
                    setForm((old) => ({ ...old, title: e.target.value }))
                  }
                  placeholder="Understand quadratic equations"
                  minLength={2}
                  maxLength={160}
                  required
                />
              </div>
              <div>
                <Label htmlFor="goal-subject">Subject</Label>
                <Input
                  id="goal-subject"
                  value={form.subject}
                  onChange={(e) =>
                    setForm((old) => ({ ...old, subject: e.target.value }))
                  }
                  placeholder="Mathematics"
                  required
                />
              </div>
              <div>
                <Label>Current level</Label>
                <Select
                  value={form.level}
                  onValueChange={(level) =>
                    setForm((old) => ({
                      ...old,
                      level: level as typeof form.level,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={LearningGoalInputLevel.beginner}>
                      Beginner
                    </SelectItem>
                    <SelectItem value={LearningGoalInputLevel.intermediate}>
                      Intermediate
                    </SelectItem>
                    <SelectItem value={LearningGoalInputLevel.advanced}>
                      Advanced
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="goal-date">
                  Target date{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="goal-date"
                  type="date"
                  value={form.targetDate}
                  onChange={(e) =>
                    setForm((old) => ({ ...old, targetDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="goal-description">
                  Context{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="goal-description"
                  value={form.description}
                  onChange={(e) =>
                    setForm((old) => ({ ...old, description: e.target.value }))
                  }
                  placeholder="What success looks like, what you already know, or what is difficult…"
                  maxLength={1000}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createGoal.isPending}>
                  {createGoal.isPending ? "Creating…" : "Create goal"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={Boolean(editingGoal)} onOpenChange={(next) => { if (!next) setEditingGoal(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit learning goal</DialogTitle>
            <DialogDescription>Update the outcome, subject, level, date, or context.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <div>
              <Label htmlFor="edit-goal-title">Outcome</Label>
              <Input id="edit-goal-title" value={editForm.title} onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))} minLength={2} maxLength={160} required />
            </div>
            <div>
              <Label htmlFor="edit-goal-subject">Subject</Label>
              <Input id="edit-goal-subject" value={editForm.subject} onChange={(event) => setEditForm((current) => ({ ...current, subject: event.target.value }))} required />
            </div>
            <div>
              <Label>Current level</Label>
              <Select value={editForm.level} onValueChange={(level) => setEditForm((current) => ({ ...current, level: level as LearningGoalInputLevel }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={LearningGoalInputLevel.beginner}>Beginner</SelectItem>
                  <SelectItem value={LearningGoalInputLevel.intermediate}>Intermediate</SelectItem>
                  <SelectItem value={LearningGoalInputLevel.advanced}>Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-goal-date">Target date <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="edit-goal-date" type="date" value={editForm.targetDate} onChange={(event) => setEditForm((current) => ({ ...current, targetDate: event.target.value }))} />
            </div>
            <div>
              <Label htmlFor="edit-goal-description">Context <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea id="edit-goal-description" value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} maxLength={1000} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingGoal(null)}>Cancel</Button>
              <Button type="submit" disabled={updateGoal.isPending}>{updateGoal.isPending ? "Saving…" : "Save changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {isTeacher && (
        <section className="rounded-xl border bg-card p-4" data-testid="manage-student-goals">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><Users className="size-4 text-primary-text" /> Manage students&apos; goals</h2>
              <p className="text-xs text-muted-foreground">Review and update goals for students in your classes.</p>
            </div>
            <Select value={managedClassId ? String(managedClassId) : ""} onValueChange={(value) => setManagedClassId(Number(value))}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Select a class" /></SelectTrigger>
              <SelectContent>{teacherClasses.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {studentGoalsLoading ? <Skeleton className="h-24 w-full" /> : !(studentGoals as StudentLearningGoal[] | undefined)?.length ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No student goals in this class yet.</p>
          ) : (
            <div className="space-y-2">{(studentGoals as StudentLearningGoal[]).map((goal) => (
              <div key={goal.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div><p className="text-sm font-medium">{goal.title}</p><p className="text-xs text-muted-foreground">{goal.studentName} · {goal.subject}</p></div>
                <div className="flex items-center gap-2">
                  <Select value={goal.status} onValueChange={(status) => manageStudentGoal(goal.id, { status: status as LearningGoalStatus })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value={LearningGoalStatus.active}>Active</SelectItem><SelectItem value={LearningGoalStatus.paused}>Paused</SelectItem><SelectItem value={LearningGoalStatus.completed}>Completed</SelectItem></SelectContent>
                  </Select>
                  <Input className="w-36" type="date" value={goal.targetDate ?? ""} onChange={(event) => manageStudentGoal(goal.id, { targetDate: event.target.value || null })} />
                </div>
              </div>
            ))}</div>
          )}
        </section>
      )}
      <section className="space-y-4 border-y py-5" data-testid="community-study-paths">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Share2 className="size-5 text-primary-text" /> Community study paths
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reuse checklists shared by students and teachers, then personalize
            your own copy.
          </p>
        </div>
        {communityPathsLoading ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-48" />
            ))}
          </div>
        ) : sharedByOthers.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sharedByOthers.slice(0, 9).map((path) => (
              <Card key={path.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{path.subject}</Badge>
                    <Badge variant="outline" className="capitalize">
                      {path.level}
                    </Badge>
                  </div>
                  <CardTitle translate="no" className="mt-2 text-base">{path.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Shared by {path.creatorName} · Used {path.useCount} times
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {path.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {path.description}
                    </p>
                  )}
                  <ol className="space-y-1 text-sm">
                    {path.pathSteps.slice(0, 4).map((step, index) => (
                      <li key={step.id} className="flex gap-2">
                        <span className="text-muted-foreground">{index + 1}.</span>
                        <span className="line-clamp-1">{step.title}</span>
                      </li>
                    ))}
                  </ol>
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={cloningPathId === path.id}
                    onClick={() => cloneCommunityPath(path)}
                  >
                    <Copy className="mr-2 size-4" />
                    {cloningPathId === path.id ? "Adding…" : "Use this path"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="border-y py-8 text-center">
            {/*
              Two different situations, and telling someone who just shared a
              path that nothing has been shared reads like their share failed.
            */}
            <p className="font-medium">
              {hasSharedOwnPath
                ? "Nothing shared by other people yet"
                : "No community paths yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasSharedOwnPath
                ? "Your path is in the library. Paths other people share will appear here."
                : "Share one of your goals to start the community library."}
            </p>
          </div>
        )}
      </section>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-80 rounded-xl" />
          ))}
        </div>
      ) : !goals?.length ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <Target className="mx-auto mb-3 size-10 text-muted-foreground/40" />
          <p className="font-semibold">Your path is empty</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a learning goal and its first checklist will appear here and
            on your dashboard.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((goal) => {
            const query = encodeURIComponent(goal.title),
              subject = encodeURIComponent(goal.subject);
            const done = goal.pathSteps.filter((step) => step.completed).length;
            return (
              <Card
                key={goal.id}
                className={
                  goal.status === LearningGoalStatus.completed
                    ? "opacity-70"
                    : ""
                }
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle translate="no" className="text-lg">{goal.title}</CardTitle>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="secondary">{goal.subject}</Badge>
                        <Badge variant="outline" className="capitalize">
                          {goal.level}
                        </Badge>
                        <Badge className="capitalize">{goal.status}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEditing(goal)}
                        aria-label="Edit goal"
                        title="Edit goal"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(goal.id)}
                        aria-label="Delete goal"
                        title="Delete goal"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant={dashboardGoalId === goal.id ? "default" : "outline"} onClick={() => { if (!me?.id || !workspaceRole) return; setDashboardGoalId(me.id, workspaceRole, goal.id); setDashboardGoal(goal.id); updateAccountPreferences.mutate({ dashboardGoalIds: { ...(accountPreferences?.dashboardGoalIds ?? {}), [workspaceRole]: goal.id } }); toast({ title: "Dashboard goal updated", description: goal.title + " will drive your dashboard and check-ins." }); }}><LayoutDashboard className="mr-2 size-4" />{dashboardGoalId === goal.id ? "Displayed on dashboard" : "Display on dashboard"}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => downloadStudyPack(goal)}>
                      <Download className="mr-2 size-4" /> Download study pack
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={sharingGoalId === goal.id}
                      onClick={() => shareGoalPath(goal)}
                    >
                      <Share2 className="mr-2 size-4" />
                      {sharingGoalId === goal.id
                        ? "Sharing…"
                        : communityPaths.some(
                              (path) =>
                                path.creatorId === me?.id &&
                                path.sourceGoalId === goal.id,
                            )
                          ? "Update shared path"
                          : "Share path"}
                    </Button>
                  </div>
                  {goal.description && (
                    <p className="text-sm text-muted-foreground">
                      {goal.description}
                    </p>
                  )}
                  <div>
                    <div className="mb-2 flex justify-between text-xs">
                      <b>Learning path</b>
                      <span className="text-muted-foreground">
                        {done} of {goal.pathSteps.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {goal.pathSteps.map((step, index) => (
                        <div key={step.id} className="flex items-center gap-1.5">
                          <button type="button" aria-label={`${step.completed ? "Undo" : "Complete"} ${step.title}`} onClick={() => toggleStep(goal, step.id)} className={cn("flex size-7 shrink-0 items-center justify-center rounded border", step.completed && "bg-emerald-600 text-white")}>
                            {step.completed && <Check size={14} />}
                          </button>
                          <Input defaultValue={step.title} key={`${step.id}:${step.title}`} aria-label={`Rename ${step.title}`} className={cn("h-8 min-w-0 flex-1 text-sm", step.completed && "text-muted-foreground line-through")} onBlur={(event) => { if (event.currentTarget.value.trim() !== step.title) void renameStep(goal, step.id, event.currentTarget.value); }} />
                          <Button type="button" variant="ghost" size="icon" className="size-7" disabled={index === 0} onClick={() => moveStep(goal, index, -1)} aria-label={`Move ${step.title} up`}><ArrowUp size={14} /></Button>
                          <Button type="button" variant="ghost" size="icon" className="size-7" disabled={index === goal.pathSteps.length - 1} onClick={() => moveStep(goal, index, 1)} aria-label={`Move ${step.title} down`}><ArrowDown size={14} /></Button>
                          <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive-text" onClick={() => deleteStep(goal, step.id)} aria-label={`Delete ${step.title}`}><Trash2 size={14} /></Button>
                        </div>
                      ))}
                      <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); void addStep(goal); }}>
                        <Input value={newStepTitles[goal.id] ?? ""} onChange={(event) => setNewStepTitles((current) => ({ ...current, [goal.id]: event.target.value }))} placeholder="Add a path step…" aria-label={`Add step to ${goal.title}`} />
                        <Button type="submit" size="sm" disabled={!newStepTitles[goal.id]?.trim()}><Plus className="mr-1 size-4" /> Add</Button>
                      </form>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={`/resources?goal=${query}&subject=${subject}`}
                      >
                        <BookOpen className="mr-1 size-4" />
                        Resources
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/people?goal=${query}&subject=${subject}`}>
                        <Users className="mr-1 size-4" />
                        People
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/schedule?goal=${query}`}>
                        <CalendarPlus className="mr-1 size-4" />
                        Schedule
                      </Link>
                    </Button>
                  </div>
                </CardContent>
                <CardFooter className="justify-end">
                  {goal.status === LearningGoalStatus.completed ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        patch(goal.id, { status: LearningGoalStatus.active })
                      }
                    >
                      Reopen
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          patch(goal.id, {
                            status:
                              goal.status === LearningGoalStatus.paused
                                ? LearningGoalStatus.active
                                : LearningGoalStatus.paused,
                          })
                        }
                      >
                        <Pause className="mr-2 size-4" />
                        {goal.status === LearningGoalStatus.paused
                          ? "Resume"
                          : "Pause"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          patch(goal.id, {
                            status: LearningGoalStatus.completed,
                          })
                        }
                      >
                        <CheckCircle2 className="mr-2 size-4" />
                        Complete
                      </Button>
                    </>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
