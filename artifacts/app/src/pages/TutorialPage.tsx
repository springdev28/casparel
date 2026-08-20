import { useState, type CSSProperties } from "react";
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

  /*
   * This page paints its own surface, so it declares its own text colours.
   *
   * It renders inside AppShell, which layers the ambient effect over the
   * background and then picks text colours for that effect -- near-white body
   * text, because it expects a dark composite behind it. The opaque
   * bg-background below covers the ambient completely, so those near-white
   * colours landed on a near-white surface: the line under this card measured
   * 1.09:1, which is invisible, on the first screen a new account ever sees.
   *
   * Removing the background instead was tried and is worse. It fixes the body
   * text (1.09 to 4.53) and breaks the links, which are --primary-text and
   * tuned for a light surface: over the mesh they measure 1.65, and the
   * lightness that would fix them is so close to white that a link stops
   * looking like one. A mid-tone backdrop simply has no room for both.
   *
   * So the surface stays and the tokens come with it. These are the values the
   * shell itself uses when there is no ambient to allow for, which is exactly
   * this page's situation.
   */
  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center bg-background p-4"
      style={
        {
          "--foreground": "225 21.1% 7.5%",
          "--muted-foreground": "0 0% 28%",
        } as CSSProperties
      }
    >
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

        {/*
          Two whole link labels rather than one sentence with two links inside
          it. Written as a sentence, this reached the bridge as the fragments
          "You can revisit this any time from", ", or read the" and "complete
          guide" -- three pieces that happen to reassemble in Spanish and do
          not in German, where the verb belongs at the end. A sentence split by
          an interpolation cannot be translated; a label can.
        */}
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground">
          <Link href="/settings" className="font-medium text-primary-text hover:underline">
            Replay this tour from Settings
          </Link>
          <Link href="/guide" className="font-medium text-primary-text hover:underline">
            Read the complete guide
          </Link>
        </p>
      </div>
    </div>
  );
}
