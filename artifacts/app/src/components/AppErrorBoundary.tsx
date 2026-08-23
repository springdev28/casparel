/**
 * @fileOverview Web UI role: provides the reusable App Error Boundary component or bridge.
 * System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@workspace/edu-ds/components/ui/button';
import { trackClientError } from '../lib/client-telemetry';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Casparel render error', error, info);
    trackClientError('react_boundary', error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-[100dvh] grid place-items-center bg-background p-6 text-foreground">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Casparel could not load</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A page error occurred. Reload the app to try again.
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>
      </main>
    );
  }
}
