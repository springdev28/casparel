import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdRotation } from './ad-rotation';
const ad = () => ({ destroy: vi.fn() });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
afterEach(() => vi.useRealTimers());
describe('native ad lifecycle', () => {
  it('preloads one replacement, swaps immediately on skip/end, and destroys only after unmount', async () => {
    const first = ad(), second = ad(), third = ad();
    const load = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(third);
    const changed = vi.fn();
    const queue = new AdRotation(load, changed, vi.fn());
    queue.start(); await flush();
    expect(queue.current).toBe(first);
    expect(load).toHaveBeenCalledTimes(2);
    queue.advance();
    expect(queue.current).toBe(second);
    expect(first.destroy).not.toHaveBeenCalled();
    queue.releaseRetired(); expect(first.destroy).toHaveBeenCalledTimes(1);
    await flush(); expect(load).toHaveBeenCalledTimes(3);
    queue.stop(); expect(second.destroy).toHaveBeenCalledTimes(1); expect(third.destroy).toHaveBeenCalledTimes(1);
  });
  it('defers automatic replacement while hidden beneath navigation or in the background', async () => {
    const first = ad(), second = ad();
    const load = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockImplementation(() => new Promise(() => {}));
    const queue = new AdRotation(load, vi.fn(), vi.fn());
    queue.start(); await flush(); queue.setVisible(false); queue.advance();
    expect(queue.current).toBe(first); expect(load).toHaveBeenCalledTimes(2);
    queue.setVisible(true); expect(queue.current).toBe(second); queue.stop();
  });
  it('stops the old sound, discards preloads and ignores late responses after a sound change', async () => {
    let finish!: (value: ReturnType<typeof ad>) => void;
    const first = ad(), late = ad(), muted = ad();
    const load = vi.fn().mockResolvedValueOnce(first).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(muted).mockImplementation(() => new Promise(() => {}));
    const queue = new AdRotation(load, vi.fn(), vi.fn());
    queue.start(); await flush(); queue.resetSound(); queue.releaseRetired();
    expect(first.destroy).toHaveBeenCalledTimes(1); expect(queue.current).toBeNull();
    finish(late); await flush(); expect(late.destroy).toHaveBeenCalledTimes(1); expect(queue.current).toBe(muted); queue.stop();
  });
  it('displays a creative that takes longer than twenty seconds to load', async () => {
    vi.useFakeTimers();
    const slow = ad();
    const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(slow), 25_000))).mockImplementation(() => new Promise(() => {}));
    const failed = vi.fn();
    const queue = new AdRotation(load, vi.fn(), failed);
    queue.start();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(queue.current).toBe(slow);
    expect(slow.destroy).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    queue.stop();
  });
  it('recovers from a silent bridge timeout without a request storm or stale creative', async () => {
    vi.useFakeTimers();
    let finish!: (value: ReturnType<typeof ad>) => void;
    const late = ad(), good = ad();
    const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(good).mockImplementation(() => new Promise(() => {}));
    const failed = vi.fn(); const queue = new AdRotation(load, vi.fn(), failed);
    queue.start(); await vi.advanceTimersByTimeAsync(90_000); expect(failed).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29_999); expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(queue.current).toBe(good);
    finish(late); await flush(); expect(late.destroy).toHaveBeenCalledTimes(1); queue.stop();
  });
  it('accepts a late response during watchdog backoff and cancels the retry', async () => {
    vi.useFakeTimers();
    const late = ad();
    const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(late), 95_000))).mockImplementation(() => new Promise(() => {}));
    const queue = new AdRotation(load, vi.fn(), vi.fn());
    queue.start();
    await vi.advanceTimersByTimeAsync(95_000);
    expect(queue.current).toBe(late);
    expect(late.destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(load).toHaveBeenCalledTimes(2); // displayed ad + its single preload
    queue.stop();
  });
  it('disposes an in-flight creative after route change or consent removal', async () => {
    let finish!: (value: ReturnType<typeof ad>) => void;
    const late = ad(); const changed = vi.fn();
    const queue = new AdRotation(() => new Promise(resolve => { finish = resolve; }), changed, vi.fn());
    queue.start(); queue.stop(); finish(late); await flush();
    expect(changed).not.toHaveBeenCalled(); expect(late.destroy).toHaveBeenCalledTimes(1);
  });
});
