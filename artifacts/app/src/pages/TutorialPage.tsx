import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  Circle,
  Compass,
  GraduationCap,
  LibraryBig,
  ListChecks,
  MessageSquareText,
  MousePointer2,
  Play,
  Search,
  Target,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import { cn } from "@workspace/edu-ds/lib/utils";
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from "../lib/user-preferences";

type TutorialStep = {
  id: string;
  title: string;
  area: string;
  minutes: number;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  outcome: string;
  details: string[];
  practice: string;
};

const STUDENT_STEPS: TutorialStep[] = [
  {
    id: "student-goal",
    title: "Set one learning goal",
    area: "Goals",
    minutes: 3,
    href: "/goals",
    icon: Target,
    outcome: "Create a clear target and let Schoolar turn it into a path.",
    details: [
      "Name the skill you want to build.",
      "Choose a level and preferred formats.",
      "Use path steps to keep the next action visible.",
    ],
    practice:
      "Create or resume one active goal with at least three path steps.",
  },
  {
    id: "student-resource",
    title: "Find a useful resource",
    area: "Resources",
    minutes: 4,
    href: "/resources",
    icon: Search,
    outcome:
      "Search the library, inspect source details, and save what is worth using.",
    details: [
      "Filter by format when you already know how you want to learn.",
      "Open a resource before saving it.",
      "Use reviews and source checks to decide what deserves attention.",
    ],
    practice: "Save one resource that supports your active goal.",
  },
  {
    id: "student-list",
    title: "Build a study list",
    area: "Lists",
    minutes: 3,
    href: "/lists",
    icon: ListChecks,
    outcome: "Group resources into a sequence you can return to later.",
    details: [
      "Create a focused list instead of a broad collection.",
      "Put the easiest first step near the top.",
      "Share the list when it would help a classmate.",
    ],
    practice:
      "Make a list with two resources and a title that names the outcome.",
  },
  {
    id: "student-activity",
    title: "Practice with an activity",
    area: "Activities",
    minutes: 4,
    href: "/activities",
    icon: LibraryBig,
    outcome:
      "Turn study material into focused practice you can repeat or share.",
    details: [
      "Choose the activity format that fits the skill.",
      "Check every answer before starting.",
      "Share useful activities with a class or the catalog.",
    ],
    practice: "Open one activity and complete a short practice round.",
  },
  {
    id: "student-collaboration",
    title: "Work with your learning community",
    area: "Classes",
    minutes: 4,
    href: "/classes",
    icon: Users,
    outcome:
      "Find class work, discussions, shared canvases, and teacher feedback in one place.",
    details: [
      "Open a class to see its separate workspaces.",
      "Use the forum for discussion and suggestions.",
      "Connect ideas visually in a shared canvas.",
    ],
    practice: "Open a class and review its assignments or shared materials.",
  },
  {
    id: "student-schedule",
    title: "Block study time",
    area: "Schedule",
    minutes: 2,
    href: "/schedule",
    icon: Calendar,
    outcome: "Turn intention into a calendar block.",
    details: [
      "Pick a short, realistic time window.",
      "Connect the block to a resource or goal.",
      "Review upcoming work from the dashboard.",
    ],
    practice: "Schedule one 25-minute study block for this week.",
  },
];

