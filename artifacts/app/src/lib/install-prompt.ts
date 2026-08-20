import { useSyncExternalStore } from "react";

/**
 * Whether the browser will install Casparel, and how to ask it to.
 *
 * Installing a web app is offered three different ways by three families of
 * browser, and only one of them can be driven from the page:
 *
 *  • Chromium fires `beforeinstallprompt` once the app qualifies and the
 *    visitor has engaged with it, and hands over an object that opens the
 *    install dialog. That is the button.
 *  • Safari has no such event. Installing is Share, then Add to Home Screen,
 *    performed by the reader in browser chrome this page cannot reach or even
 *    point at.
 *  • Firefox on the desktop does not install web apps at all.
 *
 * So the page cannot promise a button, and must not render a dead one. What it
 * can always do is say which of those three situations the reader is in, which
 * is what `useInstallability` answers.
 *
 * The event is caught once for the whole app rather than by the component that
 * draws the button, because it is fired once for the whole app: it arrives when
 * the browser finishes deciding, which is whenever it is, and a visitor who
 * reads two pages before opening /download would otherwise find the offer gone
 * — the browser considers itself to have offered, and does not repeat it.
 */

/** Not in lib.dom: the event is Chromium's, and still not in the standard. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type Installability =
  /** Already installed, or already running in the installed window. */
  | "installed"
  /** The browser has offered a prompt; a button can open it. */
  | "ready"
  /** Installable, but only by the reader, through the browser's own menu. */
  | "manual";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // Safari's own flag, which is what an iPhone home-screen launch sets. It
  // predates display-mode and is still the only signal there.
  return (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * That this browser installed Casparel, remembered across tabs and reloads.
 *
 * `display-mode: standalone` is only true inside the installed window, and a
 * browser tells an ordinary tab nothing about an app it has installed — so
 * after installing, the tab the reader installed *from* went back to
 * explaining how to install, which is the one thing they no longer need.
 * (`navigator.getInstalledRelatedApps` is meant for this and answered with an
 * empty list for an app that was demonstrably installed, so it is not what
 * this leans on.)
 *
 * Stale in one direction only, and it repairs itself: a browser fires
 * `beforeinstallprompt` when the app is installable, which it is not while it
 * is installed, so an uninstall is announced by the next prompt and clears
 * this.
 */
const INSTALLED_KEY = "schoolar_installed";

function remembered(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false; // storage disabled, or a private window that forbids it
  }
}

function remember(yes: boolean): void {
  try {
    if (yes) localStorage.setItem(INSTALLED_KEY, "1");
    else localStorage.removeItem(INSTALLED_KEY);
  } catch {
    /* nothing to do: the state is then merely per-tab */
  }
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = isStandalone() || remembered();
let watching = false;
const subscribers = new Set<() => void>();

function changed() {
  for (const notify of subscribers) notify();
}

/**
 * Start listening, once, as early in the app's life as possible.
 *
 * Called from the entry point rather than from the card, so the event is
 * already in hand by the time anyone navigates to the page that offers it.
 */
export function watchInstallPrompt(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  // Running in the installed window is proof, and it is proof the ordinary
  // tabs of the same browser have no other way of getting: someone who
  // installed through the browser's own menu never went through the button.
  if (isStandalone()) remember(true);
  window.addEventListener("beforeinstallprompt", (event) => {
    /*
     * Chromium shows its own install affordance in the address bar by
     * default. Preventing that is what makes this page's button the offer
     * rather than a second one beside it -- and it is only correct because
     * the event is kept: a prevented prompt that is then thrown away is an
     * install the reader can no longer perform at all.
     */
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    // Offered means installable means not installed: this is where a copy
    // that has since been uninstalled stops being remembered as present.
    installed = false;
    remember(false);
    changed();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    remember(true);
    deferred = null;
    changed();
  });
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

function snapshot(): Installability {
  if (installed) return "installed";
  return deferred ? "ready" : "manual";
}

/** What is on the server, where there is no browser to ask. */
function serverSnapshot(): Installability {
  return "manual";
}

export function useInstallability(): {
  state: Installability;
  install: () => Promise<void>;
} {
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  async function install() {
    const prompt = deferred;
    if (!prompt) return;
    // Cleared before the dialog opens, not after: the browser will not accept
    // the same event twice, so a second press while the first dialog is open
    // would do nothing and look like a broken button.
    deferred = null;
    changed();
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      // `appinstalled` follows, but not always promptly -- and Chrome reloads
      // the tab it installed from, which would lose an answer held only in
      // memory. Recording it here is what makes the card correct afterwards.
      installed = true;
      remember(true);
      changed();
    }
  }

  return { state, install };
}

/**
 * How to install by hand, for the browsers that do not offer a prompt.
 *
 * Deliberately coarse. Naming the exact menu item for a browser this guesses
 * wrong would be worse than the general instruction, so iOS -- where the steps
 * are fixed, well known and the same in every app -- is the only one spelled
 * out.
 */
export function manualInstallHint(): string {
  if (typeof navigator === "undefined") return "";
  const agent = navigator.userAgent;
  const iOS =
    /iPhone|iPad|iPod/i.test(agent) ||
    (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1);
  if (iOS) {
    return "In Safari, tap Share, then Add to Home Screen.";
  }
  return "Use your browser's menu, then Install.";
}
