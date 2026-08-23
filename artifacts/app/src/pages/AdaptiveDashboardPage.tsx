/**
 * @fileOverview Web screen role: renders the Adaptive Dashboard Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  CircleAlert,
  Network,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  getListLearningEvidenceQueryKey,
  getListLearningGoalsQueryKey,
  useCreateLearningEvidence,
  useGetLearningSignals,
  useGetMe,
  useListLearningEvidence,
  useListLearningGoals,
  useListResources,
  useUpdateLearningGoal,
  getListResourcesQueryKey,
  UserRole,
} from "@workspace/api-client-react";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Card, CardContent } from "@workspace/edu-ds/components/ui/card";
import { Progress } from "@workspace/edu-ds/components/ui/progress";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { cn } from "@workspace/edu-ds/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getDashboardGoalId, pendingCheckInKey } from "../lib/dashboardGoal";
import { TodayAssignments } from "../components/TodayAssignments";
import { ContinueWorkflows } from "../components/ContinueWorkflows";
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from "../lib/user-preferences";
import {
  presentTeacherSignals,
  weakestTeacherSignal,
} from "../lib/dashboard-truth";

function readableError(...errors: unknown[]) {
  const error = errors.find((candidate) => candidate instanceof Error);
  return error instanceof Error ? error.message : "The server did not return dashboard data.";
}

function DashboardLoadFailure({
  title,
  detail,
  onRetry,
  isRetrying,
}: {
  title: string;
  detail: string;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <Card className="border-destructive" role="alert">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <CircleAlert className="mt-0.5 shrink-0 text-destructive-text" />
            <div>
              <h1 className="font-semibold">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your data has not been reported as empty. Try the request again.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={onRetry} disabled={isRetrying}>
            <RefreshCw className={cn("mr-2 size-4", isRetrying && "animate-spin")} />
            Retry
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function reviewIntervalDays(confidence: number, understanding: number) {
  if (confidence <= 1 || understanding <= 1) return 1;
  if (confidence === 2 || understanding === 2) return 3;
  if (understanding === 3) return 7;
  return 14;
}

function formatReviewTiming(dueAt: number, now: number) {
  const days = Math.ceil((dueAt - now) / 86_400_000);
  if (days <= 0) return "Review due";
  if (days === 1) return "Review tomorrow";
  return `Review in ${days} days`;
}

function resourceEffectiveness(avgRating: number, reviewCount: number) {
  if (reviewCount <= 0) return null;
  const ratingSignal = Math.max(0, Math.min(1, avgRating / 5));
  const confidenceSignal = Math.min(reviewCount, 10) / 10;
  return Math.round((ratingSignal * 0.7 + confidenceSignal * 0.3) * 100);
}

function StudentView({ name, userId, workspaceRole }: { name?: string; userId?: number; workspaceRole?: string }) {
  const [confidence, setConfidence] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { data: accountPreferences } = useUserPreferences(Boolean(userId));
  const updateAccountPreferences = useUpdateUserPreferences();
  const [, setLocation] = useLocation();
  const {
    data: evidence,
    isLoading: evidenceLoading,
    isError: evidenceError,
    error: evidenceQueryError,
    isFetching: evidenceFetching,
    refetch: refetchEvidence,
  } = useListLearningEvidence();
  const createEvidence = useCreateLearningEvidence();
  const {
    data: goals,
    isLoading: goalsLoading,
    isError: goalsError,
    error: goalsQueryError,
    isFetching: goalsFetching,
    refetch: refetchGoals,
  } = useListLearningGoals({
    query: { queryKey: getListLearningGoalsQueryKey() },
  });
  const updateGoal = useUpdateLearningGoal();
  const [selectedGoalId, setSelectedGoalId] = useState(() => getDashboardGoalId(userId, workspaceRole));
  useEffect(() => {
    setSelectedGoalId(
      (workspaceRole
        ? accountPreferences?.dashboardGoalIds[workspaceRole]
        : undefined) ?? getDashboardGoalId(userId, workspaceRole),
    );
    const syncGoal = (event: Event) => setSelectedGoalId((event as CustomEvent<number>).detail);
    window.addEventListener("schoolar-dashboard-goal", syncGoal);
    return () => window.removeEventListener("schoolar-dashboard-goal", syncGoal);
  }, [accountPreferences, userId, workspaceRole]);
  const activeGoal =
    goals?.find((goal) => goal.id === selectedGoalId) ??
    goals?.find((goal) => goal.status === "active") ??
    goals?.[0];
  const path =
    activeGoal?.pathSteps.map((step) => ({
      ...step,
      concept: step.id,
      type: "Checklist step",
    })) ?? [];
  const latest = evidence?.[0];
  const completedSteps = new Set(
    path.filter((step) => step.completed).map((step) => step.concept),
  );
  const progress = path.length ? (completedSteps.size / path.length) * 100 : 0;
  async function togglePathStep(stepId: string) {
    if (!activeGoal) return;
    try {
      await updateGoal.mutateAsync({
        id: activeGoal.id,
        data: {
          pathSteps: activeGoal.pathSteps.map((step) =>
            step.id === stepId ? { ...step, completed: !step.completed } : step,
          ),
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getListLearningGoalsQueryKey(),
      });
    } catch (error) {
      toast({
        title: "Could not update the learning path",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }
  const nextStepIndex = path.findIndex(
    (step) => !completedSteps.has(step.concept),
  );
  const libraryCatalogParams = { limit: 50, offset: 0 };
  const {
    data: libraryCatalog,
    isError: libraryCatalogError,
    isFetching: libraryCatalogFetching,
    refetch: refetchLibraryCatalog,
  } = useListResources(libraryCatalogParams, {
    query: {
      enabled: Boolean(userId && activeGoal),
      queryKey: getListResourcesQueryKey(libraryCatalogParams),
    },
  });
  const [continueResourceIds, setContinueResourceIds] = useState<number[]>([]);
  useEffect(() => {
    if (!userId || !activeGoal) {
      setContinueResourceIds([]);
      return;
    }
    const accountSelection =
      accountPreferences?.continueStudying[String(activeGoal.id)];
    if (accountSelection) {
      setContinueResourceIds(accountSelection);
      return;
    }
    try {
      const stored = JSON.parse(
        localStorage.getItem(
          `schoolar_continue_studying:${userId}:${activeGoal.id}`,
        ) ?? "[]",
      ) as unknown;
      setContinueResourceIds(
        Array.isArray(stored)
          ? stored
              .filter((id): id is number => Number.isInteger(id) && id > 0)
              .slice(0, 6)
          : [],
      );
    } catch {
      setContinueResourceIds([]);
    }
  }, [accountPreferences, userId, activeGoal?.id]);
  const continueResources = continueResourceIds
    .map((id) => (libraryCatalog ?? []).find((resource) => resource.id === id))
    .filter(
      (resource): resource is NonNullable<typeof resource> =>
        resource !== undefined,
    );
  const goalEvidence = evidence?.filter((item) => item.learningGoalId === activeGoal?.id) ?? [];
  const reviewSchedule = useMemo(() => {
    const now = Date.now();
    return path.map((step) => {
      const latestEvidence = goalEvidence
        .filter((item) => item.concept === step.title)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0];
      if (!latestEvidence) {
        return {
          step,
          latestEvidence: undefined,
          dueAt: now,
          dueNow: true,
          label: "Check in now",
        };
      }
      const dueAt =
        new Date(latestEvidence.createdAt).getTime() +
        reviewIntervalDays(
          latestEvidence.confidence,
          latestEvidence.understanding,
        ) *
          86_400_000;
      return {
        step,
        latestEvidence,
        dueAt,
        dueNow: dueAt <= now,
        label: formatReviewTiming(dueAt, now),
      };
    });
  }, [goalEvidence, path]);
  const answeredCount = goalEvidence.length;
  const [checkIn, setCheckIn] = useState<{ concept: string; prompt: string } | null>(null);
  const [needsContinuation, setNeedsContinuation] = useState(false);
  const [answeredThisVisit, setAnsweredThisVisit] = useState(false);
  function createNextCheckIn() {
    if (!activeGoal || !userId || !workspaceRole) return;
    const dueStep = reviewSchedule
      .filter((item) => item.dueNow)
      .sort((a, b) => a.dueAt - b.dueAt)[0]?.step;
    const step =
      dueStep ??
      activeGoal.pathSteps[
        answeredCount % Math.max(activeGoal.pathSteps.length, 1)
      ];
    const next = step ? { concept: step.title, prompt: `How confident are you with “${step.title}”?` } : { concept: activeGoal.title, prompt: `How confident are you that you achieved “${activeGoal.title}”?` };
    localStorage.setItem(pendingCheckInKey(userId, workspaceRole, activeGoal.id), JSON.stringify(next));
    updateAccountPreferences.mutate({
      pendingCheckIns: {
        ...(accountPreferences?.pendingCheckIns ?? {}),
        [`${workspaceRole}:${activeGoal.id}`]: next,
      },
    });
    setCheckIn(next);
    setNeedsContinuation(false);
  }
  useEffect(() => {
    setConfidence(null); setAnsweredThisVisit(false); setCheckIn(null); setNeedsContinuation(false);
    if (!activeGoal || !userId || !workspaceRole || evidence === undefined) return;
    const accountCheckIn = accountPreferences?.pendingCheckIns[`${workspaceRole}:${activeGoal.id}`];
    if (accountCheckIn) { setCheckIn(accountCheckIn); return; }
    const saved = localStorage.getItem(pendingCheckInKey(userId, workspaceRole, activeGoal.id));
    if (saved) { try { const parsed = JSON.parse(saved); setCheckIn(parsed); updateAccountPreferences.mutate({ pendingCheckIns: { ...(accountPreferences?.pendingCheckIns ?? {}), [`${workspaceRole}:${activeGoal.id}`]: parsed } }); return; } catch { localStorage.removeItem(pendingCheckInKey(userId, workspaceRole, activeGoal.id)); } }
    if (answeredCount > 0 && answeredCount % 5 === 0) setNeedsContinuation(true); else createNextCheckIn();
  }, [activeGoal?.id, evidence === undefined, accountPreferences === undefined]);
  const primaryLoading =
    (goalsLoading && goals === undefined) ||
    (evidenceLoading && evidence === undefined);
  const primaryFailed =
    (goalsError && goals === undefined) ||
    (evidenceError && evidence === undefined);
  const libraryCatalogFailed =
    Boolean(activeGoal) && libraryCatalogError && libraryCatalog === undefined;

  if (primaryLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (primaryFailed) {
    return (
      <DashboardLoadFailure
        title="Your learning dashboard could not be loaded."
        detail={readableError(goalsQueryError, evidenceQueryError)}
        onRetry={() => void Promise.all([refetchGoals(), refetchEvidence()])}
        isRetrying={goalsFetching || evidenceFetching}
      />
    );
  }
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary-text">
            YOUR LEARNING JOURNEY
          </p>
          <h1 className="text-3xl font-bold">
            Welcome back{name ? `, ${name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {latest
              ? "Your latest check-in and active goal shape what appears next."
              : "Choose a goal and complete a check-in to start building learning evidence."}
          </p>
        </div>
        <Badge variant="secondary" className="px-4 py-2">
          <TrendingUp size={15} className="mr-2" />
          {latest
            ? `${Math.round((latest.understanding / 4) * 100)}%`
            : "No"}{" "}
          mastery evidence · {activeGoal?.subject ?? "No active goal"}
        </Badge>
      </header>
      {(goalsError || evidenceError) && (
        <Card className="border-amber-300" role="status">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm">
              Saved dashboard data is shown, but the latest update could not be loaded.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void Promise.all([refetchGoals(), refetchEvidence()])}
              disabled={goalsFetching || evidenceFetching}
            >
              <RefreshCw className={cn("mr-2 size-4", (goalsFetching || evidenceFetching) && "animate-spin")} />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
      <TodayAssignments />
      <ContinueWorkflows />
      <section className="grid gap-5 lg:grid-cols-[1.5fr_.7fr]">
        <Card className="overflow-hidden border-primary/20">
          <div className="h-1.5 bg-primary" />
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex gap-4">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary-text">
                  <BookOpen />
                </div>
                <div>
                  <Badge variant="secondary">Continue studying</Badge>
                  <h2 className="mt-2 text-2xl font-bold">
                    {activeGoal?.title ?? "Choose a learning goal"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {libraryCatalogFailed
                      ? "Your selected resources could not be loaded"
                      : activeGoal
                      ? `${continueResources.length} library resource${continueResources.length === 1 ? "" : "s"} selected for this goal`
                      : "Your selected library resources will appear here"}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  setLocation(
                    activeGoal
                      ? `/resources?goal=${encodeURIComponent(activeGoal.title)}#continue-studying`
                      : "/resources#continue-studying",
                  )
                }
              >
                <BookOpen size={16} className="mr-2" />
                Choose resources
              </Button>
            </div>

            {libraryCatalogError && libraryCatalog !== undefined && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 p-3 text-sm" role="status">
                <span>Saved study resources are shown, but the latest update could not be loaded.</span>
                <Button size="sm" variant="ghost" onClick={() => void refetchLibraryCatalog()} disabled={libraryCatalogFetching}>
                  Retry
                </Button>
              </div>
            )}

            {libraryCatalogFailed ? (
              <div className="my-5 rounded-xl border border-destructive/50 p-5" role="alert">
                <p className="font-medium">Study resources could not be loaded.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your resource selection has not been reported as empty.
                </p>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  onClick={() => void refetchLibraryCatalog()}
                  disabled={libraryCatalogFetching}
                >
                  <RefreshCw className={cn("mr-2 size-4", libraryCatalogFetching && "animate-spin")} />
                  Retry
                </Button>
              </div>
            ) : continueResources.length ? (
              <div className="my-5 divide-y border-y">
                {continueResources.map((resource) => (
                  <div
                    key={resource.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{resource.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {resource.subject} · {resource.format}
                        {resourceEffectiveness(
                          resource.avgRating,
                          resource.reviewCount,
                        ) === null
                          ? " · New resource"
                          : ` · ${resourceEffectiveness(resource.avgRating, resource.reviewCount)}% evidence score`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(resource.url, "_blank", "noopener,noreferrer")}
                    >
                      Open <ArrowRight size={15} className="ml-2" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="my-5 rounded-xl border border-dashed p-6 text-center">
                <BookOpen className="mx-auto mb-2 text-muted-foreground" />
                <p className="font-medium">No study resources selected</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose resources from your library to keep studying this goal.
                </p>
              </div>
            )}

            <span className="flex gap-2 text-sm text-muted-foreground">
              <Target size={16} />
              Goal: {activeGoal?.title ?? "Create a goal to build your path"}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex gap-3">
              <Brain className="text-primary-text" />
              <div>
                <b>Quick check-in</b>
                <p className="text-xs text-muted-foreground">
                  This shapes what comes next.
                </p>
              </div>
            </div>
            {needsContinuation ? (
              <div className="space-y-3">
                <p className="text-sm">You have completed five check-ins for <b>{activeGoal?.title}</b>. Would you like to continue check-ins for this goal?</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={createNextCheckIn}>Continue check-ins</Button>
                  <Button size="sm" variant="outline" onClick={() => setNeedsContinuation(false)}>Not now</Button>
                </div>
              </div>
            ) : checkIn ? (
              <>
                <p className="mb-4 text-sm">{checkIn.prompt}</p>
                <div className="grid grid-cols-3 gap-2">
                  {["Not yet", "Almost", "I can"].map((x, i) => (
                    <button
                      key={x}
                      disabled={createEvidence.isPending || !activeGoal || answeredThisVisit}
                      onClick={async () => {
                        if (!activeGoal || !userId || !workspaceRole) return;
                        try {
                          await createEvidence.mutateAsync({ data: { learningGoalId: activeGoal.id, concept: checkIn.concept, confidence: i + 1, understanding: i === 0 ? 1 : i === 1 ? 2 : 4, reflection: x } });
                          localStorage.removeItem(pendingCheckInKey(userId, workspaceRole, activeGoal.id));
                          const nextPending = { ...(accountPreferences?.pendingCheckIns ?? {}) };
                          delete nextPending[`${workspaceRole}:${activeGoal.id}`];
                          updateAccountPreferences.mutate({ pendingCheckIns: nextPending });
                          setConfidence(i);
                          setAnsweredThisVisit(true);
                          await queryClient.invalidateQueries({ queryKey: getListLearningEvidenceQueryKey() });
                        } catch (error) {
                          toast({ title: "Could not save check-in", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
                        }
                      }}
                      className={cn("rounded-lg border p-3 text-xs font-semibold", confidence === i && "bg-primary text-primary-foreground")}
                    >{x}</button>
                  ))}
                </div>
                {confidence !== null && <p className="mt-4 flex gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800"><Check size={15} />Saved as learning evidence. A new check-in will appear next time you open the dashboard.</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Check-ins are paused for this goal. Reopen the dashboard later or select another goal.</p>
            )}
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex justify-between">
              <div>
                <h2 className="text-lg font-bold">Your path</h2>
                <p className="text-sm text-muted-foreground">
                  Built around your goal and updated as you learn.
                </p>
              </div>
              <b className="text-sm text-primary-text">
                {evidenceLoading
                  ? "Loading progress…"
                  : `${completedSteps.size} of ${path.length} complete`}
              </b>
            </div>
            <Progress
              value={evidenceLoading ? 0 : progress}
              className="mb-5 h-2"
            />
            {path.length === 0 && (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <Target className="mx-auto mb-2 text-muted-foreground" />
                <p className="font-medium">Your path is empty</p>
                <p className="text-sm text-muted-foreground">
                  Create a goal to build your first checklist.
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => setLocation("/goals")}
                >
                  Set a goal
                </Button>
              </div>
            )}
            {path.map((step, i) => {
              const isComplete = completedSteps.has(step.concept);
              const isNext = !isComplete && i === nextStepIndex;
              const review = reviewSchedule.find(
                (item) => item.step.id === step.id,
              );
              return (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => togglePathStep(step.id)}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-xl p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isNext && "bg-primary/[.06]",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold",
                      isComplete && "bg-emerald-600 text-white",
                      isNext && "bg-primary text-primary-foreground",
                    )}
                  >
                    {isComplete ? <Check size={15} /> : i + 1}
                  </div>
                  <div className="flex-1">
                    <b className="text-sm">{step.title}</b>
                    <p className="text-xs text-muted-foreground">
                      {step.type} · {review?.label ?? "Check in now"}
                    </p>
                  </div>
                  {isComplete ? (
                    <Badge variant="outline">Complete</Badge>
                  ) : (
                    <span className="flex items-center text-xs font-medium text-primary-text">
                      Mark complete
                    </span>
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex gap-3">
              <Network className="text-primary-text" />
              <div>
                <b>Learning evidence map</b>
                <p className="text-xs text-muted-foreground">
                  Your goal, concepts, check-ins, and study resources.
                </p>
              </div>
            </div>
            <div className="my-5 space-y-3">
              <div className="rounded-lg bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground">
                {activeGoal?.title ?? "No active goal"}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {reviewSchedule.slice(0, 6).map(({ step, latestEvidence, label }) => {
                  const status =
                    !latestEvidence
                      ? "Needs evidence"
                      : latestEvidence.understanding >= 3
                        ? "Strong evidence"
                        : "Building";
                  return (
                    <div
                      key={step.id}
                      className="flex min-w-0 items-start gap-2 border-b py-2"
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-2.5 shrink-0 rounded-full",
                          !latestEvidence
                            ? "bg-muted-foreground"
                            : latestEvidence.understanding >= 3
                              ? "bg-emerald-500"
                              : "bg-amber-500",
                        )}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {step.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {status} · {label}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {!reviewSchedule.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Add path steps to begin collecting learning evidence.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {goalEvidence.length} check-ins · {continueResources.length} selected resources
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                setLocation(
                  activeGoal
                    ? `/resources?goal=${encodeURIComponent(activeGoal.title)}#continue-studying`
                    : "/goals",
                )
              }
            >
              {activeGoal ? "Manage study resources" : "Create a learning goal"}
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function TeacherView({ name }: { name?: string }) {
  const [, setLocation] = useLocation();
  const {
    data: learningSignals,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useGetLearningSignals();
  const liveSignals = presentTeacherSignals(learningSignals?.signals);
  const weakestSignal = weakestTeacherSignal(learningSignals?.signals);
  const understandingPercent = Math.round(
    ((learningSignals?.averageUnderstanding ?? 0) / 4) * 100,
  );
  const needsAttention =
    learningSignals?.signals?.reduce(
      (sum, signal) => sum + signal.stalledCount,
      0,
    ) ?? 0;

  function comingSoon(feature: string) {
    toast({
      title: `${feature}, coming soon`,
      description: "This feature is on the roadmap.",
    });
  }

  if (isLoading && learningSignals === undefined) {
    return (
      <div className="p-8">
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (isError && learningSignals === undefined) {
    return (
      <DashboardLoadFailure
        title="Class learning evidence could not be loaded."
        detail={readableError(error)}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary-text">CLASSROOM COPILOT</p>
          <h1 className="text-3xl font-bold">
            Good morning{name ? `, ${name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {liveSignals.length
              ? "Review the learning signals collected from your classes."
              : "Learning signals will appear after learners complete check-ins."}
          </p>
        </div>
        <Button onClick={() => comingSoon("Ask Casparel")}>
          <Sparkles size={16} className="mr-2" />
          Ask Casparel
        </Button>
      </header>
      {isError && (
        <Card className="border-amber-300" role="status">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm">
              Saved class evidence is shown, but the latest update could not be loaded.
            </p>
            <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={cn("mr-2 size-4", isFetching && "animate-spin")} />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Understanding", `${understandingPercent}%`],
          ["Evidence collected", String(learningSignals?.evidenceCount ?? 0)],
          ["Needs attention", String(needsAttention)],
          [
            "Learners with evidence",
            String(learningSignals?.learnerCount ?? 0),
          ],
        ].map(([x, y]) => (
          <Card key={x}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{x}</p>
              <p className="mt-2 text-3xl font-bold">{y}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <ContinueWorkflows />
      <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-bold">Learning signals</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Patterns from reflections and comprehension checks, not clicks.
            </p>
            <div className="space-y-3">
              {liveSignals.length ? (
                liveSignals.map((signal) => {
                  const Icon = signal.stalledCount ? CircleAlert : TrendingUp;
                  return (
                    <div key={signal.concept} className="flex gap-4 rounded-xl border p-4">
                      <div className="rounded-lg bg-primary/10 p-2 text-primary-text">
                        <Icon size={18} />
                      </div>
                      <div className="flex-1">
                        <b className="text-sm">
                          {signal.learnerCount} learner{signal.learnerCount === 1 ? "" : "s"} · {signal.concept}
                        </b>
                        <p className="text-xs text-muted-foreground">{signal.detail}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setLocation("/classes")}>
                        Review
                      </Button>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center">
                  <Network className="mx-auto mb-2 text-muted-foreground" />
                  <p className="font-medium">No learning signals yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This is a real empty state. Signals appear when learners in your classes submit check-ins.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/20">
          <CardContent className="p-6">
            <div className="flex gap-3">
              <Sparkles className="text-primary-text" />
              <div>
                <h2 className="text-lg font-bold">Suggested next move</h2>
                <p className="text-sm text-muted-foreground">
                  Explainable recommendation
                </p>
              </div>
            </div>
            {weakestSignal ? (
              <>
                <h3 className="mt-5 font-semibold">Review {weakestSignal.concept}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {weakestSignal.commonMisconception
                    ? `Learners reported a shared misconception: ${weakestSignal.commonMisconception}`
                    : `This concept has the lowest current understanding average: ${weakestSignal.averageUnderstanding} of 4.`}
                </p>
                <div className="my-5 grid gap-2 sm:grid-cols-3">
                  {[
                    ["Learners", String(weakestSignal.learnerCount)],
                    ["Average", `${weakestSignal.averageUnderstanding} / 4`],
                    ["Stalled", String(weakestSignal.stalledCount)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-muted p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
                <Button className="w-full" onClick={() => setLocation("/classes")}>
                  Review class evidence
                  <ArrowRight size={16} className="ml-2" />
                </Button>
              </>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed p-5">
                <h3 className="font-semibold">No recommendation yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Casparel will suggest a next move after real learner evidence is available.
                </p>
                <Button className="mt-4 w-full" variant="outline" onClick={() => setLocation("/classes")}>
                  Open classes
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
      <section>
        <h2 className="mb-1 text-lg font-bold">
          Explainable classroom copilot
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Evolving the seating planner into coordinated classroom decisions.
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            [Users, "Form balanced groups", "/classes"],
            [Target, "Differentiate an assignment", "/classes"],
            [CalendarDays, "Plan the schedule", "/schedule"],
            [BookOpen, "Sequence next week", "/schedule"],
          ].map(([Icon, title, href]) => (
            <button
              key={title as string}
              onClick={() => setLocation(href as string)}
              className="rounded-xl border bg-card p-5 text-left shadow-sm hover:border-primary"
            >
              <Icon className="mb-3 text-primary-text" />
              <b>{title as string}</b>
              <p className="mt-1 text-sm text-muted-foreground">
                Start from learning evidence, with every decision visible and
                editable.
              </p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function AdaptiveDashboardPage() {
  const { data: me, isLoading, isError, error, isFetching, refetch } = useGetMe();
  if (isLoading)
    return (
      <div className="p-8">
        <Skeleton className="h-80 w-full" />
      </div>
    );
  if (isError && !me)
    return (
      <DashboardLoadFailure
        title="Your account workspace could not be loaded."
        detail={readableError(error)}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    );
  return me && (me?.activeRole ?? me?.role) === UserRole.teacher ? (
    <TeacherView name={me.name} />
  ) : (
    <StudentView name={me?.name} userId={me?.id} workspaceRole={me?.activeRole ?? me?.role} />
  );
}
