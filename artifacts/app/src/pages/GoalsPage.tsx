import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarPlus,
  Check,
  CheckCircle2,
  Pause,
  LayoutDashboard,
  Plus,
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
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { cn } from "@workspace/edu-ds/lib/utils";
import {
  getListLearningGoalsQueryKey,
  LearningGoalInputLevel,
  LearningGoalStatus,
  useCreateLearningGoal,
  useDeleteLearningGoal,
  useGetMe,
  useListLearningGoals,
  useUpdateLearningGoal,
  type LearningGoal,
} from "@workspace/api-client-react";

import { getDashboardGoalId, setDashboardGoalId } from "../lib/dashboardGoal";
export default function GoalsPage() {
  const client = useQueryClient();
  const { data: me } = useGetMe();
  const workspaceRole = me?.activeRole ?? me?.role;
  const [dashboardGoalId, setDashboardGoal] = useState<number | null>(null);
  useEffect(() => {
    setDashboardGoal(getDashboardGoalId(me?.id, workspaceRole));
  }, [me?.id, workspaceRole]);
  const { data: goals, isLoading } = useListLearningGoals({
    query: { queryKey: getListLearningGoalsQueryKey() },
  });
  const createGoal = useCreateLearningGoal();
  const updateGoal = useUpdateLearningGoal();
  const deleteGoal = useDeleteLearningGoal();
  const [open, setOpen] = useState(false);
  const [newStepTitles, setNewStepTitles] = useState<Record<number, string>>({});
  const [form, setForm] = useState({
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Target className="size-6 text-primary" />
            Learning goals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each goal builds a path you can complete—or undo—one step at a time.
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
                      <CardTitle className="text-lg">{goal.title}</CardTitle>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="secondary">{goal.subject}</Badge>
                        <Badge variant="outline" className="capitalize">
                          {goal.level}
                        </Badge>
                        <Badge className="capitalize">{goal.status}</Badge>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(goal.id)}
                      aria-label="Delete goal"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button type="button" size="sm" variant={dashboardGoalId === goal.id ? "default" : "outline"} onClick={() => { if (!me?.id || !workspaceRole) return; setDashboardGoalId(me.id, workspaceRole, goal.id); setDashboardGoal(goal.id); toast({ title: "Dashboard goal updated", description: goal.title + " will drive your dashboard and check-ins." }); }}><LayoutDashboard className="mr-2 size-4" />{dashboardGoalId === goal.id ? "Displayed on dashboard" : "Display on dashboard"}</Button>
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
                          <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => deleteStep(goal, step.id)} aria-label={`Delete ${step.title}`}><Trash2 size={14} /></Button>
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
