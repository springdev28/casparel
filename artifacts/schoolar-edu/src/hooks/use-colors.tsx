/**
 * @fileOverview Design-system role: implements or demonstrates Use Colors in the shared component/token package.
 * System connection: provides consistent visual, responsive, and accessibility behavior to the web application.
 */
// @ts-nocheck
// react-native only available in Expo context
import { useColorScheme } from "react-native";
import { nativeTheme } from "../lib/native-theme";

export function useColors() {
  const colorScheme = useColorScheme();
  return colorScheme === "dark" ? nativeTheme.dark : nativeTheme.light;
}
