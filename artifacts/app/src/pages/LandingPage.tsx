/**
 * @fileOverview Web screen role: renders the Landing Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  AlertTriangle,
  Apple,
  ArrowRight,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Library,
  Monitor,
  Play,
  ScanSearch,
  Check,
  ShieldCheck,
  Sparkles,
  Users,
  UserRound,
} from "lucide-react";
import BrandIcon from "../components/BrandIcon";
import { useSystemDark } from "../hooks/use-system-dark";
import { readSessionClaims } from "../lib/session";
import { isDesktopShell } from "../lib/platform";
import { hasDownloads, orderedDownloadTargets } from "../lib/downloads";
import { useReveal } from "../lib/use-reveal";
import { LetterDrop } from "../components/LetterDrop";
import {
  useGetMe,
  getGetMeQueryKey,
  useListProvenanceShowcase,
  getListProvenanceShowcaseQueryKey,
} from "@workspace/api-client-react";
import { getInitialLanguage } from "../lib/auth-locale";

/**
 * A language code as a word, for the note on a source that is not in the
 * reader's. Only the six this product ships; anything else falls back to the
 * code itself, which is more honest than inventing a name for it.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  tr: "Turkish",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
};

/** What the product does. */
const CAPABILITIES = [
  {
    icon: Library,
    title: "A library worth trusting",
    body: "Browse a vetted catalog of open education drawn from Open Library, Wikibooks and other open sources. Every resource is free to open.",
  },
  {
    icon: CalendarDays,
    title: "Your studies, organised",
    body: "Classes, reading lists, schedules and study sessions in one place, with Google Calendar sync and an iCal feed so your plan lives where you already work.",
  },
  {
    icon: ScanSearch,
    title: "Research any source",
    body: "AI source research tells you who is behind a resource and how much to trust it: a quick check anytime, or deep live-web research on demand.",
  },
];

/**
 * Fallback examples for the hero's source-research card.
 *
 * The card shows real catalogue sources with their real verdicts (see
 * `useShowcaseSources` below) — the account's own saved resources when
 * someone is signed in, the platform's most-saved otherwise. These four are
 * only what it renders before that request answers, or when the catalogue has
 * nothing to show: a brand-new deployment, or a visitor on a cold cache.
 *
 * They stay because a hero that starts empty is worse than one that starts
 * illustrative. They are clearly illustrative copy, not live output: named
 * organisations carry only claims that are publicly true of them, and the
 * cautionary example names nobody.
 */
const SOURCE_EXAMPLES = [
  {
    name: "MIT OpenCourseWare",
    kind: "University · open courseware",
    verdict: "High trust",
    tone: "high" as const,
    summary:
      "Published by a major research university, openly licensed, and maintained with course materials from the original faculty.",
    signals: [
      "Primary source, not a re-upload",
      "Openly licensed for reuse",
      "Reviewed before listing",
    ],
  },
  {
    name: "Khan Academy",
    kind: "Nonprofit learning platform",
    verdict: "High trust",
    tone: "high" as const,
    summary:
      "An established nonprofit publisher with a long public track record of original lessons and named authorship.",
    signals: [
      "Original lessons by a named organisation",
      "Established publishing platform",
      "Free to use",
    ],
  },
  {
    name: "Wikibooks",
    kind: "Community textbooks · Wikimedia",
    verdict: "Community, check history",
    tone: "community" as const,
    summary:
      "Openly licensed textbooks written in public. Quality varies by book, and every change is logged, so the history shows what to double-check.",
    signals: [
      "Openly licensed for reuse",
      "Every edit is public and reversible",
      "Backed by the Wikimedia Foundation",
    ],
  },
  {
    name: "Anonymous study blog",
    kind: "Independent website · no named author",
    verdict: "Limited signals",
    tone: "limited" as const,
    summary:
      "No author, institution or licence is stated. It may still be useful, but nothing here can be verified, so treat its claims with care.",
    signals: [
      "No named author or institution",
      "Licence and sources not stated",
      "Availability not guaranteed",
    ],
  },
];

const VERDICT_STYLES = {
  high: {
    badge:
      "border-emerald-500/40 bg-emerald-500/10 text-success-text",
    signal: "text-success-text",
    BadgeIcon: ShieldCheck,
    SignalIcon: Check,
  },
  community: {
    badge: "border-sky-500/40 bg-sky-500/10 text-info-text",
    signal: "text-info-text",
    BadgeIcon: Users,
    SignalIcon: Check,
  },
  limited: {
    badge:
      "border-amber-500/40 bg-amber-500/10 text-warning-text",
    signal: "text-warning-text",
    BadgeIcon: AlertTriangle,
    SignalIcon: AlertTriangle,
  },
} as const;

