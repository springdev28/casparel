/**
 * The brand always addresses home. The installed app intercepts `/` and opens
 * its native home screen; ordinary browsers open the website's landing page.
 */
export function brandHomePath(_nativeShell: boolean): "/" {
  return "/";
}
