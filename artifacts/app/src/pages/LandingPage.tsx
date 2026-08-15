import { Link } from "wouter";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
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
import { useReveal } from "../lib/use-reveal";
import { LetterDrop } from "../components/LetterDrop";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

/**
 * Public store listings. Left null until the apps are actually live, a dead
 * link on the landing page is worse than an honest "coming soon".
 */
const IOS_APP_URL: string | null = null;
const ANDROID_APP_URL: string | null = null;
const STORES_LIVE = Boolean(IOS_APP_URL || ANDROID_APP_URL);

/**
 * Desktop builds (macOS, Windows, Linux) come from the repository's releases.
 * Same rule as the stores: null until there is something real behind it.
 */
const DESKTOP_DOWNLOAD_URL: string | null = null;

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
    body: "Access to learning materials is never paywalled. Free includes a daily taste of AI; Student and Teacher plans add room and larger AI allowances.",
  },
];

function DownloadButtons() {
  // Nobody needs to be told to download the app they are already running.
  if (isDesktopShell()) return null;

  if (!STORES_LIVE && !DESKTOP_DOWNLOAD_URL) {
    return (
      <Button size="lg" disabled className="gap-2">
        <Apple className="size-4" />
        Coming to iOS &amp; Android
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {DESKTOP_DOWNLOAD_URL ? (
        <Button size="lg" asChild className="gap-2">
          <a
            href={DESKTOP_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Monitor className="size-4" /> Download for desktop
          </a>
        </Button>
      ) : null}
      {IOS_APP_URL ? (
        <Button size="lg" asChild className="gap-2">
          <a href={IOS_APP_URL} target="_blank" rel="noopener noreferrer">
            <Apple className="size-4" /> Download for iPhone
          </a>
        </Button>
      ) : null}
      {ANDROID_APP_URL ? (
        <Button size="lg" variant="outline" asChild className="gap-2">
          <a href={ANDROID_APP_URL} target="_blank" rel="noopener noreferrer">
            <Play className="size-4" /> Get it on Google Play
          </a>
        </Button>
      ) : null}
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
  const hasDownload =
    !inDesktopShell && (STORES_LIVE || Boolean(DESKTOP_DOWNLOAD_URL));
  // Someone already signed in does not need a sales pitch to get back to work.
  const continueHref = signedIn ? "/dashboard" : "/resources";
  const continueLabel = signedIn
    ? "Back to your dashboard"
    : inDesktopShell
      ? "Browse the library"
      : "Continue in browser";

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
          <h1
            className="rise max-w-3xl text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            Good learning starts with{" "}
            <span className="text-primary-text">sources you can trust</span>.
          </h1>
          <p
            className="rise mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground"
            style={{ animationDelay: "160ms" }}
          >
            Casparel is a free, vetted library of open education, with the
            classes, schedules and study tools to actually get through it, and
            AI that tells you who is behind any source before you rely on it.
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
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <ScanSearch className="size-4 text-primary-text" />
              <span className="text-sm font-semibold">AI source research</span>
            </div>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">MIT OpenCourseWare</p>
                <p className="text-xs text-muted-foreground">
                  University · open courseware
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="size-3" /> High trust
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Published by a major research university, openly licensed, and
              maintained with course materials from the original faculty.
            </p>
            <div className="mt-4 space-y-2">
              {[
                "Primary source, not a re-upload",
                "Openly licensed for reuse",
                "Reviewed before listing",
              ].map((line) => (
                <p
                  key={line}
                  className="flex items-start gap-2 text-xs text-muted-foreground"
                >
                  <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {line}
                </p>
              ))}
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
          <p>© {new Date().getFullYear()} Casparel</p>
        </div>
      </footer>
    </div>
  );
}