const TEACHER_STEPS: TutorialStep[] = [
  {
    id: "teacher-class",
    title: "Create a class space",
    area: "Classes",
    minutes: 4,
    href: "/classes",
    icon: Users,
    outcome: "Set up a class, invite learners, and keep materials together.",
    details: [
      "Create a class with a recognizable name.",
      "Invite students or import from Google Classroom when available.",
      "Use class detail pages as the home base for assignments.",
    ],
    practice: "Create a class and add one starter resource.",
  },
  {
    id: "teacher-resource",
    title: "Review before assigning",
    area: "Resources",
    minutes: 5,
    href: "/resources",
    icon: BookOpen,
    outcome:
      "Check suitability and source quality before students see a resource.",
    details: [
      "Open the resource detail page.",
      "Look for provenance, reviews, and level fit.",
      "Assign resources to classes only after the review pass.",
    ],
    practice: "Review one resource and decide whether it belongs in a class.",
  },
  {
    id: "teacher-activities",
    title: "Start a learning activity",
    area: "Activities",
    minutes: 4,
    href: "/activities",
    icon: LibraryBig,
    outcome:
      "Create a shareable activity that guides students through the work.",
    details: [
      "Choose a specific objective.",
      "Keep instructions short and action-oriented.",
      "Share the activity link where students already check class work.",
    ],
    practice: "Draft one activity from a resource you trust.",
  },
  {
    id: "teacher-forum",
    title: "Use discussion intentionally",
    area: "Forum",
    minutes: 3,
    href: "/forum",
    icon: MessageSquareText,
    outcome:
      "Prompt class discussion without letting it become another noisy feed.",
    details: [
      "Ask one question students can answer with evidence.",
      "Use catalog posts for durable reference material.",
      "Return to useful posts from class pages or lists.",
    ],
    practice: "Post or save one discussion prompt tied to an assignment.",
  },
  {
    id: "teacher-canvas",
    title: "Map ideas together",
    area: "Canvas",
    minutes: 4,
    href: "/canvases",
    icon: Compass,
    outcome:
      "Build a visual class workspace students can view or edit together.",
    details: [
      "Create a canvas around one unit or question.",
      "Connect notes, headings, links, and resources.",
      "Choose private, class, or collaborative access.",
    ],
    practice: "Create a small canvas with three connected cards.",
  },
  {
    id: "teacher-schedule",
    title: "Plan the learning sequence",
    area: "Schedule",
    minutes: 3,
    href: "/schedule",
    icon: Calendar,
    outcome:
      "Place activities, resources, and follow-up work into a realistic sequence.",
    details: [
      "Keep each block focused on one outcome.",
      "Use assignments for required work.",
      "Return to the dashboard to monitor what comes next.",
    ],
    practice: "Schedule the first checkpoint for a class activity.",
  },
];

const QUICK_WINS = [
  "Use the sidebar to keep the current workflow in view.",
  "Open resource details before saving or assigning.",
  "Keep each goal small enough to finish this week.",
  "Use lists for sequences, not dumping grounds.",
];

function stepDuration(steps: TutorialStep[]) {
  return steps.reduce((total, step) => total + step.minutes, 0);
}

