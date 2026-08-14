/**
 * Where the app is being viewed.
 *
 * The desktop shell marks itself in the user agent (`CasparelDesktop/<version>`),
 * which is the only signal it sends: there is no preload bridge, so the page
 * cannot call into the OS and does not need to. This exists so the landing page
 * can stop advertising a download to someone who has already installed it.
 */

const DESKTOP_UA = /CasparelDesktop\/([\d.]+)/;

export function desktopShellVersion(): string | null {
  if (typeof navigator === "undefined") return null;
  return navigator.userAgent.match(DESKTOP_UA)?.[1] ?? null;
}

export function isDesktopShell(): boolean {
  return desktopShellVersion() !== null;
}
