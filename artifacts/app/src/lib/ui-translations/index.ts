/**
 * @fileOverview Web domain role: centralizes Index state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
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

/**
 * One loader per language, so a reader downloads their own dictionary and
 * nobody else's.
 *
 * These were five static imports. Each dictionary is around 125KB of source,
 * so they bundled into a single 596KB chunk and every reader who chose French
 * fetched German, Spanish, Portuguese and Turkish along with it -- half a
 * megabyte of languages they will never see, on a product whose readers are
 * students and may be on a phone on a bus.
 *
 * A dynamic import gives each its own chunk. Vite splits on these
 * automatically, and the shape below -- a literal object of arrow functions
 * with static specifiers -- is what lets it: a computed `import(path)` would
 * defeat the analysis and pull all five back into one chunk.
 *
 * A language with no entry here is served English, unchanged, which is the
 * honest failure: half-machine-translated copy is worse than none. Adding a
 * language is one module and one line, and `TRANSLATED_LANGUAGES` below keeps
 * tooling and the audit in step automatically.
 */
const LOADERS: Partial<
  Record<AuthLanguage, () => Promise<{ default: Record<string, string> }>>
> = {
  tr: () => import("./tr"),
};

/** Dictionaries already fetched, by language. */
const LOADED: Partial<Record<AuthLanguage, Record<string, string>>> = {};

/** In-flight fetches, so two callers asking at once make one request. */
const LOADING: Partial<Record<AuthLanguage, Promise<void>>> = {};

/**
 * Fetch a language's dictionary, once.
 *
 * `translateUiString` stays synchronous -- it is called from a
 * MutationObserver, once per text node, and cannot await anything -- so the
 * dictionary has to be in hand before translation starts. Callers await this
 * first. Until it resolves, a lookup returns the English unchanged, which is
 * the same thing the bridge already did for a language it had no dictionary
 * for, and it is why a slow network shows English briefly rather than nothing.
 *
 * A failed fetch is not thrown onward. The dictionary is an enhancement over
 * a product that is written in English and reads correctly without it; a
 * chunk that will not load should leave the reader with English, not with an
 * error boundary.
 */
/**
 * Is this language's dictionary in hand *now*?
 *
 * Not to be confused with `hasDictionary` in translated-languages.ts, which
 * answers whether one exists at all. This one is about the network.
 *
 * The document's `lang` attribute depends on it. `lang` states what the
 * document *is*, and a browser acts on that: a screen reader picks its
 * pronunciation rules from it, and browser translation offers to translate
 * based on it. Announcing `lang="tr"` over English text tells a screen reader
 * to read English words with Turkish phonetics.
 *
 * That could not happen while the dictionaries were bundled, because the
 * first translation pass had every word it needed. Now they arrive over the
 * network, so there is a window where the language is chosen and the words
 * are not here yet, and `lang` has to wait for them.
 *
 * A language with no dictionary is never "loaded", which is also correct: the
 * product serves English to that reader, so the document is in English and
 * should say so.
 */
export function isDictionaryLoaded(language: AuthLanguage): boolean {
  return Boolean(LOADED[language]);
}

export async function loadDictionary(language: AuthLanguage): Promise<void> {
  if (language === "en" || LOADED[language]) return;
  const loader = LOADERS[language];
  if (!loader) return;
  LOADING[language] ??= loader()
    .then((module) => {
      LOADED[language] = module.default;
    })
    .catch(() => {
      // Leave it unloaded; English is the fallback and it is a correct one.
      delete LOADING[language];
    });
  await LOADING[language];
}

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
  },
  items: {
    tr: (n) => `${n} öğe`,
  },
  votes: {
    tr: (n) => `${n} oy`,
  },
  views: {
    tr: (n) => `${n} görüntülenme`,
  },
  likes: {
    tr: (n) => `${n} beğeni`,
  },
  comments: {
    tr: (n) => `${n} yorum`,
  },
  reviews: {
    tr: (n) => `${n} değerlendirme`,
  },
  members: {
    tr: (n) => `${n} üye`,
  },
  students: {
    tr: (n) => `${n} öğrenci`,
  },
  times: {
    // "Used 4 times" -- the count of how often a shared study path has been
    // copied. Singular reads "once" in English, which is why the shape rule
    // below carries the whole phrase rather than this table carrying the noun.
    tr: (n) => `${n} kez`,
  },
};

