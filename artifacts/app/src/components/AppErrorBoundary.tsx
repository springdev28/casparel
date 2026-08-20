import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { isStaleBuildError } from '../lib/stale-build';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** So one bad load cannot become a reload loop. */
const RELOADED_KEY = 'schoolar_reloaded_for_stale_build';

/**
 * How soon a second automatic reload counts as a loop rather than a fix.
 *
 * A loop retries immediately: reload, fail, reload, in well under a second. A
 * second deploy during the same browsing session is minutes or hours apart,
 * and deserves the same automatic recovery the first one got -- there were
 * thirteen deploys on the day this was written, so "once per session" would
 * have left somebody stuck on the message for the other twelve.
 */
const RELOAD_COOLDOWN_MS = 30_000;

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Casparel render error', error, info);

    /*
     * A stale build is the one error this can fix by itself: the fix is to
     * fetch the current shell, which is what a reload does. index.html is
     * served `no-cache`, so the reload comes back with the new chunk names
     * and the click that failed works.
     *
     * Reloading out from under somebody is normally rude, and it is not here
     * because of when this fires: a chunk is only fetched on the way to a
     * page they have not opened yet, so this happens during a navigation they
     * have already committed to. The page they were on is being left either
     * way. What they lose is a flicker; what they get is the page they asked
     * for, instead of a screen explaining that the software changed -- which
     * is our problem, not theirs.
     *
     * The time is written before reloading rather than after, so a failure
     * that survives the reload shows the message instead of refreshing the
     * page forever.
     */
    if (!isStaleBuildError(error)) return;
    try {
      const last = Number(sessionStorage.getItem(RELOADED_KEY) ?? 0);
      if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
      sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
    } catch {
      // Private browsing, or storage turned off. Show the message instead;
      // reloading without being able to record it is how loops happen.
      return;
    }
    window.location.reload();
  }

  render() {
    if (!this.state.error) return this.props.children;

    const stale = isStaleBuildError(this.state.error);
    return (
      <main className="min-h-[100dvh] grid place-items-center bg-background p-6 text-foreground">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">
            {stale ? 'Casparel has been updated' : 'Casparel could not load'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {stale
              ? 'This tab was open while a new version shipped. Reload to pick it up.'
              : 'A page error occurred. Reload the app to try again.'}
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>
      </main>
    );
  }
}
