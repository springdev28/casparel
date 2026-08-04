import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
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
  useUpdateLearningGoal,
  useGetResourceRecommendations,
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
import { getSearchHistory } from "../lib/searchHistory";
import { getDashboardGoalId, pendingCheckInKey } from "../lib/dashboardGoal";

const path = [
  {
    title: "Fractions as parts of a whole",
    concept: "Fractions as parts of a whole",
    type: "Video · 8 min",
    query: "fractions as parts of a whole",
  },
  {
    title: "Equivalent fractions, visually",
    concept: "Equivalent fractions",
    type: "Interactive · 12 min",
    query: "equivalent fractions visual interactive",
  },
  {
    title: "Finding common denominators",
    concept: "Common denominators",
    type: "Guided practice · 15 min",
    query: "finding common denominators guided practice",
  },
  {
    title: "Explain your strategy",
    concept: "Fraction strategy",
    type: "Reflection · 5 min",
    query: "explaining fraction strategies reflection",
  },
] as const;

function resourceSearch(query: string) {
  return `/resources?goal=${encodeURIComponent(query)}&subject=Mathematics`;
}

const checkIns = [
  {
    concept: "Equivalent fractions",
    prompt: "How confident are you explaining why 1/2 and 2/4 are equal?",
  },
  {
    concept: "Fractions as parts of a whole",
    prompt: "How confident are you showing a fraction as part of a whole?",
  },
  {
    concept: "Common denominators",
    prompt: "How confident are you finding a common denominator?",
  },
  {
    concept: "Fraction strategy",
    prompt: "How confident are you explaining the strategy you used?",
  },
] as const;

