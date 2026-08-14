// @ts-nocheck
// react-native only available in Expo context
import { useColorScheme } from "react-native";
import { nativeTheme } from "../lib/native-theme";

export function useColors() {
  const colorScheme = useColorScheme();
  return colorScheme === "dark" ? nativeTheme.dark : nativeTheme.light;
}
