import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { retryAdStartupWhenActive } from './ad-startup-retry';

function foreground(initial = 'active') {
  const listeners = new Set<(state: string) => void>();
  return {
    currentState: initial,
    addEventListener(_event: 'change', listener: (state: string) => void) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    change(state: string) { this.currentState = state; listeners.forEach(listener => listener(state)); },
    listeners,
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('retries a startup failure once instead of disabling ads until process restart', () => {
  const app = foreground();
  const retry = vi.fn();
  retryAdStartupWhenActive(app, retry);
  vi.advanceTimersByTime(29_999);
  expect(retry).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(retry).toHaveBeenCalledTimes(1);
  app.change('active');
  expect(retry).toHaveBeenCalledTimes(1);
  expect(app.listeners.size).toBe(0);
});

it('pauses background retries and recovers when the user returns', () => {
  const app = foreground();
  const retry = vi.fn();
  retryAdStartupWhenActive(app, retry);
  app.change('background');
  vi.advanceTimersByTime(60_000);
  expect(retry).not.toHaveBeenCalled();
  app.change('active');
  expect(retry).toHaveBeenCalledTimes(1);
});

it('does not start a background timer or retry after account/onboarding cleanup', () => {
  const app = foreground('background');
  const retry = vi.fn();
  const cancel = retryAdStartupWhenActive(app, retry);
  expect(vi.getTimerCount()).toBe(0);
  cancel();
  app.change('active');
  vi.runAllTimers();
  expect(retry).not.toHaveBeenCalled();
  expect(app.listeners.size).toBe(0);
});