function StudentView({ name, userId, workspaceRole }: { name?: string; userId?: number; workspaceRole?: string }) {
  const [why, setWhy] = useState(true);
  const [confidence, setConfidence] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: evidence, isLoading: evidenceLoading } =
    useListLearningEvidence();
  const createEvidence = useCreateLearningEvidence();
  const { data: goals } = useListLearningGoals({
    query: { queryKey: getListLearningGoalsQueryKey() },
  });
  const updateGoal = useUpdateLearningGoal();
  const [selectedGoalId, setSelectedGoalId] = useState(() => getDashboardGoalId(userId, workspaceRole));
  useEffect(() => {
    setSelectedGoalId(getDashboardGoalId(userId, workspaceRole));
    const syncGoal = (event: Event) => setSelectedGoalId((event as CustomEvent<number>).detail);
    window.addEventListener("schoolar-dashboard-goal", syncGoal);
    return () => window.removeEventListener("schoolar-dashboard-goal", syncGoal);
  }, [userId, workspaceRole]);
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
  }
  const nextStepIndex = path.findIndex(
    (step) => !completedSteps.has(step.concept),
  );
  const recentSearch = getSearchHistory(userId)[0]?.query.toLocaleLowerCase();
  const { data: verifiedRecommendations, isFetching: recommendationsRefreshing } = useGetResourceRecommendations({
    query: { queryKey: ["resource-recommendations", activeGoal?.id] },
  });
  const recommendation = useMemo(() => {
    const goalTerms = [activeGoal?.title, activeGoal?.subject, activeGoal?.description,
      ...((activeGoal?.pathSteps ?? []).map((step) => `${step.title} ${step.query}`))]
      .filter(Boolean).join(" ").toLocaleLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
    const recentTerms = recentSearch?.split(/\s+/).filter(Boolean) ?? [];
    return [...(verifiedRecommendations ?? [])].map((resource) => {
      const searchable = [resource.title, resource.description, resource.subject].filter(Boolean).join(" ").toLocaleLowerCase();
      const score = goalTerms.reduce((sum, term) => sum + (searchable.includes(term) ? 3 : 0), 0)
        + recentTerms.reduce((sum, term) => sum + (searchable.includes(term) ? 1 : 0), 0);
      return { resource, score };
    }).sort((a, b) => b.score - a.score)[0]?.resource;
  }, [activeGoal, recentSearch, verifiedRecommendations]);
  const goalEvidence = evidence?.filter((item) => item.learningGoalId === activeGoal?.id) ?? [];
  const answeredCount = goalEvidence.length;
  const [checkIn, setCheckIn] = useState<{ concept: string; prompt: string } | null>(null);
  const [needsContinuation, setNeedsContinuation] = useState(false);
  const [answeredThisVisit, setAnsweredThisVisit] = useState(false);
  function createNextCheckIn() {
    if (!activeGoal || !userId || !workspaceRole) return;
    const step = activeGoal.pathSteps[answeredCount % Math.max(activeGoal.pathSteps.length, 1)];
    const next = step ? { concept: step.title, prompt: `How confident are you with “${step.title}”?` } : { concept: activeGoal.title, prompt: `How confident are you that you achieved “${activeGoal.title}”?` };
    localStorage.setItem(pendingCheckInKey(userId, workspaceRole, activeGoal.id), JSON.stringify(next));
    setCheckIn(next);
    setNeedsContinuation(false);
  }
  useEffect(() => {
    setConfidence(null); setAnsweredThisVisit(false); setCheckIn(null); setNeedsContinuation(false);
    if (!activeGoal || !userId || !workspaceRole || evidence === undefined) return;
    const saved = localStorage.getItem(pendingCheckInKey(userId, workspaceRole, activeGoal.id));
    if (saved) { try { setCheckIn(JSON.parse(saved)); return; } catch { localStorage.removeItem(pendingCheckInKey(userId, workspaceRole, activeGoal.id)); } }
    if (answeredCount > 0 && answeredCount % 5 === 0) setNeedsContinuation(true); else createNextCheckIn();
  }, [activeGoal?.id, evidence === undefined]);
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary">
            YOUR LEARNING JOURNEY
          </p>
          <h1 className="text-3xl font-bold">
            Welcome back{name ? `, ${name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Your path adapted after yesterday&apos;s reflection. Here&apos;s the
            best next step.
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
      <section className="grid gap-5 lg:grid-cols-[1.5fr_.7fr]">
        <Card className="overflow-hidden border-primary/20">
          <div className="h-1.5 bg-primary" />
          <CardContent className="p-6">
            <div className="flex gap-4">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <BookOpen />
              </div>
              <div>
                <Badge>{recommendationsRefreshing ? "Refreshing for goal…" : "Recommended next"}</Badge>
                <h2 className="mt-2 text-2xl font-bold">
                  {recommendation?.title ?? "No recommendation available yet"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {recommendation
                    ? `${recommendation.format} · Recommended from your learning activity`
                    : "Search or save resources to improve recommendations"}
                </p>
              </div>
            </div>
            <button
              className="my-5 flex w-full gap-3 rounded-xl border bg-primary/[.04] p-4 text-left"
              onClick={() => setWhy(!why)}
            >
              <Sparkles className="shrink-0 text-primary" size={19} />
              <div>
                <b className="text-sm">Why this resource?</b>
                {why && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    This recommendation is based on your recent searches, saved
                    resources, and progress toward{" "}
                    {activeGoal?.title ?? "your next learning goal"}.
                  </p>
                )}
              </div>
            </button>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex gap-2 text-sm text-muted-foreground">
                <Target size={16} />
                Goal: {activeGoal?.title ?? "Create a goal to build your path"}
              </span>
              <Button
                disabled={!recommendation}
                onClick={() =>
                  recommendation &&
                  setLocation(`/resources/${recommendation.id}`)
                }
              >
                Continue learning
                <ArrowRight size={16} className="ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex gap-3">
              <Brain className="text-primary" />
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
              <b className="text-sm text-primary">
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
                    <p className="text-xs text-muted-foreground">{step.type}</p>
                  </div>
                  {isComplete ? (
                    <Badge variant="outline">Complete</Badge>
                  ) : (
                    <span className="flex items-center text-xs font-medium text-primary">
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
              <Network className="text-primary" />
              <div>
                <b>Class knowledge map</b>
                <p className="text-xs text-muted-foreground">
                  Connect ideas, resources, and questions.
                </p>
              </div>
            </div>
            <div className="relative my-5 h-44 rounded-xl border bg-muted/30">
              <span className="absolute left-[34%] top-[38%] rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">
                Fractions
              </span>
              <span className="absolute left-3 top-4 rounded-full border bg-card px-3 py-2 text-xs">
                Parts of a whole
              </span>
              <span className="absolute bottom-4 right-3 rounded-full border bg-card px-3 py-2 text-xs">
                Equivalent values
              </span>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/classes")}
            >
              Explore class map
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

const signals = [
  [
    CircleAlert,
    "6 learners share a misconception",
    "Larger denominators are being treated as larger fractions.",
  ],
  [
    Clock3,
    "3 learners may be stalled",
    "No checkpoint evidence in the past four days.",
  ],
  [
    TrendingUp,
    "This visual model is working",
    "Understanding improved 24% after this resource.",
  ],
] as const;

function TeacherView({ name }: { name?: string }) {
  const [, setLocation] = useLocation();
  const { data: learningSignals } = useGetLearningSignals();
  const liveSignals = learningSignals?.signals.length
    ? learningSignals.signals.map(
        (signal) =>
          [
            signal.stalledCount ? CircleAlert : TrendingUp,
            `${signal.learnerCount} learners · ${signal.concept}`,
            signal.commonMisconception ??
              `Average understanding: ${signal.averageUnderstanding} of 4`,
          ] as const,
      )
    : signals;
  const understandingPercent = learningSignals
    ? Math.round((learningSignals.averageUnderstanding / 4) * 100)
    : 0;
  const needsAttention =
    learningSignals?.signals.reduce(
      (sum, signal) => sum + signal.stalledCount,
      0,
    ) ?? 0;

  function comingSoon(feature: string) {
    toast({
      title: `${feature} — coming soon`,
      description: "This feature is on the roadmap.",
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary">CLASSROOM COPILOT</p>
          <h1 className="text-3xl font-bold">
            Good morning{name ? `, ${name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Here&apos;s what your learners&apos; evidence suggests doing next.
          </p>
        </div>
        <Button onClick={() => comingSoon("Ask Schoolar")}>
          <Sparkles size={16} className="mr-2" />
          Ask Schoolar
        </Button>
      </header>
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
      <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-bold">Learning signals</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Patterns from reflections and comprehension checks—not clicks.
            </p>
            <div className="space-y-3">
              {liveSignals.map(([Icon, title, text]) => (
                <div key={title} className="flex gap-4 rounded-xl border p-4">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon size={18} />
                  </div>
                  <div className="flex-1">
                    <b className="text-sm">{title}</b>
                    <p className="text-xs text-muted-foreground">{text}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setLocation("/classes")}
                  >
                    Review
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/20">
          <CardContent className="p-6">
            <div className="flex gap-3">
              <Sparkles className="text-primary" />
              <div>
                <h2 className="text-lg font-bold">Suggested next move</h2>
                <p className="text-sm text-muted-foreground">
                  Explainable recommendation
                </p>
              </div>
            </div>
            <h3 className="mt-5 font-semibold">
              Create three readiness groups for tomorrow
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Checkpoint evidence shows one group needs a visual reteach while
              another is ready to transfer the concept.
            </p>
            <div className="my-5 space-y-2">
              {[
                ["Foundation", "6", "Visual model + guided prompts"],
                ["Practice", "14", "Paired misconception check"],
                ["Extend", "5", "Ratio transfer challenge"],
              ].map(([g, n, t]) => (
                <div key={g} className="rounded-lg bg-muted p-3">
                  <div className="flex justify-between text-sm">
                    <b>{g} group</b>
                    <span>{n} learners</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t}</p>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={() => setLocation("/classes")}>
              Review differentiated assignment
              <ArrowRight size={16} className="ml-2" />
            </Button>
            <Button
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => comingSoon("AI grouping suggestions")}
            >
              <RefreshCw size={14} className="mr-2" />
              Try another grouping
            </Button>
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
              <Icon className="mb-3 text-primary" />
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
  const { data: me, isLoading } = useGetMe();
  if (isLoading)
    return (
      <div className="p-8">
        <Skeleton className="h-80 w-full" />
      </div>
    );
  return me && (me?.activeRole ?? me?.role) === UserRole.teacher ? (
    <TeacherView name={me.name} />
  ) : (
    <StudentView name={me?.name} userId={me?.id} workspaceRole={me?.activeRole ?? me?.role} />
  );
}