/**
 * "2 / 3 today" — the AI allowance counter in the sidebar.
 *
 * Same reason as OF_RULE below: the numbers are data, so no whole-string entry
 * can ever match it, and it stayed English in every language while the words
 * around it translated.
 */
const TODAY_RULE: Partial<Record<AuthLanguage, (a: string, b: string) => string>> = {
  tr: (a, b) => `bugün ${a} / ${b}`,
};

/**
 * Shapes with a number or a quoted title in them.
 *
 * Each of these is a sentence a reader sees, and none can ever be a dictionary
 * key, because the value in the middle changes. They were all English in every
 * language until the audit could see the student dashboard at all -- its
 * fixture signed in as an administrator, which renders different panels.
 *
 * A rule per shape rather than one clever matcher: each language puts the
 * number and the words in its own order, and that only stays readable when
 * each shape is written out.
 */
const SHAPE_RULES: Array<{
  match: RegExp;
  render: Partial<Record<AuthLanguage, (...parts: string[]) => string>>;
}> = [
  {
    match: /^(\d[\d.,]*)% mastery evidence$/,
    render: {
      tr: (n) => `%${n} ustalık kanıtı`,
    },
  },
  {
    /*
     * "Rating: 4.5 out of 5" -- the accessible name of the star widget, and
     * the only way a screen-reader user learns the rating at all. The number
     * varies, so it needed a rule rather than an entry, and until attributes
     * were audited nobody could see it was English.
     */
    match: /^Rating: ([\d.,]+) out of 5$/,
    render: {
      tr: (n) => `Puan: 5 üzerinden ${n}`,
    },
  },
  {
    // "Used 4 times", under a shared study path. Singular is "once" in
    // English and a plain number elsewhere, so the whole phrase is a rule.
    match: /^Used (\d[\d.,]*) times?$/,
    render: {
      tr: (n) => `${n} kez kullanıldı`,
    },
  },
  {
    match: /^(\d[\d.,]*) of (\d[\d.,]*) complete$/,
    render: {
      tr: (a, b) => `${b} adımdan ${a} tamamlandı`,
    },
  },
  {
    // The button that puts a Learning List's newer resources onto the path
    // already built from it, and the toast that confirms it did.
    match: /^Add (\d[\d.,]*) to the path$/,
    render: {
      tr: (n) => `${n} tanesini yola ekle`,
    },
  },
  {
    match: /^(\d[\d.,]*) added, in the order of your list\.$/,
    render: {
      tr: (n) => `Listenin sırasıyla ${n} tanesi eklendi.`,
    },
  },
  {
    match: /^(\d[\d.,]*) library resources? selected for this goal$/,
    render: {
      tr: (n) => `bu hedef için ${n} kütüphane kaynağı seçildi`,
    },
  },
  {
    match: /^(\d[\d.,]*) check-ins$/,
    render: {
      tr: (n) => `${n} kontrol`,
    },
  },
  {
    match: /^(\d[\d.,]*) selected resources$/,
    render: {
      tr: (n) => `${n} seçili kaynak`,
    },
  },
  {
    match: /^How confident are you with “(.+)”\?$/,
    render: {
      tr: (t) => `“${t}” konusunda kendine ne kadar güveniyorsun?`,
    },
  },
  {
    match: /^How confident are you that you achieved “(.+)”\?$/,
    render: {
      tr: (t) => `“${t}” hedefine ulaştığından ne kadar eminsin?`,
    },
  },
  /*
   * The accessible names of the per-item controls on a list.
   *
   * Every one of these is "a verb and the reader's own title", which is what
   * makes a list of icon buttons legible to a screen reader: "Delete button"
   * six times over says nothing. The title in the middle is the reason none of
   * them can be a dictionary key, and the reason they were reached for the
   * blunt instrument instead -- translate="no" on the button, which stops the
   * bridge touching the name and also stops it touching everything else on the
   * element. On the goals page that swallowed the "Add a path step…"
   * placeholder, and on the schedule the "Export to Calendar" tooltip: pure
   * product wording, in English in all five languages, invisible to the
   * translation audit because the audit skips protected elements by design.
   *
   * A rule per shape translates around the name and leaves the name alone,
   * which is what the protection was standing in for.
   */
  {
    // "38% average completion" and "38% complete", on a teacher's assignments
    // list. The number is data, so neither can ever be a dictionary key.
    match: /^(\d[\d.,]*)% average completion$/,
    render: {
      tr: (n) => `ortalama %${n} tamamlanma`,
    },
  },
  {
    match: /^(\d[\d.,]*)% complete$/,
    render: {
      tr: (n) => `%${n} tamamlandı`,
    },
  },
  {
    match: /^Open (.+)$/,
    render: {
      tr: (t) => `${t} kaynağını aç`,
    },
  },
  {
    match: /^Remove (.+)$/,
    render: {
      tr: (t) => `${t} kaynağını kaldır`,
    },
  },
  {
    match: /^Add step to (.+)$/,
    render: {
      tr: (t) => `${t} hedefine adım ekle`,
    },
  },
  {
    match: /^Move (.+) up$/,
    render: {
      tr: (t) => `${t} yukarı taşı`,
    },
  },
  {
    match: /^Move (.+) down$/,
    render: {
      tr: (t) => `${t} aşağı taşı`,
    },
  },
  {
    match: /^Rename (.+)$/,
    render: {
      tr: (t) => `${t} yeniden adlandır`,
    },
  },
  {
    match: /^Delete (.+)$/,
    render: {
      tr: (t) => `${t} sil`,
    },
  },
  {
    match: /^Complete (.+)$/,
    render: {
      tr: (t) => `${t} adımını tamamla`,
    },
  },
  {
    match: /^Undo (.+)$/,
    render: {
      tr: (t) => `${t} adımını geri al`,
    },
  },
  {
    match: /^Export (.+) to calendar$/,
    render: {
      tr: (t) => `${t} takvime aktar`,
    },
  },
  {
    /*
     * "2 named collaborators". A rule rather than a COUNTED entry because
     * COUNTED keys on a single lowercase word after the number, and this one
     * is two.
     */
    match: /^(\d[\d.,]*) named collaborators?$/,
    render: {
      tr: (n) => `${n} adlı ortak`,
    },
  },
  {
    /*
     * "Manage Photosynthesis map" -- the accessible name of the menu button on
     * a canvas card, named after the canvas so that a list of them does not
     * read as "button, button, button". The name is the reader's own, so the
     * label can only be translated around it.
     */
    match: /^Manage (.+)$/,
    render: {
      tr: (t) => `${t} yönet`,
    },
  },
];

