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
import ES from "./es";
import FR from "./fr";
import PT from "./pt";
import DE from "./de";

/**
 * A language with no entry here is served English, unchanged — which is the
 * honest failure: half-machine-translated copy is worse than none. Adding a
 * language is one module and one line, and `TRANSLATED_LANGUAGES` below keeps
 * tooling and the audit in step automatically.
 */
export const DICTIONARIES: Partial<Record<AuthLanguage, Record<string, string>>> =
  {
    tr: TR,
    es: ES,
    fr: FR,
    pt: PT,
    de: DE,
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
  reviews: {
    tr: (n) => `${n} değerlendirme`,
    es: (n) => `${n} ${n === "1" ? "reseña" : "reseñas"}`,
    fr: (n) => `${n} ${n === "1" ? "avis" : "avis"}`,
    de: (n) => `${n} ${n === "1" ? "Bewertung" : "Bewertungen"}`,
    pt: (n) => `${n} ${n === "1" ? "avaliação" : "avaliações"}`,
  },
  members: {
    tr: (n) => `${n} üye`,
    es: (n) => `${n} ${n === "1" ? "miembro" : "miembros"}`,
    fr: (n) => `${n} ${n === "1" ? "membre" : "membres"}`,
    de: (n) => `${n} ${n === "1" ? "Mitglied" : "Mitglieder"}`,
    pt: (n) => `${n} ${n === "1" ? "membro" : "membros"}`,
  },
  students: {
    tr: (n) => `${n} öğrenci`,
    es: (n) => `${n} ${n === "1" ? "estudiante" : "estudiantes"}`,
    fr: (n) => `${n} ${n === "1" ? "élève" : "élèves"}`,
    de: (n) => `${n} ${n === "1" ? "Schüler" : "Schüler"}`,
    pt: (n) => `${n} ${n === "1" ? "estudante" : "estudantes"}`,
  },
  times: {
    // "Used 4 times" -- the count of how often a shared study path has been
    // copied. Singular reads "once" in English, which is why the shape rule
    // below carries the whole phrase rather than this table carrying the noun.
    tr: (n) => `${n} kez`,
    es: (n) => `${n} ${n === "1" ? "vez" : "veces"}`,
    fr: (n) => `${n} fois`,
    de: (n) => `${n} Mal`,
    pt: (n) => `${n} ${n === "1" ? "vez" : "vezes"}`,
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
  es: (a, b) => `${a} / ${b} hoy`,
  fr: (a, b) => `${a} / ${b} aujourd’hui`,
  de: (a, b) => `${a} / ${b} heute`,
  pt: (a, b) => `${a} / ${b} hoje`,
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
      es: (n) => `${n} % de evidencia de dominio`,
      fr: (n) => `${n} % de preuves de maîtrise`,
      de: (n) => `${n} % Kompetenznachweis`,
      pt: (n) => `${n} % de evidência de domínio`,
    },
  },
  {
    // "Used 4 times", under a shared study path. Singular is "once" in
    // English and a plain number elsewhere, so the whole phrase is a rule.
    match: /^Used (\d[\d.,]*) times?$/,
    render: {
      tr: (n) => `${n} kez kullanıldı`,
      es: (n) => `Usada ${n} ${n === "1" ? "vez" : "veces"}`,
      fr: (n) => `Utilisée ${n} fois`,
      de: (n) => `${n}-mal verwendet`,
      pt: (n) => `Usada ${n} ${n === "1" ? "vez" : "vezes"}`,
    },
  },
  {
    match: /^(\d[\d.,]*) of (\d[\d.,]*) complete$/,
    render: {
      tr: (a, b) => `${b} adımdan ${a} tamamlandı`,
      es: (a, b) => `${a} de ${b} completados`,
      fr: (a, b) => `${a} sur ${b} terminés`,
      de: (a, b) => `${a} von ${b} abgeschlossen`,
      pt: (a, b) => `${a} de ${b} concluídos`,
    },
  },
  {
    match: /^(\d[\d.,]*) library resources? selected for this goal$/,
    render: {
      tr: (n) => `bu hedef için ${n} kütüphane kaynağı seçildi`,
      es: (n) => `${n} recursos de la biblioteca seleccionados para este objetivo`,
      fr: (n) => `${n} ressources de la bibliothèque sélectionnées pour cet objectif`,
      de: (n) => `${n} Bibliotheksressourcen für dieses Ziel ausgewählt`,
      pt: (n) => `${n} recursos da biblioteca selecionados para esta meta`,
    },
  },
  {
    match: /^(\d[\d.,]*) check-ins$/,
    render: {
      tr: (n) => `${n} kontrol`,
      es: (n) => `${n} registros`,
      fr: (n) => `${n} points d’étape`,
      de: (n) => `${n} Rückmeldungen`,
      pt: (n) => `${n} registos`,
    },
  },
  {
    match: /^(\d[\d.,]*) selected resources$/,
    render: {
      tr: (n) => `${n} seçili kaynak`,
      es: (n) => `${n} recursos seleccionados`,
      fr: (n) => `${n} ressources sélectionnées`,
      de: (n) => `${n} ausgewählte Ressourcen`,
      pt: (n) => `${n} recursos selecionados`,
    },
  },
  {
    match: /^How confident are you with “(.+)”\?$/,
    render: {
      tr: (t) => `“${t}” konusunda kendine ne kadar güveniyorsun?`,
      es: (t) => `¿Qué seguridad tienes con «${t}»?`,
      fr: (t) => `Quelle confiance avez-vous en « ${t} » ?`,
      pt: (t) => `Que confiança tem em «${t}»?`,
      de: (t) => `Wie sicher fühlst du dich bei „${t}“?`,
    },
  },
  {
    match: /^How confident are you that you achieved “(.+)”\?$/,
    render: {
      tr: (t) => `“${t}” hedefine ulaştığından ne kadar eminsin?`,
      es: (t) => `¿Qué seguridad tienes de haber logrado «${t}»?`,
      fr: (t) => `Dans quelle mesure pensez-vous avoir atteint « ${t} » ?`,
      pt: (t) => `Que confiança tem em ter alcançado «${t}»?`,
      de: (t) => `Wie sicher bist du, dass du „${t}“ erreicht hast?`,
    },
  },
];

/** "93% evidence score" — a number and a label, so no fixed key can match. */
const EVIDENCE_RULE: Partial<Record<AuthLanguage, (n: string) => string>> = {
  tr: (n) => `%${n} kanıt puanı`,
  es: (n) => `${n} % de puntuación de evidencia`,
  fr: (n) => `${n} % de score de preuve`,
  de: (n) => `${n} % Belegwert`,
  pt: (n) => `${n} % de pontuação de evidência`,
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
export const TRANSLATED_LANGUAGES = Object.keys(DICTIONARIES) as AuthLanguage[];
