import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  BookOpen,
  Calendar,
  Compass,
  GalleryVerticalEnd,
  Globe,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  List,
  MessageCircle,
  MessagesSquare,
  Quote,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Input } from "@workspace/edu-ds/components/ui/input";

/**
 * The Casparel guide, a complete, maintained reference to every feature.
 *
 * ▸ HOW TO KEEP THIS CURRENT (this is the "updates with every update" part):
 *   1. Bump GUIDE_VERSION and add a CHANGELOG entry describing what changed,
 *      in user-facing terms, with each release.
 *   2. When a feature is added or changed, edit the matching SECTIONS entry
 *      (or add a new one) so the reference always matches the shipped app.
 * Keeping both in this one file means the guide and the "What's new" list move
 * together with the product.
 */

const GUIDE_VERSION = "1.4.0";

type ChangeEntry = {
  version: string;
  date: string;
  changes: string[];
};

const CHANGELOG: ChangeEntry[] = [
  {
    version: "1.4.0",
    date: "August 2026",
    changes: [
      "New: this complete guide, plus a replayable product tour, both from Settings.",
      "Your Library now shows only the resources you added, and Remove appears only on resources you can actually remove.",
      "Faster first load and a self-hosted display font; search filters and the sign-in screens are more screen-reader friendly.",
      "Sign-in and registration now have a show/hide password control, and new passwords need at least 8 characters.",
    ],
  },
  {
    version: "1.3.0",
    date: "August 2026",
    changes: [
      "Adaptive dashboard: a learning journey that adapts from your check-ins, with a next-best-step and an evidence map.",
      "Resource workflow: verify a source, save it, build an activity, and share it to a class as guided steps.",
    ],
  },
];

type GuideItem = { title: string; desc: string };
type GuideSection = {
  id: string;
  title: string;
  icon: LucideIcon;
  blurb: string;
  items: GuideItem[];
};

