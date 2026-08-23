/**
 * @fileOverview Web domain role: centralizes Use System Dark state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
import { useEffect, useState } from "react";

const QUERY = "(prefers-color-scheme: dark)";

/**
 * Tracks the browser/OS color-scheme preference. Used on the public and auth
 * screens so their logo lockup and surfaces follow the visitor's system theme
 * (the light "02" lockup in light mode, the dark "03" lockup in dark mode).
 * The signed-in workspace does not use this, it keeps its own fixed theme.
 */
export function useSystemDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    mql.addEventListener("change", onChange);
    setDark(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return dark;
}
