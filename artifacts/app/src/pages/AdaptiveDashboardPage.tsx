import { useState } from "react";
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
  useCreateLearningEvidence,
  useGetLearningSignals,
  useGetMe,
  useListLearningEvidence,
  UserRole,
} from "@workspace/api-client-react";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Card, CardContent } from "@workspace/edu-ds/components/ui/card";
import { Progress } from "@workspace/edu-ds/components/ui/progress";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { cn } from "@workspace/edu-ds/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const path = [
  ["Fractions as parts of a whole", "Video · 8 min"],
  ["Equivalent fractions, visually", "Interactive · 12 min"],
  ["Finding common denominators", "Guided practice · 15 min"],
  ["Explain your strategy", "Reflection · 5 min"],
] as const;

function StudentView({ name }: { name?: string }) {
  const [why, setWhy] = useState(true);
  const [confidence, setConfidence] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { data: evidence } = useListLearningEvidence();
  const createEvidence = useCreateLearningEvidence();
  const latest = evidence?.[0];
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
          mastery evidence · Fractions
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
                <Badge>Recommended next</Badge>
                <h2 className="mt-2 text-2xl font-bold">
                  Equivalent fractions, visually
                </h2>
                <p className="text-sm text-muted-foreground">
                  Interactive · 12 min · Khan Academy
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
                    Your last checkpoint showed uncertainty when two fractions
                    look different but have the same value. This visual activity
                    targets that exact gap and matches your preference for
                    interactive practice.
                  </p>
                )}
              </div>
            </button>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex gap-2 text-sm text-muted-foreground">
                <Target size={16} />
                Goal: Add and subtract fractions confidently
              </span>
              <Button>
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
            <p className="mb-4 text-sm">
              How confident are you explaining why 1/2 and 2/4 are equal?
            </p>
            <div className="grid grid-cols-3 gap-2">
              {["Not yet", "Almost", "I can"].map((x, i) => (
                <button
                  key={x}
                  disabled={createEvidence.isPending}
                  onClick={async () => {
                    setConfidence(i);
                    await createEvidence.mutateAsync({
                      data: {
                        concept: "Equivalent fractions",
                        confidence: i + 1,
                        understanding: i === 0 ? 1 : i === 1 ? 2 : 4,
                        reflection: x,
                      },
                    });
                    await queryClient.invalidateQueries({
                      queryKey: getListLearningEvidenceQueryKey(),
                    });
                  }}
                  className={cn(
                    "rounded-lg border p-3 text-xs font-semibold",
                    confidence === i && "bg-primary text-primary-foreground",
                  )}
                >
                  {x}
                </button>
              ))}
            </div>
            {confidence !== null && (
              <p className="mt-4 flex gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                <Check size={15} />
                Saved as learning evidence. Your path will adapt.
              </p>
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
              <b className="text-sm text-primary">1 of 4 complete</b>
            </div>
            <Progress value={25} className="mb-5 h-2" />
            {path.map(([title, type], i) => (
              <div
                key={title}
                className={cn(
                  "flex items-center gap-4 rounded-xl p-3",
                  i === 1 && "bg-primary/[.06]",
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold",
                    i === 0 && "bg-emerald-600 text-white",
                    i === 1 && "bg-primary text-primary-foreground",
                  )}
                >
                  {i === 0 ? <Check size={15} /> : i + 1}
                </div>
                <div className="flex-1">
                  <b className="text-sm">{title}</b>
                  <p className="text-xs text-muted-foreground">{type}</p>
                </div>
                {i === 1 && <Badge variant="outline">In progress</Badge>}
              </div>
            ))}
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
            <Button variant="outline" className="w-full">
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
        <Button>
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
                  <Button size="sm" variant="ghost">
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
            <Button className="w-full">
              Review differentiated assignment
              <ArrowRight size={16} className="ml-2" />
            </Button>
            <Button variant="ghost" className="mt-2 w-full">
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
            [Users, "Form balanced groups"],
            [Target, "Differentiate an assignment"],
            [CalendarDays, "Plan the schedule"],
            [BookOpen, "Sequence next week"],
          ].map(([Icon, title]) => (
            <button
              key={title as string}
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
  return me?.role === UserRole.teacher ? (
    <TeacherView name={me.name} />
  ) : (
    <StudentView name={me?.name} />
  );
}
