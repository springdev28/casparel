import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  LayoutDashboard,
  LibraryBig,
  Rocket,
  Search,
  Sparkles,
  Target,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { useUpdateUserPreferences } from "../lib/user-preferences";

type Slide = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
  points: { icon: LucideIcon; text: string }[];
};

const SLIDES: Slide[] = [
  {
    icon: Sparkles,
    eyebrow: "Welcome",
    title: "Welcome to Casparel",
    body: "Your workspace for discovering great learning resources and turning them into real progress, whether you’re studying or teaching.",
    points: [
      { icon: Search, text: "Find and vet high-quality resources fast." },
      { icon: Target, text: "Turn goals into guided, resourced paths." },
      { icon: Users, text: "Run classes and share work with people." },
    ],
  },
  {
    icon: Search,
    eyebrow: "Discover",
    title: "Find the right resource",
    body: "Search the shared catalogue or let AI-assisted discovery suggest resources for any topic. Filter by source, format, subject, grade, and rating, and cite anything in a click.",
    points: [
      { icon: Search, text: "Keyword search with rich filters." },
      { icon: Sparkles, text: "AI discovery with provenance signals." },
      { icon: BookOpen, text: "Built-in citation maker." },
    ],
  },
  {
    icon: LibraryBig,
    eyebrow: "Organise",
    title: "Keep what matters",
    body: "Save resources to your library, group them into shareable lists, and attach them to goals so the next study step is always clear.",
    points: [
      { icon: LibraryBig, text: "Your library holds the resources you add." },
      { icon: Target, text: "Goals become step-by-step paths." },
      { icon: BookOpen, text: "Lists you can share with others." },
    ],
  },
  {
    icon: LayoutDashboard,
    eyebrow: "Study & teach",
    title: "Make progress, together",
    body: "Your dashboard adapts to your check-ins and points to the best next step. Teachers can create classes, assign work, and track completion.",
    points: [
      { icon: LayoutDashboard, text: "An adaptive next-best-step dashboard." },
      { icon: Users, text: "Classes, assignments, and schedules." },
      { icon: Check, text: "Quick check-ins that shape what’s next." },
    ],
  },
  {
    icon: Rocket,
    eyebrow: "You’re set",
    title: "Ready when you are",
    body: "That’s the core loop. You can replay this tour or open the complete guide any time from Settings.",
    points: [
      { icon: Compass, text: "Replay this tour from Settings → Product tour." },
      { icon: BookOpen, text: "Every feature is documented in the guide." },
    ],
  },
];

export default function TutorialPage() {
  const [, setLocation] = useLocation();
  const [index, setIndex] = useState(0);
  const updatePreferences = useUpdateUserPreferences();

  const slide = SLIDES[index];
  const isFirst = index === 0;
  const isLast = index === SLIDES.length - 1;
  const Icon = slide.icon;

  function finish() {
    // Best-effort, the tour should never trap someone if saving is briefly
    // unavailable, so we navigate regardless of the request outcome.
    updatePreferences.mutate({ tutorialSeen: true });
    setLocation("/dashboard");
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <div className="w-full max-w-xl">
        <div className="relative overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute right-2 top-2 z-10"
            onClick={finish}
            aria-label="Skip the tour"
            title="Skip the tour"
          >
            <X className="size-5" />
          </Button>

          <div className="p-6 sm:p-8">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary-text">
              <Icon className="size-6" />
            </span>

            <Badge variant="secondary" className="mt-5 gap-1.5">
              <Compass className="size-3.5" />
              {slide.eyebrow}
            </Badge>

            <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
              {slide.title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
              {slide.body}
            </p>

            <ul className="mt-5 space-y-2.5">
              {slide.points.map((point) => {
                const PointIcon = point.icon;
                return (
                  <li key={point.text} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary-text">
                      <PointIcon className="size-4" />
                    </span>
                    <span className="text-sm text-foreground/90">
                      {point.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-end gap-3 border-t bg-background/40 px-6 py-4 sm:px-8">
            <div className="flex items-center gap-2">
              {!isFirst && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setIndex((current) => current - 1)}
                >
                  <ArrowLeft className="size-4" /> Back
                </Button>
              )}
              {isLast ? (
                <Button type="button" size="sm" className="gap-1.5" onClick={finish}>
                  <Rocket className="size-4" /> Get started
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setIndex((current) => current + 1)}
                >
                  Next <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          You can revisit this any time from{" "}
          <Link href="/settings" className="font-medium text-primary-text hover:underline">
            Settings
          </Link>
          , or read the{" "}
          <Link href="/guide" className="font-medium text-primary-text hover:underline">
            complete guide
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
