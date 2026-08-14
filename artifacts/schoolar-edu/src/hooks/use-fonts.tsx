// @ts-nocheck
// expo-font / google-fonts only available in Expo context
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";

export function useDesignSystemFonts(): {
  fontsLoaded: boolean;
  fontError: Error | null;
} {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  return { fontsLoaded: fontsLoaded ?? false, fontError: fontError ?? null };
}
