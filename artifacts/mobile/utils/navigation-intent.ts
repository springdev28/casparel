/**
 * @fileOverview Mobile navigation role: normalizes trusted return paths across authentication, onboarding, and shared web links.
 * System connection: RootLayoutNav stores a deep-link intent here while credential/onboarding screens temporarily own the router.
 */
export type MobileReturnPath =
  | '/'
  | '/resources'
  | `/resource/${number}`
  | '/classes'
  | `/class/${number}`
  | '/lists'
  | `/lists/${number}`
  | `/lists/${number}/path-review`
  | '/goals'
  | `/goals/${number}`
  | `/goals/${number}/study/${string}`
  | '/schedule'
  | '/profile'
  | '/paywall';

const DETAIL_PATH = /^\/(resource(?:s)?|class(?:es)?|lists|goals)\/([1-9]\d*)$/;
const PATH_REVIEW_PATH = /^\/lists\/([1-9]\d*)\/path-review$/;
const FOCUSED_STUDY_PATH = /^\/goals\/([1-9]\d*)\/study\/([A-Za-z0-9_-]{1,100})$/;

/**
 * Accept only routes the native application actually implements. This turns
 * shared plural web detail URLs into their native singular equivalents and
 * prevents an external-looking or web-only path from becoming a post-login
 * redirect target.
 */
export function mobileReturnPath(pathname: string): MobileReturnPath | null {
  const focusedStudy = FOCUSED_STUDY_PATH.exec(pathname);
  if (focusedStudy) {
    const goalId = Number(focusedStudy[1]);
    return Number.isSafeInteger(goalId)
      ? `/goals/${goalId}/study/${focusedStudy[2]}`
      : null;
  }

  const pathReview = PATH_REVIEW_PATH.exec(pathname);
  if (pathReview) {
    const listId = Number(pathReview[1]);
    return Number.isSafeInteger(listId) ? `/lists/${listId}/path-review` : null;
  }

  const detail = DETAIL_PATH.exec(pathname);
  if (detail) {
    const id = Number(detail[2]);
    if (!Number.isSafeInteger(id)) return null;
    if (detail[1].startsWith('resource')) return `/resource/${id}`;
    if (detail[1].startsWith('class')) return `/class/${id}`;
    if (detail[1] === 'lists') return `/lists/${id}`;
    return `/goals/${id}`;
  }

  switch (pathname) {
    case '/':
    case '/resources':
    case '/classes':
    case '/lists':
    case '/goals':
    case '/schedule':
    case '/profile':
    case '/paywall':
      return pathname;
    default:
      return null;
  }
}
