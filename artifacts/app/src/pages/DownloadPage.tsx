import { useEffect } from "react";
import { Link } from "wouter";
import { Apple, ArrowRight, Globe, Monitor, Play } from "lucide-react";
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
import { manualInstallHint, useInstallability } from "../lib/install-prompt";
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
  /** What a release of this platform actually contains, if it is worth saying. */
  formats?: string;
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
    // The APK is built from the same commit and profile as the Play release,
    // for the schools and countries where Play is not an option.
    formats: "Google Play, or an APK to install directly.",
  },
  {
    id: "desktop",
    name: "Mac, Windows and Linux",
    pending: "No public installers yet. Casparel runs in any browser today.",
    formats:
      "Intel and Arm: DMG or ZIP on macOS, an installer or a ZIP on Windows, AppImage, deb, rpm or tar.gz on Linux.",
  },
];

/**
 * The fourth way to get Casparel: install the web app itself.
 *
 * Not one of PLATFORMS because it is not a link. Whether it can be offered at
 * all is a property of the browser reading the page, decided while the page is
 * open — a Chromium that has not yet fired its event says "manual" and changes
 * its mind a moment later — so this card is the one place on the page whose
 * action appears or does not.
 */
function BrowserCard() {
  const { state, install } = useInstallability();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <Globe className="size-5 text-primary-text" />
          {state === "installed" ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary-text">
              Installed
            </span>
          ) : null}
        </div>
        <CardTitle className="text-base">Any browser</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Install Casparel from the browser itself: its own window and icon,
          nothing to update, and the pages you have already opened stay
          readable when you lose your connection.
        </p>
        {state === "ready" ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              void install();
            }}
          >
            Install Casparel
          </Button>
        ) : null}
        {state === "manual" ? <p>{manualInstallHint()}</p> : null}
      </CardContent>
    </Card>
  );
}

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

      <section aria-label="Platforms" className="grid gap-4 sm:grid-cols-2">
        {/* First while the stores are still "not yet": it is then the only
            card on the page offering something a visitor can act on today. */}
        {hasDownloads() ? null : <BrowserCard />}
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
                {/* What the release contains, once there is one to describe.
                    Listing formats beside "not released yet" would read as a
                    promise about a file nobody can download. */}
                {target && platform.formats ? <p>{platform.formats}</p> : null}
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
        {hasDownloads() ? <BrowserCard /> : null}
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
