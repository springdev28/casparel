import { Link } from "wouter";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Apple,
  ArrowRight,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Library,
  Play,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import BrandIcon from "../components/BrandIcon";
import { useSystemDark } from "../hooks/use-system-dark";
import { readSessionClaims } from "../lib/session";
import { useReveal } from "../lib/use-reveal";

/**
 * Public store listings. Left null until the apps are actually live — a dead
 * link on the landing page is worse than an honest "coming soon".
 */
const IOS_APP_URL: string | null = null;
const ANDROID_APP_URL: string | null = null;
const STORES_LIVE = Boolean(IOS_APP_URL || ANDROID_APP_URL);

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
    body: "Classes, reading lists, schedules and study sessions in one place — with Google Calendar sync and an iCal feed so your plan lives where you already work.",
  },
  {
    icon: ScanSearch,
    title: "Research any source",
    body: "AI source research tells you who is behind a resource and how much to trust it — a quick check anytime, or deep live-web research on demand.",
  },
];

/**
 * Credentials — what earns a learner's trust. Deliberately capability claims
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
    body: "Access to learning materials is never paywalled. Premium covers unlimited AI research, not access.",
  },
];

function DownloadButtons() {
  if (!STORES_LIVE) {
    return (
      <div className="flex flex-col items-center gap-2 sm:items-start">
        <Button size="lg" disabled className="gap-2">
          <Apple className="size-4" />
          Coming to iOS &amp; Android
        </Button>
        <p className="text-xs text-muted-foreground">
          The mobile app is on its way. Everything works in your browser today.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
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
  // Someone already signed in does not need a sales pitch to get back to work.
  const continueHref = signedIn ? "/dashboard" : "/resources";
  const continueLabel = signedIn ? "Back to your dashboard" : "Continue in browser";

  return (
    <div
      ref={revealRef}
      className={`${dark ? "dark " : ""}min-h-[100dvh] bg-background text-foreground`}
      style={{ colorScheme: dark ? "dark" : "light" }}
    >
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex min-w-0 items-center text-primary">
            <BrandIcon className="mr-2 h-8 w-8 shrink-0" label="Casparel" />
            <span className="font-bold text-lg tracking-tight text-foreground">
              Casparel
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/resources">Browse</Link>
            </Button>
            {signedIn ? (
              <Button size="sm" asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/auth/login">Sign in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/auth/register">Create account</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:pt-24">
          <p className="rise mb-4 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            <GraduationCap className="size-3.5 text-primary" />
            Built for students and teachers
          </p>
          <h1
            className="rise max-w-3xl text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            Good learning starts with{" "}
            <span className="text-primary">sources you can trust</span>.
          </h1>
          <p
            className="rise mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground"
            style={{ animationDelay: "160ms" }}
          >
            Casparel is a free, vetted library of open education — with the
            classes, schedules and study tools to actually get through it, and
            AI that tells you who is behind any source before you rely on it.
          </p>

          <div
            className="rise mt-9 flex flex-col gap-4 sm:flex-row sm:items-start"
            style={{ animationDelay: "240ms" }}
          >
            <DownloadButtons />
            <Button
              size="lg"
              variant={STORES_LIVE ? "outline" : "default"}
              asChild
              className="gap-2"
            >
              <Link href={continueHref}>
                {continueLabel} <ArrowRight className="size-4" />
              </Link>
            </Button>
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
                    <Icon className="size-5 text-primary" />
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
                  <p className="text-lg font-semibold text-primary">{metric}</p>
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
            <Sparkles className="mx-auto size-6 text-primary" />
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

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            The library is free. Premium covers unlimited AI research, not access.
          </p>
          <p>© {new Date().getFullYear()} Casparel</p>
        </div>
      </footer>
    </div>
  );
}
