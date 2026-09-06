/**
 * The website brand opens the public home page. The installed app keeps the
 * same control inside its authenticated workspace because `/` is the website
 * landing page when no native session is available.
 */
export function brandHomePath(nativeShell: boolean): "/" | "/dashboard" {
  return nativeShell ? "/dashboard" : "/";
}
