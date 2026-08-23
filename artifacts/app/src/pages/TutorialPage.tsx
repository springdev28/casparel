/**
 * @fileOverview Web screen role: prepares a resumable first learning task and hands it into the real resource workflow.
 * System connection: mounted from App.tsx; persists a local draft, updates account tutorial state, and launches Resources onboarding.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  LibraryBig,
  ListChecks,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { firstRunResourcePath } from "../lib/resource-onboarding";
import {
  parseTutorialDraft,
  TUTORIAL_DRAFT_KEY,
  TUTORIAL_STEP_COUNT,
  tutorialProgressPercent,
} from "../lib/tutorial-state";
import { useUpdateUserPreferences } from "../lib/user-preferences";

const WORKFLOW = [
  { icon: Search, label: "Find", detail: "Search for a real topic or skill." },
  { icon: ShieldCheck, label: "Verify", detail: "Check who made it and what the source can prove." },
  { icon: LibraryBig, label: "Save", detail: "Keep the useful resource in your library." },
  { icon: ListChecks, label: "Organize", detail: "Place it in an ordered Learning List." },
  { icon: Target, label: "Study", detail: "Turn the list into a focused path." },
  { icon: Check, label: "Prove", detail: "Record reflection and evidence of progress." },
] as const;

export default function TutorialPage() {
  const [, setLocation] = useLocation();
  const [draft, setDraft] = useState(() => {
    if (typeof window === "undefined") return parseTutorialDraft(null);
    return parseTutorialDraft(window.localStorage.getItem(TUTORIAL_DRAFT_KEY));
  });
  const updatePreferences = useUpdateUserPreferences();
  const normalizedNeed = draft.learningNeed.trim();
  const progress = tutorialProgressPercent(draft.step);

  useEffect(() => {
    // Persist on every meaningful edit so browser reload/back navigation
    // returns to the exact task and step instead of restarting the slideshow.
    window.localStorage.setItem(TUTORIAL_DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  function markSeen() {
    // Account sync is best-effort: tutorial controls must never trap someone
    // because preferences are temporarily unavailable.
    updatePreferences.mutate({ tutorialSeen: true });
  }

  function clearDraft() {
    window.localStorage.removeItem(TUTORIAL_DRAFT_KEY);
  }

  function skip() {
    markSeen();
    clearDraft();
    setLocation("/dashboard");
  }

  function startRealTask() {
    if (!normalizedNeed) return;
    markSeen();
    clearDraft();
    // Resources owns search, source review, saving, and activation analytics;
    // the tutorial only supplies a safe prefilled learning need.
    setLocation(firstRunResourcePath(normalizedNeed));
  }

  function move(step: number) {
    setDraft((current) => ({ ...current, step }));
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-3xl">
        <section className="relative overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute right-2 top-2 z-10"
            onClick={skip}
            aria-label="Skip the tutorial"
            title="Skip the tutorial"
          >
            <X className="size-5" />
          </Button>

          <header className="border-b px-6 pb-4 pt-6 sm:px-8">
            <div className="flex items-center justify-between gap-4 pr-9">
              <Badge variant="secondary" className="gap-1.5">
                <Compass className="size-3.5" /> Guided first task
              </Badge>
              <span className="text-xs font-medium text-muted-foreground">
                Step {draft.step + 1} of {TUTORIAL_STEP_COUNT}
              </span>
            </div>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Tutorial progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          </header>

          <div className="min-h-[25rem] p-6 sm:p-8">
            {draft.step === 0 ? (
              <div className="mx-auto max-w-xl">
                <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary-text">
                  <Sparkles className="size-6" />
                </span>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-primary-text">
                  Begin with something real
                </p>
                <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
                  What do you need to learn or teach right now?
                </h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                  Use a genuine topic, question, or skill. Casparel will carry it into Search; this tutorial will not create sample progress or fake data.
                </p>
                <label className="mt-6 block text-sm font-medium" htmlFor="tutorial-learning-need">
                  Learning need
                </label>
                <Input
                  id="tutorial-learning-need"
                  className="mt-2 h-12 text-base"
                  value={draft.learningNeed}
                  maxLength={300}
                  autoFocus
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, learningNeed: event.target.value }))
                  }
                  placeholder="For example: understand derivatives from scratch"
                  data-testid="tutorial-learning-need"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Saved only as a local tutorial draft until you launch Search.
                </p>
              </div>
            ) : null}

            {draft.step === 1 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-text">
                  The complete loop
                </p>
                <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
                  A resource is the beginning, not the finish
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  For <strong className="text-foreground">{normalizedNeed}</strong>, Casparel connects six real product actions. You can stop after saving, or continue into a learning path when it is useful.
                </p>
                <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {WORKFLOW.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.label} className="rounded-lg border bg-background/50 p-4">
                        <div className="flex items-center gap-2">
                          <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary-text">
                            <Icon className="size-4" />
                          </span>
                          <span className="text-sm font-semibold">{index + 1}. {item.label}</span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}

            {draft.step === 2 ? (
              <div className="mx-auto max-w-xl text-center">
                <span className="mx-auto flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary-text">
                  <Search className="size-7" />
                </span>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-primary-text">
                  Do the real task
                </p>
                <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
                  Find your first useful resource
                </h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                  Search will open with <strong className="text-foreground">{normalizedNeed}</strong> ready. Choose a result, inspect its source information, and save only what is genuinely useful.
                </p>
                <div className="mt-6 rounded-lg border bg-background/50 p-4 text-left">
                  <p className="text-sm font-semibold">Your activation checklist</p>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <li className="flex gap-2"><Search className="mt-0.5 size-4 shrink-0 text-primary-text" /> Run the prefilled search.</li>
                    <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary-text" /> Check source provenance and limitations.</li>
                    <li className="flex gap-2"><BookOpen className="mt-0.5 size-4 shrink-0 text-primary-text" /> Save one useful result; that completes activation.</li>
                  </ul>
                </div>
              </div>
            ) : null}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-background/40 px-6 py-4 sm:px-8">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              disabled={draft.step === 0}
              onClick={() => move(draft.step - 1)}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
            {draft.step < TUTORIAL_STEP_COUNT - 1 ? (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={!normalizedNeed}
                onClick={() => move(draft.step + 1)}
              >
                Continue <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={!normalizedNeed}
                onClick={startRealTask}
                data-testid="tutorial-start-search"
              >
                Start the real search <Search className="size-4" />
              </Button>
            )}
          </footer>
        </section>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Skip now and replay this from <Link href="/settings" className="font-medium text-primary-text hover:underline">Settings</Link>, or open the <Link href="/guide" className="font-medium text-primary-text hover:underline">complete guide</Link>.
        </p>
      </div>
    </main>
  );
}
