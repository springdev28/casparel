/**
 * @fileOverview Mobile support role: configures or implements Labels for the Expo application.
 * System connection: supports native build/runtime behavior and communication with the same API used by web and desktop.
 */
/**
 * Database enums as words somebody would write.
 *
 * `format` is stored as "article", "video", "pdf"; `role` as "student",
 * "teacher", "admin"; a goal's `level` and `status` the same way. Those are
 * column values. Putting one on screen shows a reader the shape of the
 * database, and it cannot be translated, because a dictionary keyed on
 * English source strings has no entry for a value that was never written in
 * any language.
 *
 * The phone was getting away with it because the badge carried
 * `textTransform: "capitalize"`, which turned "article" into "Article" and
 * looked deliberate. It also turned "pdf" into "Pdf".
 *
 * Every one of these takes the translator rather than calling the hook, so a
 * label can be built inside an accessibilityLabel or a sort comparator
 * without dragging React state into either.
 */

type Translate = (key: string) => string;

/** A resource's kind. */
export function formatLabel(format: string, t: Translate) {
  switch (format) {
    case 'article':
      return t('Article');
    case 'video':
      return t('Video');
    // Not "Pdf", which is what capitalising the column value produced.
    case 'pdf':
      return t('PDF');
    case 'podcast':
      return t('Podcast');
    case 'interactive':
      return t('Interactive');
    default:
      return t('Other');
  }
}

/** What somebody is in Casparel. */
export function roleLabel(role: string, t: Translate) {
  if (role === 'teacher') return t('Teacher');
  if (role === 'admin') return t('Administrator');
  return t('Student');
}

/** How far into a subject a goal is pitched. */
export function levelLabel(level: string, t: Translate) {
  if (level === 'beginner') return t('Beginner');
  if (level === 'advanced') return t('Advanced');
  return t('Intermediate');
}

/** Whether a goal is being worked on. */
export function goalStatusLabel(status: string, t: Translate) {
  if (status === 'completed') return t('Finished');
  if (status === 'paused') return t('Paused');
  return t('In progress');
}