/** "93% evidence score" — a number and a label, so no fixed key can match. */
const EVIDENCE_RULE: Partial<Record<AuthLanguage, (n: string) => string>> = {
  tr: (n) => `%${n} kanıt puanı`,
};

/** "3 of 10" — a progress shape, not a sentence, so it is its own rule. */
const OF_RULE: Partial<Record<AuthLanguage, (a: string, b: string) => string>> = {
  tr: (a, b) => `${a} / ${b}`,
};

/**
 * The translation for one UI string, or the string unchanged.
 *
 * Surrounding whitespace is preserved: the DOM often splits a sentence across
 * text nodes, and eating the spaces between them runs the words together.
 */
export function translateUiString(value: string, language: AuthLanguage): string {
  if (language === "en") return value;
  const dictionary = LOADED[language];
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
  for (const shape of SHAPE_RULES) {
    const parts = shape.match.exec(key);
    if (!parts) continue;
    const render = shape.render[language];
    if (render) return leading + render(...parts.slice(1)) + trailing;
  }
  const evidence = /^(\d[\d.,]*)% evidence score$/.exec(key);
  if (evidence) {
    const rule = EVIDENCE_RULE[language];
    if (rule) return leading + rule(evidence[1]) + trailing;
  }
  const today = /^(\d[\d.,]*) \/ (\d[\d.,]*) today$/.exec(key);
  if (today) {
    const rule = TODAY_RULE[language];
    if (rule) return leading + rule(today[1], today[2]) + trailing;
  }
  const of = /^(\d[\d.,]*) of (\d[\d.,]*)$/.exec(key);
  if (of) {
    const rule = OF_RULE[language];
    if (rule) return leading + rule(of[1], of[2]) + trailing;
  }
  return value;
}

/** Every language that has a dictionary, for tooling and tests. */
export const TRANSLATED_LANGUAGES = Object.keys(LOADERS) as AuthLanguage[];
