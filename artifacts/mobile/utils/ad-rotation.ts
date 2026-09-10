/** Owns one displayed creative and one prefetched replacement. No timer refreshes impressions. */
export interface AdCreative { destroy(): void }
export class AdRotation<T extends AdCreative> {
  current: T | null = null;
  private next: T | null = null;
  private nextLoadedAt = 0;
  private retired = new Set<T>();
  private stopped = false;
  private loading = false;
  private generation = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private pendingAdvance = false;
  private visible = true;

  constructor(private load: () => Promise<T>, private changed: (ad: T | null) => void,
    private failed: (error: unknown) => void) {}

  start() { this.fill(); }
  setVisible(visible: boolean) {
    this.visible = visible;
    if (visible && this.pendingAdvance) this.advance();
  }
  advance() {
    if (this.stopped) return;
    if (!this.visible) { this.pendingAdvance = true; return; }
    this.pendingAdvance = false;
    // Cached native inventory expires after an hour; leave a margin instead
    // of presenting an old preload after a long study session.
    if (this.next && Date.now() - this.nextLoadedAt > 55 * 60_000) {
      this.next.destroy();
      this.next = null;
    }
    if (this.current) this.retired.add(this.current);
    this.current = this.next;
    this.next = null;
    this.changed(this.current);
    this.fill();
  }
  /** Keep the current video after a change through its own SDK mute control. */
  discardPreload() {
    this.generation++;
    this.loading = false;
    clearTimeout(this.retry);
    this.retry = undefined;
    clearTimeout(this.timeout);
    this.next?.destroy();
    this.next = null;
    this.fill();
  }
  /** Stop an audible ad immediately and discard preloads with the old mute choice. */
  resetSound() {
    this.generation++;
    this.loading = false;
    clearTimeout(this.retry);
    this.retry = undefined;
    clearTimeout(this.timeout);
    this.next?.destroy();
    this.next = null;
    if (this.current) this.retired.add(this.current);
    this.current = null;
    this.changed(null);
    this.fill();
  }
  /** React calls this after the old NativeAdView has unmounted. */
  releaseRetired() {
    for (const ad of this.retired) ad.destroy();
    this.retired.clear();
  }
  private fill() {
    if (this.stopped || this.loading || this.next || this.retry) return;
    this.loading = true;
    const generation = ++this.generation;
    const fail = (error: unknown, allowLateResponse = false) => {
      if (this.stopped || generation !== this.generation || this.retry) return;
      if (!allowLateResponse) this.generation++;
      this.loading = false;
      clearTimeout(this.timeout);
      this.failed(error);
      this.retry = setTimeout(() => { this.retry = undefined; this.fill(); }, 30_000);
    };
    // Google can spend 60 seconds on a network request. The old 20-second
    // deadline destroyed successful slow responses. This is only a watchdog
    // for a silent bridge: accept a late creative until a retry actually starts.
    this.timeout = setTimeout(() => fail(new Error('AD_REQUEST_TIMEOUT'), true), 90_000);
    void this.load().then(ad => {
      if (this.stopped || generation !== this.generation) { ad.destroy(); return; }
      clearTimeout(this.timeout);
      clearTimeout(this.retry);
      this.retry = undefined;
      this.loading = false;
      if (!this.current) {
        this.current = ad;
        this.changed(ad);
        this.fill();
      } else {
        this.next = ad;
        this.nextLoadedAt = Date.now();
      }
    }, fail);
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearTimeout(this.timeout);
    this.current?.destroy();
    this.next?.destroy();
    this.current = this.next = null;
    this.releaseRetired();
  }
}
