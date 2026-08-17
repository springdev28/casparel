/**
 * UI translation dictionaries, one module per language.
 *
 * The app offered six languages while only Turkish had a dictionary, so
 * choosing Spanish, French, German or Portuguese changed the login screen and
 * left the whole product in English. Each language now has its own file, and
 * `translateUiString` is the single lookup every surface goes through.
 *
 * Keys are the exact English source string as it appears in the DOM. That is
 * what makes this approach honest about its own limits: a string with no entry
 * is returned unchanged rather than machine-mangled, and
 * `scripts/audit-translation.mjs` reports those gaps from a real browser so
 * "translate everything" is measurable instead of assumed.
 */
import type { AuthLanguage } from "../auth-locale";
import TR from "./tr";

/**
 * A language with no entry here is served English, unchanged — which is the
 * honest failure: half-machine-translated copy is worse than none. Adding a
 * language is one module and one line, and `TRANSLATED_LANGUAGES` below keeps
 * tooling and the audit in step automatically.
 */
export const DICTIONARIES: Partial<Record<AuthLanguage, Record<string, string>>> =
  {
    tr: TR,
  };

/**
 * Counted phrases, which no whole-string dictionary can hold: the number is
 * data, so each language gets a shape rather than an entry. Kept beside the
 * dictionaries because a missing plural rule reads to a user as a missing
 * translation, not as a different kind of gap.
 */
type CountRule = (n: string) => string;

const COUNTED: Record<string, Partial<Record<AuthLanguage, CountRule>>> = {
  cards: {
    tr: (n) => `${n} kart`,
    es: (n) => `${n} ${n === "1" ? "tarjeta" : "tarjetas"}`,
    fr: (n) => `${n} ${n === "1" ? "carte" : "cartes"}`,
    de: (n) => `${n} ${n === "1" ? "Karte" : "Karten"}`,
    pt: (n) => `${n} ${n === "1" ? "cartão" : "cartões"}`,
  },
  items: {
    tr: (n) => `${n} öğe`,
    es: (n) => `${n} ${n === "1" ? "elemento" : "elementos"}`,
    fr: (n) => `${n} ${n === "1" ? "élément" : "éléments"}`,
    de: (n) => `${n} ${n === "1" ? "Element" : "Elemente"}`,
    pt: (n) => `${n} ${n === "1" ? "item" : "itens"}`,
  },
  votes: {
    tr: (n) => `${n} oy`,
    es: (n) => `${n} ${n === "1" ? "voto" : "votos"}`,
    fr: (n) => `${n} ${n === "1" ? "vote" : "votes"}`,
    de: (n) => `${n} ${n === "1" ? "Stimme" : "Stimmen"}`,
    pt: (n) => `${n} ${n === "1" ? "voto" : "votos"}`,
  },
  views: {
    tr: (n) => `${n} görüntülenme`,
    es: (n) => `${n} ${n === "1" ? "vista" : "vistas"}`,
    fr: (n) => `${n} ${n === "1" ? "vue" : "vues"}`,
    de: (n) => `${n} ${n === "1" ? "Aufruf" : "Aufrufe"}`,
    pt: (n) => `${n} ${n === "1" ? "visualização" : "visualizações"}`,
  },
  likes: {
    tr: (n) => `${n} beğeni`,
    es: (n) => `${n} "me gusta"`,
    fr: (n) => `${n} ${n === "1" ? "j'aime" : "j'aime"}`,
    de: (n) => `${n} ${n === "1" ? "Like" : "Likes"}`,
    pt: (n) => `${n} ${n === "1" ? "curtida" : "curtidas"}`,
  },
  comments: {
    tr: (n) => `${n} yorum`,
    es: (n) => `${n} ${n === "1" ? "comentario" : "comentarios"}`,
    fr: (n) => `${n} ${n === "1" ? "commentaire" : "commentaires"}`,
    de: (n) => `${n} ${n === "1" ? "Kommentar" : "Kommentare"}`,
    pt: (n) => `${n} ${n === "1" ? "comentário" : "comentários"}`,
  },
};

/** "3 of 10" — a progress shape, not a sentence, so it is its own rule. */
const OF_RULE: Partial<Record<AuthLanguage, (a: string, b: string) => string>> = {
  tr: (a, b) => `${a} / ${b}`,
  es: (a, b) => `${a} de ${b}`,
  fr: (a, b) => `${a} sur ${b}`,
  de: (a, b) => `${a} von ${b}`,
  pt: (a, b) => `${a} de ${b}`,
};

/**
 * The translation for one UI string, or the string unchanged.
 *
 * Surrounding whitespace is preserved: the DOM often splits a sentence across
 * text nodes, and eating the spaces between them runs the words together.
 */
export function translateUiString(value: string, language: AuthLanguage): string {
  if (language === "en") return value;
  const dictionary = DICTIONARIES[language];
  if (!dictionary) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const key = value.trim();
  if (!key) return value;
  const hit = dictionary[key];
  if (hit) return leading + hit + trailing;

  const counted = /^(\d[\d.,]*) ([a-z]+)$/.exec(key);
  if (counted) {
    const rule = COUNTED[counted[2]]?.[language];
    if (rule) return leading + rule(counted[1]) + trailing;
  }
  const of = /^(\d[\d.,]*) of (\d[\d.,]*)$/.exec(key);
  if (of) {
    const rule = OF_RULE[language];
    if (rule) return leading + rule(of[1], of[2]) + trailing;
  }
  return value;
}

/** Every language that has a dictionary, for tooling and tests. */
export const TRANSLATED_LANGUAGES = Object.keys(DICTIONARIES) as AuthLanguage[];
