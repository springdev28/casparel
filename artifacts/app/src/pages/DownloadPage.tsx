/**
 * @fileOverview Web screen role: renders the Download Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import { useEffect } from "react";
import { Link } from "wouter";
import { Apple, ArrowRight, Monitor, Play } from "lucide-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import {
  downloadTargets,
  hasDownloads,
  likelyPlatform,
  orderedDownloadTargets,
  type PlatformId,
} from "../lib/downloads";
import { isDesktopShell } from "../lib/platform";

const ICONS: Record<PlatformId, typeof Apple> = {
  ios: Apple,
  android: Play,
  desktop: Monitor,
};

/**
 * Every platform Casparel runs on, whether or not it can be installed yet.
 *
 * The rule the landing page already followed — never offer a link that does
 * not go anywhere — leaves a gap this page fills: someone searching "casparel
 * download" before the stores approve deserves a straight answer about what
 * exists and what does not, rather than a page that silently omits two thirds
 * of the product. So an unreleased platform is listed and marked, not hidden.
 */
const PLATFORMS: {
  id: PlatformId;
  name: string;
  pending: string;
}[] = [
  {
    id: "ios",
    name: "iPhone",
    pending: "Not on the App Store yet. Casparel runs in Safari today.",
  },
  {
    id: "android",
    name: "Android",
    pending: "Not on Google Play yet. Casparel runs in Chrome today.",
  },
  {
    id: "desktop",
    name: "Mac, Windows and Linux",
    pending: "No public installers yet. Casparel runs in any browser today.",
  },
];

export default function DownloadPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Download Casparel | Casparel";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const available = new Map(downloadTargets.map((target) => [target.id, target]));
  const ordered = orderedDownloadTargets();
  const suggested = likelyPlatform();
  const inShell = isDesktopShell();

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12 text-foreground">
      <header className="max-w-2xl space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-text">
          Download Casparel
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          The same workspace, on whatever you study with
        </h1>
        <p className="text-muted-foreground">
          Your library, classes, schedule and source research are one account.
          Sign in on a second device and everything is already there: nothing
          to export, nothing to sync.
        </p>
      </header>

      {inShell ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are using the desktop app. The mobile apps below sign in to the
          same account.
        </p>
      ) : null}

      {/* The one action most visitors want, before the full list. */}
      {!inShell && ordered.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {ordered.map((target, index) => {
            const Icon = ICONS[target.id];
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
      ) : null}

      <section aria-label="Platforms" className="grid gap-4 md:grid-cols-3">
        {PLATFORMS.map((platform) => {
          const target = available.get(platform.id);
          const Icon = ICONS[platform.id];
          return (
            <Card key={platform.id}>
              <CardHeader>
                {/* The badge sits beside the icon rather than after the
                    title: "Mac, Windows and Linux" already fills the card, and
                    appending to it wrapped two words onto a line of their own. */}
                <div className="flex items-center justify-between gap-2">
                  <Icon className="size-5 text-primary-text" />
                  {suggested === platform.id ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary-text">
                      Your device
                    </span>
                  ) : null}
                </div>
                <CardTitle className="text-base">{platform.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>{target ? target.description : platform.pending}</p>
                {target ? (
                  <Button variant="outline" size="sm" asChild className="gap-2">
                    <a
                      href={target.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {target.label}
                    </a>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">
          {hasDownloads()
            ? "Or stay in the browser"
            : "Everything works in your browser today"}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Casparel is a full web app, not a preview of the native ones. The
          library, classes, canvases, schedules and AI source research all run
          in a browser tab, on the same account you would use on a phone.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="gap-2">
            <Link href="/resources">
              Browse the library <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/code-signing">How we sign our downloads</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