/** How long each example holds before the card moves to the next. */
const SOURCE_EXAMPLE_MS = 4500;

type ShowcaseCard = (typeof SOURCE_EXAMPLES)[number];

/** How the server's provenance levels read on the card. */
const PROVENANCE_PRESENTATION = {
  institutional: { verdict: "High trust", tone: "high" as const },
  established: { verdict: "Established source", tone: "high" as const },
  independent: { verdict: "Independent, check it", tone: "community" as const },
  unknown: { verdict: "Limited signals", tone: "limited" as const },
} as const;

/**
 * Real sources for the hero card, with the built-in examples as the fallback.
 *
 * Signed-in visitors see their own saved resources judged; everyone else sees
 * the platform's most-saved. The endpoint is public, cheap and AI-free (the
 * provenance verdict is a deterministic registry check), and any failure or
 * empty catalogue simply leaves the built-in examples in place — the landing
 * page must never depend on this call to render.
 */
function useShowcaseSources(): {
  cards: ShowcaseCard[];
  personalised: boolean;
} {
  /*
   * The reader's language goes with the request.
   *
   * The hero once offered an English reader "İspanyolca" from
   * tr.wikibooks.org. The server now excludes known mismatches, and this
   * client-side check is deliberate defence in depth for stale caches or an
   * older server still answering during a deployment.
   */
  const language = getInitialLanguage();
  const { data } = useListProvenanceShowcase(
    { language },
    {
      query: {
        queryKey: getListProvenanceShowcaseQueryKey({ language }),
        staleTime: 5 * 60_000,
        retry: false,
      },
    },
  );

  const entries = (data?.entries ?? []).filter(
    (entry) => !entry.language || entry.language === language,
  );
  if (entries.length === 0) {
    return { cards: SOURCE_EXAMPLES, personalised: false };
  }
  return {
    personalised: data?.personalised === true,
    cards: entries.map((entry) => {
      const presentation =
        PROVENANCE_PRESENTATION[entry.provenanceLevel] ??
        PROVENANCE_PRESENTATION.unknown;
      const saves = entry.savedCount ?? 0;
      /*
       * Say so when a source is not in the reader's language.
       *
       * Null means the address did not establish one, which is not the same
       * as English -- so nothing is claimed for those. A known mismatch is
       * worth a word: it is the difference between a card that misleads and
       * one that is simply telling you what it found.
       */
      const otherLanguage =
        entry.language && entry.language !== language
          ? (LANGUAGE_NAMES[entry.language] ?? entry.language.toUpperCase())
          : null;
      return {
        name: entry.title,
        kind: [entry.host, entry.subject, otherLanguage]
          .filter(Boolean)
          .join(" · "),
        verdict: presentation.verdict,
        tone: presentation.tone,
        summary:
          saves > 1
            ? `Saved to ${saves} lists on Casparel. The checks below come from the source itself, not from how popular it is.`
            : "Checked against the source registry: who publishes it, how it is licensed, and how it is served.",
        signals: entry.provenanceSignals ?? [],
      };
    }),
  };
}

/**
 * Credentials, what earns a learner's trust. Deliberately capability claims
 * that are true of the product today, not invented usage numbers.
 */
const CREDENTIALS = [
  {
    metric: "Open Library · Wikibooks",
    title: "Open education at the core",
    body: "The catalog is built from established open-education providers, not scraped links.",
  },
  {
    metric: "Reviewed before listing",
    title: "Submissions are checked",
    body: "Community-submitted resources start unverified and are reviewed before they reach the library.",
  },
  {
    metric: "Trust, explained",
    title: "AI source research",
    body: "Every resource can be traced back to its publisher, with a credibility assessment and cited evidence.",
  },
  {
    metric: "Free forever",
    title: "The library stays open",
    body: "Access to learning materials is never paywalled. Free includes a taste of AI; Student and Teacher plans add room and larger AI allowances.",
  },
];

/** The icon that stands for each platform. */
const PLATFORM_ICONS = {
  ios: Apple,
  android: Play,
  desktop: Monitor,
} as const;

