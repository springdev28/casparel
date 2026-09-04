/**
 * @fileOverview Mobile navigation role: defines the authenticated web workspaces exposed by the native app.
 * System connection: shared by the More screen and the guarded WebView route.
 */

export const WEB_WORKSPACES = {
  activities: { title: 'Activities', path: '/activities' },
  canvases: { title: 'Canvases', path: '/canvases' },
  community: { title: 'Community', path: '/forum' },
  catalog: { title: 'Catalog', path: '/catalog' },
  people: { title: 'People', path: '/people' },
  settings: { title: 'Settings & appearance', path: '/settings' },
  guide: { title: 'Guide', path: '/guide' },
  admin: { title: 'Administration', path: '/admin' },
} as const;

export type WebWorkspaceKey = keyof typeof WEB_WORKSPACES;

export function isWebWorkspaceKey(value: string): value is WebWorkspaceKey {
  return Object.prototype.hasOwnProperty.call(WEB_WORKSPACES, value);
}