const SECTIONS: GuideSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    icon: Compass,
    blurb:
      "Create an account, pick how Casparel speaks to you, and find your way around.",
    items: [
      {
        title: "Accounts & roles",
        desc: "Register as a student or teacher. Teachers unlock classes, assignments, and Google Classroom import; both roles can discover, save, and organise resources.",
      },
      {
        title: "Browse without an account",
        desc: "Anyone can use the resource search and citation maker before signing up, the value is visible up front.",
      },
      {
        title: "Languages",
        desc: "The interface ships in English, Spanish, French, German, Portuguese, and Turkish. Pick your language on the sign-in screen or in Settings.",
      },
      {
        title: "The product tour",
        desc: "New accounts open a short guided tour of the core workflow. Replay it any time from Settings → Product tour.",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    blurb: "Your adaptive learning journey and the single best next step.",
    items: [
      {
        title: "Learning journey",
        desc: "The dashboard adapts to your recent reflections and surfaces the most useful next action for your active goal.",
      },
      {
        title: "Continue workflow",
        desc: "Resume unfinished learning work, pick up a resource, activity, or assignment from where you left off, on any device.",
      },
      {
        title: "Quick check-in",
        desc: "A one-tap confidence check (Not yet / Almost / I can) that shapes what the dashboard recommends next.",
      },
      {
        title: "Learning evidence map",
        desc: "A running picture of the concepts, check-ins, and study you have accumulated toward a goal.",
      },
    ],
  },
  {
    id: "resources",
    title: "Resources & search",
    icon: Search,
    blurb:
      "Discover high-quality learning resources and turn any of them into a citation.",
    items: [
      {
        title: "Search",
        desc: "Search across the shared catalogue by keyword. Refine with filters for source, language, format, subject, grade, rating, and sort order.",
      },
      {
        title: "AI-assisted discovery",
        desc: "Ask for a topic and Casparel suggests high-quality educational resources, with provenance signals so you can judge the source.",
      },
      {
        title: "Advanced filters",
        desc: "Narrow further by exact phrase, excluded words, source domain, date added, minimum reviews, thumbnail, difficulty, access type, license, length, captions, and transcripts.",
      },
      {
        title: "Citation maker",
        desc: "Generate a formatted citation for any resource without leaving the page.",
      },
      {
        title: "Save to your library",
        desc: "Add a resource to your library to review, cite, assign, or build on later.",
      },
    ],
  },
  {
    id: "resource-pages",
    title: "Resource pages & workflow",
    icon: Workflow,
    blurb:
      "Everything you can do with a single resource, as a guided sequence.",
    items: [
      {
        title: "Guided workflow",
        desc: "Verify the source, save it to a list, create an activity, then share it to a class or turn it into an assignment, tracked as steps.",
      },
      {
        title: "Verify source",
        desc: "A free source check summarises trust signals (institution, author, domain) before you rely on a resource.",
      },
      {
        title: "Reviews & ratings",
        desc: "Rate a resource and read others' reviews to gauge quality and fit.",
      },
      {
        title: "Inline preview",
        desc: "YouTube, Vimeo, Loom, Google Drive videos, and PDFs preview directly on the resource page.",
      },
      {
        title: "Recommend & assign",
        desc: "Recommend a resource to a person or class, or assign it as classwork (teachers).",
      },
    ],
  },
  {
    id: "library",
    title: "Library",
    icon: LibraryBig,
    blurb: "The resources you have added, in one place.",
    items: [
      {
        title: "Your resources",
        desc: "The library shows the resources you submitted or saved, not the whole catalogue. Browse the full catalogue from Search instead.",
      },
      {
        title: "Open, cite, assign, remove",
        desc: "Act on any of your resources directly from the library grid. Remove is available on resources you added.",
      },
    ],
  },
  {
    id: "goals",
    title: "Goals & paths",
    icon: Target,
    blurb: "Turn an intention into a concrete, resourced learning path.",
    items: [
      {
        title: "Learning goals",
        desc: "Name a skill you want to build, set a level and preferred formats, and Casparel shapes it into a path.",
      },
      {
        title: "Paths",
        desc: "A path breaks a goal into ordered steps so the next action is always visible; track completion as you go.",
      },
      {
        title: "Choose study resources",
        desc: "Attach resources from your library to a goal to keep studying toward it.",
      },
      {
        title: "Evidence",
        desc: "Check-ins and completed study accumulate as evidence of mastery for each goal.",
      },
    ],
  },
  {
    id: "classes",
    title: "Classes & assignments",
    icon: Users,
    blurb: "For teachers: run a class, assign work, and track completion.",
    items: [
      {
        title: "Create or join",
        desc: "Teachers create a class; students join with a class code.",
      },
      {
        title: "Assignments",
        desc: "Assign a resource or activity as classwork and follow completion across students.",
      },
      {
        title: "Seating chart",
        desc: "Arrange a class visually with the seating chart editor.",
      },
      {
        title: "Google Classroom import",
        desc: "Connect Google to import a course and its roster (teacher, one-time connect).",
      },
    ],
  },
  {
    id: "lists",
    title: "Lists",
    icon: List,
    blurb: "Group resources into named, shareable collections.",
    items: [
      {
        title: "Create lists",
        desc: "Organise resources into lists for a topic, unit, or project.",
      },
      {
        title: "Share",
        desc: "Share a list so others can view the collection you have curated.",
      },
    ],
  },
  {
    id: "schedule",
    title: "Schedule & study sessions",
    icon: Calendar,
    blurb: "Plan when the work happens and keep it beside your calendar.",
    items: [
      {
        title: "Schedule blocks",
        desc: "Lay out blocks of time for study and classes on your schedule.",
      },
      {
        title: "Study sessions",
        desc: "Track focused study sessions against your goals and resources.",
      },
      {
        title: "Google Calendar sync",
        desc: "Connect Google Calendar to keep your Casparel schedule in step with your calendar.",
      },
    ],
  },
  {
    id: "activities",
    title: "Activities",
    icon: Activity,
    blurb: "Build reusable learning activities from a resource.",
    items: [
      {
        title: "Create",
        desc: "Turn a resource into a structured activity for yourself or a class.",
      },
      {
        title: "Remix",
        desc: "Start from an existing activity and adapt it to your needs.",
      },
      {
        title: "Share",
        desc: "Share an activity via a link or to a class.",
      },
    ],
  },
  {
    id: "canvas",
    title: "Canvas",
    icon: GalleryVerticalEnd,
    blurb: "A collaborative canvas for mapping and planning.",
    items: [
      {
        title: "Build a canvas",
        desc: "Lay out ideas, resources, and connections on a free-form canvas.",
      },
      {
        title: "Share",
        desc: "Share a canvas with a link so others can view your work.",
      },
    ],
  },
  {
    id: "community",
    title: "Forum, People & Messages",
    icon: MessagesSquare,
    blurb: "Discuss, connect, and share directly with other members.",
    items: [
      {
        title: "Forum & Catalog",
        desc: "Join discussions in the forum and browse the community resource catalogue.",
      },
      {
        title: "People & profiles",
        desc: "Find other members, view their public profile, and recommend resources to them.",
      },
      {
        title: "Direct messages",
        desc: "Message people directly. Control who can start a conversation with the message-requests setting.",
      },
    ],
  },
  {
    id: "profile-settings",
    title: "Profile & Settings",
    icon: SettingsIcon,
    blurb: "Make Casparel yours and manage how it looks and communicates.",
    items: [
      {
        title: "Profile & privacy",
        desc: "Edit your bio, subjects, website, and avatar, and set who can see each part of your profile and library.",
      },
      {
        title: "Appearance",
        desc: "Customise the interface palette and readable contrast, and choose an animated background style and intensity.",
      },
      {
        title: "Language & messages",
        desc: "Change the interface language and decide whether people you have not added can request a conversation.",
      },
      {
        title: "Tour & guide",
        desc: "Replay the product tour or open this guide any time from Settings.",
      },
    ],
  },
  {
    id: "citations",
    title: "Citations",
    icon: Quote,
    blurb: "Turn any resource into a formatted reference.",
    items: [
      {
        title: "Cite anything",
        desc: "Generate a citation from a resource card or its page, ready to paste into your work.",
      },
    ],
  },
  {
    id: "accessibility",
    title: "Accessibility & languages",
    icon: Globe,
    blurb: "Built to be usable by everyone, in your language.",
    items: [
      {
        title: "Screen-reader support",
        desc: "Form fields and search controls carry accessible labels, and pages use a clear heading structure.",
      },
      {
        title: "Contrast & motion",
        desc: "Tune contrast in appearance settings, and reduced-motion preferences are respected.",
      },
      {
        title: "Six languages",
        desc: "Use Casparel in English, Spanish, French, German, Portuguese, or Turkish.",
      },
    ],
  },
  {
    id: "admin",
    title: "Administration",
    icon: ShieldCheck,
    blurb: "For administrators: keep the community healthy.",
    items: [
      {
        title: "Admin panel",
        desc: "Administrators get an Admin area to manage accounts and moderate the platform.",
      },
    ],
  },
];

