/**
 * @fileOverview Mobile navigation role: defines the authenticated web workspaces exposed by the native app.
 * System connection: shared by the More screen and the guarded WebView route.
 */

export const WEB_WORKSPACES = {
  resources: { path: '/resources' },
  classes: { path: '/classes' },
  activities: { path: '/activities' },
  canvases: { path: '/canvases' },
  community: { path: '/forum' },
  catalog: { path: '/catalog' },
  people: { path: '/people' },
  settings: { path: '/settings' },
  tutorial: { path: '/tutorial' },
  guide: { path: '/guide' },
  support: { path: '/support' },
  notifications: { path: '/dashboard' },
  admin: { path: '/admin' },
} as const;

export type WebWorkspaceKey = keyof typeof WEB_WORKSPACES;

export function isWebWorkspaceKey(value: string): value is WebWorkspaceKey {
  return Object.prototype.hasOwnProperty.call(WEB_WORKSPACES, value);
}

/**
 * Every route declared by the web baseline and its intentional Android entry.
 * Dynamic routes are written in the same form as App.tsx so the parity test
 * fails when the web gains a route without an Android decision.
 */
export const WEB_ROUTE_PARITY = [
  { webRoute: '/auth/login', androidEntry: '/login', strategy: 'native' },
  { webRoute: '/auth/register', androidEntry: '/register', strategy: 'native' },
  { webRoute: '/resources/:id', androidEntry: '/resource/[id]', strategy: 'native' },
  { webRoute: '/resources', androidEntry: '/(tabs)/resources', strategy: 'native' },
  { webRoute: '/terms', androidEntry: 'paywall/support external link', strategy: 'browser' },
  { webRoute: '/privacy', androidEntry: 'paywall/support external link', strategy: 'browser' },
  { webRoute: '/plans', androidEntry: '/paywall', strategy: 'native-play-billing' },
  { webRoute: '/support', androidEntry: '/workspace/support', strategy: 'webview' },
  { webRoute: '/delete-account', androidEntry: '/workspace/settings', strategy: 'webview' },
  { webRoute: '/reset-account', androidEntry: '/workspace/settings', strategy: 'webview' },
  { webRoute: '/download', androidEntry: '/workspace/support', strategy: 'webview' },
  { webRoute: '/code-signing', androidEntry: '/workspace/support', strategy: 'webview' },
  { webRoute: '/canvas/shared/:token', androidEntry: '/canvas/shared/[token]', strategy: 'public-webview' },
  { webRoute: '/people', androidEntry: '/workspace/people', strategy: 'webview' },
  { webRoute: '/profile/:userId', androidEntry: '/workspace/people', strategy: 'webview' },
  { webRoute: '/profile', androidEntry: '/(tabs)/profile', strategy: 'native' },
  { webRoute: '/admin', androidEntry: '/workspace/admin', strategy: 'admin-webview' },
  { webRoute: '/forum', androidEntry: '/workspace/community', strategy: 'webview' },
  { webRoute: '/catalog', androidEntry: '/workspace/catalog', strategy: 'webview' },
  { webRoute: '/activities/shared/:token', androidEntry: '/activities/shared/[token]', strategy: 'public-webview' },
  { webRoute: '/activities', androidEntry: '/workspace/activities', strategy: 'webview' },
  { webRoute: '/messages', androidEntry: '/messages', strategy: 'native' },
  { webRoute: '/canvases/:id', androidEntry: '/workspace/canvases', strategy: 'webview' },
  { webRoute: '/canvases', androidEntry: '/workspace/canvases', strategy: 'webview' },
  { webRoute: '/goals', androidEntry: '/goals', strategy: 'native' },
  { webRoute: '/dashboard', androidEntry: '/(tabs)', strategy: 'native' },
  { webRoute: '/settings', androidEntry: '/workspace/settings', strategy: 'webview' },
  { webRoute: '/tutorial', androidEntry: '/workspace/tutorial', strategy: 'webview' },
  { webRoute: '/guide', androidEntry: '/workspace/guide', strategy: 'webview' },
  { webRoute: '/classes/:id', androidEntry: '/class/[id]', strategy: 'native' },
  { webRoute: '/classes', androidEntry: '/(tabs)/classes', strategy: 'native' },
  { webRoute: '/lists/:id', androidEntry: '/lists/[id]', strategy: 'native' },
  { webRoute: '/lists', androidEntry: '/lists', strategy: 'native' },
  { webRoute: '/schedule', androidEntry: '/(tabs)/schedule', strategy: 'native' },
  { webRoute: '/', androidEntry: '/(tabs)', strategy: 'installed-app-home' },
] as const;