export default function TutorialPage() {
  const [, setLocation] = useLocation();
  const [track, setTrack] = useState<"student" | "teacher">("student");
  const [completed, setCompleted] = useState<string[]>([]);
  const { data: preferences } = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();
  const steps = track === "student" ? STUDENT_STEPS : TEACHER_STEPS;
  const activeStep =
    steps.find((step) => !completed.includes(step.id)) ??
    steps[steps.length - 1];
  const completeCount = steps.filter((step) =>
    completed.includes(step.id),
  ).length;
  const progress = Math.round((completeCount / steps.length) * 100);

  const nextSteps = useMemo(
    () => steps.filter((step) => !completed.includes(step.id)).slice(0, 2),
    [completed, steps],
  );

  function toggleStep(id: string) {
    setCompleted((current) =>
      current.includes(id)
        ? current.filter((stepId) => stepId !== id)
        : [...current, id],
    );
  }

  function chooseTrack(next: "student" | "teacher") {
    setTrack(next);
    setCompleted([]);
  }

  function leaveTutorial(destination: string) {
    if (preferences?.userId) {
      sessionStorage.setItem(
        `schoolar_tutorial_presented:${preferences.userId}`,
        "1",
      );
    }
    updatePreferences.mutate({ tutorialSeen: true });
    setLocation(destination);
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="relative grid gap-4 pr-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute right-0 top-0"
          onClick={() => leaveTutorial("/dashboard")}
          aria-label="Close tutorial"
          title="Close tutorial"
        >
          <X className="size-5" />
        </Button>
        <div className="space-y-3">
          <Badge variant="secondary" className="w-fit gap-1.5">
            <Compass className="size-3.5" />
            Guided start
          </Badge>
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              Learn Schoolar by doing one useful loop
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Pick a role, follow the short path, and jump directly into each
              workspace when you are ready to try it.
            </p>
          </div>
        </div>

        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              Tutorial progress
              <span className="text-muted-foreground">
                {completeCount}/{steps.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: progress + "%" }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{progress}% complete</span>
              <span>{stepDuration(steps)} min total</span>
            </div>
          </CardContent>
        </Card>
      </header>

      <section
        className="flex flex-wrap gap-2"
        aria-label="Choose tutorial track"
      >
        <Button
          type="button"
          variant={track === "student" ? "default" : "outline"}
          onClick={() => chooseTrack("student")}
          className="gap-2"
        >
          <GraduationCap className="size-4" />
          Student path
        </Button>
        <Button
          type="button"
          variant={track === "teacher" ? "default" : "outline"}
          onClick={() => chooseTrack("teacher")}
          className="gap-2"
        >
          <Users className="size-4" />
          Teacher path
        </Button>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="space-y-3" aria-label="Tutorial steps">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const done = completed.includes(step.id);
            const active = step.id === activeStep.id;
            return (
              <Card
                key={step.id}
                className={cn(
                  "ui-lift overflow-hidden",
                  active && "border-primary/45 shadow-sm",
                  done && "bg-muted/35",
                )}
              >
                <CardContent className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5">
                  <button
                    type="button"
                    onClick={() => toggleStep(step.id)}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-md border text-muted-foreground transition-colors",
                      done
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:border-primary hover:text-primary",
                    )}
                    aria-label={`${done ? "Mark incomplete" : "Mark complete"}: ${step.title}`}
                  >
                    {done ? (
                      <Check className="size-5" />
                    ) : (
                      <Circle className="size-5" />
                    )}
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Step {index + 1}
                      </span>
                      <Badge variant="outline" className="gap-1">
                        <Icon className="size-3" />
                        {step.area}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {step.minutes} min
                      </span>
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-foreground">
                      {step.title}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {step.outcome}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant={active ? "default" : "outline"}
                    className="gap-2 sm:justify-self-end"
                    onClick={() => leaveTutorial(step.href)}
                  >
                    Open
                    <ArrowRight className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Play className="size-4 text-primary" />
                Current step
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {activeStep.title}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {activeStep.practice}
                </p>
              </div>
              <div className="space-y-2">
                {activeStep.details.map((detail) => (
                  <div
                    key={detail}
                    className="flex gap-2 text-sm leading-5 text-muted-foreground"
                  >
                    <MousePointer2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{detail}</span>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                className="w-full gap-2"
                onClick={() => leaveTutorial(activeStep.href)}
              >
                Try this now
                <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Next up</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {nextSteps.length ? (
                nextSteps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {step.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {step.area} · {step.minutes} min
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleStep(step.id)}
                    >
                      <Check className="size-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Tutorial complete. Use the dashboard to keep momentum going.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick habits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {QUICK_WINS.map((item) => (
                <div
                  key={item}
                  className="flex gap-2 text-sm leading-5 text-muted-foreground"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>

      <section className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-page-contrast">Ready to start?</p>
          <p className="text-sm text-page-contrast-muted">
            You can reopen this guide any time from Settings.
          </p>
        </div>
        <Button
          type="button"
          className="gap-2"
          onClick={() => leaveTutorial("/dashboard")}
        >
          Finish tutorial
          <ArrowRight className="size-4" />
        </Button>
      </section>
    </div>
  );
}