export default function GuidePage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.map((section) => {
      const sectionMatches =
        section.title.toLowerCase().includes(q) ||
        section.blurb.toLowerCase().includes(q);
      const items = section.items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.desc.toLowerCase().includes(q),
      );
      if (sectionMatches) return section;
      if (items.length) return { ...section, items };
      return null;
    }).filter((section): section is GuideSection => section !== null);
  }, [query]);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-page-contrast sm:text-3xl">
            Casparel guide
          </h1>
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="size-3.5" /> v{GUIDE_VERSION}
          </Badge>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-page-contrast-muted">
          A complete reference to every feature in Casparel, kept up to date
          with each release. New here?{" "}
          <Link href="/tutorial" className="font-medium text-primary hover:underline">
            Take the guided tour
          </Link>
          .
        </p>
      </header>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the guide…"
          className="pl-9"
          aria-label="Search the guide"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <div className="order-2 min-w-0 space-y-6 lg:order-1">
          {/* What's new */}
          <section
            id="whats-new"
            className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm"
          >
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <h2 className="text-lg font-semibold">What’s new</h2>
            </div>
            <div className="space-y-5">
              {CHANGELOG.map((entry) => (
                <div key={entry.version}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold">v{entry.version}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.date}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {entry.changes.map((change, index) => (
                      <li
                        key={index}
                        className="flex gap-2 text-sm text-muted-foreground"
                      >
                        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Feature sections */}
          {filtered.map((section) => {
            const Icon = section.icon;
            return (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-20 rounded-lg border bg-card p-5 text-card-foreground shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{section.title}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {section.blurb}
                    </p>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {section.items.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-md border bg-background/40 p-3"
                    >
                      <dt className="text-sm font-semibold">{item.title}</dt>
                      <dd className="mt-1 text-sm text-muted-foreground">
                        {item.desc}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-lg border bg-card p-10 text-center text-card-foreground shadow-sm">
              <BookOpen className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">No matches</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different term, or clear the search to see everything.
              </p>
            </div>
          )}
        </div>

        {/* Contents */}
        <nav
          aria-label="Guide contents"
          className="order-1 lg:order-2 lg:sticky lg:top-6"
        >
          <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <GraduationCap className="size-4" /> Contents
            </p>
            <ul className="space-y-0.5">
              <li>
                <a
                  href="#whats-new"
                  className="block rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  What’s new
                </a>
              </li>
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" size="sm" className="mt-3 w-full gap-2">
              <Link href="/tutorial">
                <Compass className="size-4" /> Replay the tour
              </Link>
            </Button>
          </div>
        </nav>
      </div>
    </div>
  );
}