function DownloadButtons() {
  // Nobody needs to be told to download the app they are already running.
  if (isDesktopShell()) return null;

  if (!hasDownloads()) {
    return (
      <Button size="lg" disabled className="gap-2">
        <Apple className="size-4" />
        Coming to iOS &amp; Android
      </Button>
    );
  }

  // Most-likely platform first, and only that one gets the primary style: a
  // row of equally weighted buttons asks the visitor to work out which of
  // three things they are on.
  return (
    <div className="flex flex-wrap gap-2">
      {orderedDownloadTargets().map((target, index) => {
        const Icon = PLATFORM_ICONS[target.id];
        return (
          <Button
            key={target.id}
            size="lg"
            asChild
            variant={index === 0 ? "default" : "outline"}
            className="gap-2"
          >
            <a href={target.href} target="_blank" rel="noopener noreferrer">
              <Icon className="size-4" /> {target.label}
            </a>
          </Button>
        );
      })}
    </div>
  );
}

export default function LandingPage() {
  const dark = useSystemDark();
  const revealRef = useReveal<HTMLDivElement>();
  const signedIn = Boolean(readSessionClaims());
  // Only requested when there is a session to describe, so the landing page
  // stays a zero-request page for logged-out visitors.
  const { data: me } = useGetMe({
    query: { enabled: signedIn, queryKey: getGetMeQueryKey() },
  });
  // When there is no download to offer, "continue in browser" is the only
  // call to action, so it takes the primary style.
  const inDesktopShell = isDesktopShell();
  const hasDownload = !inDesktopShell && hasDownloads();
  // Someone already signed in does not need a sales pitch to get back to work.
  const continueHref = signedIn ? "/dashboard" : "/resources";
  const continueLabel = signedIn
    ? "Back to your dashboard"
    : inDesktopShell
      ? "Browse the library"
      : "Continue in browser";

  // The hero card cycles through real sources; a random start means even a
  // quick visit sees a different one than last time. The .rise class on the
  // swapped content is inert under prefers-reduced-motion, so the change is a
  // plain swap there rather than a movement.
  const { cards: sourceCards, personalised } = useShowcaseSources();
  const [exampleIndex, setExampleIndex] = useState(() =>
    Math.floor(Math.random() * SOURCE_EXAMPLES.length),
  );
  useEffect(() => {
    const timer = setInterval(
      () => setExampleIndex((index) => index + 1),
      SOURCE_EXAMPLE_MS,
    );
    return () => clearInterval(timer);
  }, []);
  // Wrapped at read time rather than in the timer: the list length changes
  // when the fetched sources replace the fallbacks, and a stored index past
  // the new end would blank the card for one interval.
  const example = sourceCards[exampleIndex % sourceCards.length];
  const verdictStyle = VERDICT_STYLES[example.tone];

  return (
    <div
      ref={revealRef}
      className={`${dark ? "dark " : ""}min-h-[100dvh] bg-background text-foreground`}
      style={{ colorScheme: dark ? "dark" : "light" }}
    >
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex min-w-0 items-center text-primary-text">
            <BrandIcon className="mr-2 h-8 w-8 shrink-0" />
            <span className="font-bold text-lg tracking-tight text-foreground">
              Casparel
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/resources">Browse</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/plans">Plans</Link>
            </Button>
            {signedIn ? (
              <Link
                href="/profile"
                className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 transition-colors hover:bg-muted"
                data-testid="landing-profile"
              >
                <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15">
                  {me?.avatarUrl ? (
                    <img
                      src={me.avatarUrl}
                      alt=""
                      className="size-7 rounded-full object-cover"
                    />
                  ) : (
                    <UserRound className="size-4 text-primary-text" />
                  )}
                </span>
                <span className="max-w-32 truncate text-sm font-medium">
                  {me?.name ?? "My profile"}
                </span>
              </Link>
            ) : (
              <Button size="sm" asChild data-testid="landing-login">
                <Link href="/auth/login">Log in</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-16 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center">
          <div>
          <p className="rise mb-4 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            <GraduationCap className="size-3.5 text-primary-text" />
            Built for students and teachers
          </p>
          {/* The h1 and the sentence under it are the product's key phrase, and
              they are deliberately the same words used in the page title, the
              meta description and the structured data. A visitor arriving from
              a search result should read the line they clicked, not a variation
              of it. */}
          <h1
            className="rise max-w-3xl text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            Knowledge is <span className="text-primary-text">treasure</span>.
          </h1>
          <p
            className="rise mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground"
            style={{ animationDelay: "160ms" }}
          >
            An intelligent education platform that brings classes, resources,
            research, planning, and progress into one connected workspace.
          </p>

          <div className="rise mt-9" style={{ animationDelay: "240ms" }}>
            <div className="flex flex-wrap items-center gap-3">
              <DownloadButtons />
              <Button
                size="lg"
                variant={hasDownload ? "outline" : "default"}
                asChild
                className="gap-2"
              >
                <Link href={continueHref}>
                  {continueLabel} <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {!hasDownload && !inDesktopShell
                ? "The mobile app is on its way. Everything works in your browser today. "
                : null}
              <Link
                href="/download"
                className="text-primary-text hover:underline"
              >
                {hasDownload ? "All download options" : "Where Casparel runs"}
              </Link>
              {" · "}
              <Link href="/plans" className="text-primary-text hover:underline">
                See plans and pricing
              </Link>
            </p>
          </div>
          </div>

          {/* A concrete look at the feature the headline promises. */}
          <div
            className="rise rounded-2xl border border-border bg-card p-5 shadow-sm lg:mt-0"
            style={{ animationDelay: "320ms" }}
            aria-hidden="true"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
              <span className="flex items-center gap-2">
                <ScanSearch className="size-4 text-primary-text" />
                <span className="text-sm font-semibold">
                  {personalised ? "From your saved sources" : "AI source research"}
                </span>
              </span>
              {/* Progress dots, so the card visibly holds more than one answer. */}
              <span className="flex items-center gap-1">
                {sourceCards.map((card, index) => (
                  <span
                    key={card.name}
                    className={
                      "size-1.5 rounded-full transition-colors " +
                      (index === exampleIndex % sourceCards.length
                        ? "bg-primary"
                        : "bg-border")
                    }
                  />
                ))}
              </span>
            </div>
            {/* Keyed on the example so each swap replays the entry animation;
                min-height covers the tallest example so the hero never jumps. */}
            <div key={example.name} className="rise min-h-[13.5rem]">
              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{example.name}</p>
                  <p className="text-xs text-muted-foreground">{example.kind}</p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${verdictStyle.badge}`}
                >
                  <verdictStyle.BadgeIcon className="size-3" /> {example.verdict}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {example.summary}
              </p>
              <div className="mt-4 space-y-2">
                {example.signals.map((line) => (
                  <p
                    key={line}
                    className="flex items-start gap-2 text-xs text-muted-foreground"
                  >
                    <verdictStyle.SignalIcon
                      className={`mt-0.5 size-3.5 shrink-0 ${verdictStyle.signal}`}
                    />
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* What it does */}
        <section className="border-t border-border bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="reveal text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              What you get
            </h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {CAPABILITIES.map(({ icon: Icon, title, body }, index) => (
                <div
                  key={title}
                  data-reveal-delay={index * 90}
                  className="reveal card-lift rounded-xl border border-border bg-card p-6"
                >
                  <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="size-5 text-primary-text" />
                  </div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Credentials */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="reveal text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Why you can trust it
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {CREDENTIALS.map(({ metric, title, body }, index) => (
                <div
                  key={title}
                  data-reveal-delay={index * 80}
                  className="reveal card-lift rounded-xl border border-border bg-card p-6"
                >
                  <p className="text-lg font-semibold text-primary-text">{metric}</p>
                  <h3 className="mt-2 font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-border bg-muted/30">
          <div className="reveal mx-auto max-w-3xl px-4 py-16 text-center">
            <Sparkles className="mx-auto size-6 text-primary-text" />
            <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight">
              Start with one good source.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Browse the library without an account. Sign up when you want to
              save resources, join a class, or plan your week.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" asChild className="gap-2">
                <Link href="/resources">
                  <BookOpen className="size-4" /> Browse the library
                </Link>
              </Button>
              {!signedIn ? (
                <Button size="lg" variant="outline" asChild className="gap-2">
                  <Link href="/auth/register">
                    <Users className="size-4" /> Create a free account
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <LetterDrop />
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary-text" />
            The library is free. Plus and Pro add optional AI tools, not access.
          </p>
          {/* Legal pages must be reachable before sign-in: app-store reviewers
              and visitors deciding whether to register both start here. */}
          <nav
            aria-label="Legal and support"
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            <Link
              href="/privacy"
              className="font-medium text-primary-text hover:underline"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="font-medium text-primary-text hover:underline"
            >
              Terms of Service
            </Link>
            <Link
              href="/support"
              className="font-medium text-primary-text hover:underline"
            >
              Support
            </Link>
            <Link
              href="/delete-account"
              className="font-medium text-primary-text hover:underline"
            >
              Delete account
            </Link>
            <Link
              href="/reset-account"
              className="font-medium text-primary-text hover:underline"
            >
              Reset account
            </Link>
          </nav>
          <p>© {new Date().getFullYear()} Casparel</p>
        </div>
      </footer>
    </div>
  );
}
