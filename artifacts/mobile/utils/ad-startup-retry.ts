interface ForegroundState {
  readonly currentState: string;
  addEventListener(event: 'change', listener: (state: string) => void): { remove(): void };
}

/** Retry a failed startup once, after a delay or when the app returns to the foreground.
 * The caller starts a new attempt and owns its cleanup. Never retry in the background.
 */
export function retryAdStartupWhenActive(appState: ForegroundState, retry: () => void): () => void {
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const cancel = () => { finished = true; clear(); subscription.remove(); };
  const run = () => {
    if (finished || appState.currentState !== 'active') return;
    cancel();
    retry();
  };
  const subscription = appState.addEventListener('change', state => {
    clear();
    if (state === 'active') run();
  });
  if (appState.currentState === 'active') timer = setTimeout(run, 30_000);
  return cancel;
}
