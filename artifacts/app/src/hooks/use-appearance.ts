/**
 * @fileOverview Web support role: keeps the painted theme in step with the account's appearance choice.
 * System connection: mounted once by App; reads the account preference and the
 * device setting, and writes the resolved theme onto the document.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useSystemDark } from "./use-system-dark";
import {
  applyAppearance,
  readStoredAppearance,
  resolveAppearance,
  storeAppearance,
  subscribeToAppearance,
  type AppearanceMode,
} from "../lib/appearance";

/**
 * The account's choice, the device's setting, and the painted result.
 *
 * The stored copy is read synchronously so the first paint is already right;
 * the account's saved value arrives a moment later over the API and is folded
 * in by whoever owns the preferences query (Settings), which writes it back
 * through `setMode`. That keeps this hook free of a data dependency and
 * therefore usable in the shells, which render before preferences resolve.
 */
export function useAppearance(): {
  mode: AppearanceMode;
  resolved: "light" | "dark";
  setMode: (mode: AppearanceMode) => void;
} {
  const systemDark = useSystemDark();
  const mode = useSyncExternalStore(
    subscribeToAppearance,
    readStoredAppearance,
    () => "system" as const,
  );
  const resolved = resolveAppearance(mode, systemDark);

  useEffect(() => {
    applyAppearance(resolved);
  }, [resolved]);

  const setMode = useCallback((next: AppearanceMode) => {
    storeAppearance(next);
  }, []);

  return { mode, resolved, setMode };
}
