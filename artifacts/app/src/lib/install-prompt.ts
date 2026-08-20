import { useEffect, useState } from "react";

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
 * is what `installability` answers.
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

export function useInstallability(): {
  state: Installability;
  install: () => Promise<void>;
} {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      /*
       * Chromium shows its own install affordance in the address bar by
       * default. Preventing that is what makes this page's button the offer
       * rather than a second one beside it -- and it is only correct because
       * the event is kept: a prevented prompt that is then thrown away is an
       * install the reader can no longer perform at all.
       */
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    // Single-use: the browser will not accept the same event twice, so keeping
    // it would leave a button that silently does nothing on the second press.
    setPrompt(null);
  }

  return {
    state: installed ? "installed" : prompt ? "ready" : "manual",
    install,
  };
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
