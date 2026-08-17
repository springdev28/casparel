import { useEffect } from "react";
import { AUTH_LANGUAGE_KEY, type AuthLanguage } from "../lib/auth-locale";
import { translateUiString } from "../lib/ui-translations";

/**
 * Translates the rendered UI in place, for every language that has a
 * dictionary.
 *
 * The app is written in English and this bridge rewrites the DOM after React
 * paints, which is why it is a bridge and not an i18n framework: it needs no
 * change at every call site, and a string it does not know is left in English
 * rather than mangled.
 *
 * What it must never translate, and how that is enforced:
 *
 *  • **User input and names.** A class called "Practice", a person called
 *    "Match", a resource titled "Forum" — each is a dictionary key, and
 *    translating it would rewrite something a person typed or is called.
 *    Content that comes from the database is marked `translate="no"` (see
 *    `NO_TRANSLATE_SELECTOR`), the HTML-standard way to say "leave this
 *    alone", and this walker skips those subtrees entirely.
 *  • **Fields being typed in.** Inputs, textareas and contenteditable regions
 *    are skipped, so translation can never fight the caret.
 *  • **Code and machine text.** `<code>`, `<pre>` and `<script>` are skipped:
 *    a snippet is not prose.
 *
 * The DOM is walked rather than the React tree because third-party components
 * (menus, toasts, the design system) render text this app never sees as a
 * string, and those were exactly the surfaces users found untranslated.
 */

const LANGUAGE_EVENT = "schoolar-language-change";

/**
 * Subtrees this bridge leaves alone.
 *
 * `translate="no"` is the standard attribute for it, honoured by browser
 * translation too, so marking user content with it fixes Google Translate as
 * well as this bridge. `data-user-content` is the same intent spelled for
 * readers of this codebase, and both are accepted so a component can use
 * whichever reads better at the call site.
 */
const NO_TRANSLATE_SELECTOR =
  '[translate="no"], [data-user-content], script, style, code, pre, textarea, input, [contenteditable="true"]';

const TEXT_ORIGINALS = new WeakMap<Text, string>();
const ATTRIBUTE_ORIGINALS = new WeakMap<Element, Map<string, string>>();
const TRANSLATED_ATTRIBUTES = ["aria-label", "placeholder", "title", "alt"] as const;

function currentLanguage(): AuthLanguage {
  try {
    return (localStorage.getItem(AUTH_LANGUAGE_KEY) as AuthLanguage | null) ?? "en";
  } catch {
    return "en";
  }
}

/** True when this node sits inside something that must not be translated. */
function isProtected(node: Node): boolean {
  const element =
    node instanceof Element ? node : (node.parentElement as Element | null);
  return element?.closest(NO_TRANSLATE_SELECTOR) != null;
}

/**
 * Re-read the source when the app itself changed the text.
 *
 * The original English is remembered per node so switching languages
 * translates from English again rather than from the previous translation. A
 * re-render that writes new content must replace that memory — but the write
 * this bridge just made must not, or the translation becomes the new
 * "original" and the string is frozen in one language.
 */
function sourceFor(
  current: string,
  remembered: string | undefined,
  language: AuthLanguage,
): string {
  if (remembered === undefined) return current;
  if (current === remembered) return remembered;
  if (current === translateUiString(remembered, language)) return remembered;
  return current;
}

function translateText(node: Text, language: AuthLanguage) {
  const source = sourceFor(node.data, TEXT_ORIGINALS.get(node), language);
  TEXT_ORIGINALS.set(node, source);
  const next = translateUiString(source, language);
  if (node.data !== next) node.data = next;
}

function translateAttributes(element: Element, language: AuthLanguage) {
  let originals = ATTRIBUTE_ORIGINALS.get(element);
  if (!originals) {
    originals = new Map();
    ATTRIBUTE_ORIGINALS.set(element, originals);
  }
  for (const attribute of TRANSLATED_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (current === null) continue;
    const source = sourceFor(current, originals.get(attribute), language);
    originals.set(attribute, source);
    const next = translateUiString(source, language);
    if (current !== next) element.setAttribute(attribute, next);
  }
}

function translateSubtree(root: Node, language: AuthLanguage) {
  if (root instanceof Text) {
    if (!isProtected(root)) translateText(root, language);
    return;
  }
  if (!(root instanceof Element)) return;
  if (root.matches(NO_TRANSLATE_SELECTOR)) return;
  translateAttributes(root, language);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      // Reject rather than skip: rejecting an element prunes its whole
      // subtree, which is the point — a protected container protects
      // everything inside it, however deeply nested.
      acceptNode(node) {
        if (node instanceof Element && node.matches(NO_TRANSLATE_SELECTOR)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text) translateText(node, language);
    else if (node instanceof Element) translateAttributes(node, language);
    node = walker.nextNode();
  }
}

export default function UiTranslationBridge() {
  useEffect(() => {
    let language = currentLanguage();
    let frame = 0;
    const pendingNodes = new Set<Node>();
    const apply = () => {
      if (document.body) translateSubtree(document.body, language);
      document.documentElement.lang = language;
    };
    const flush = () => {
      frame = 0;
      for (const node of pendingNodes) {
        if (node.isConnected) translateSubtree(node, language);
      }
      pendingNodes.clear();
    };
    const schedule = (node: Node) => {
      pendingNodes.add(node);
      if (!frame) frame = window.requestAnimationFrame(flush);
    };
    apply();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData" || mutation.type === "attributes")
          schedule(mutation.target);
        else mutation.addedNodes.forEach(schedule);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATED_ATTRIBUTES],
    });

    const handleLanguage = (event: Event) => {
      language = (event as CustomEvent<AuthLanguage>).detail;
      apply();
    };
    document.addEventListener(LANGUAGE_EVENT, handleLanguage);
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      pendingNodes.clear();
      document.removeEventListener(LANGUAGE_EVENT, handleLanguage);
    };
  }, []);

  return null;
}
