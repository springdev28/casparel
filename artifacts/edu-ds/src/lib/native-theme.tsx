import tokens from "../generated/tokens";

function remToPx(value: string): number {
  const n = parseFloat(value);
  return value.endsWith("rem") ? n * 16 : n;
}

const radius = remToPx(tokens.radius); // 8px
const spacing = remToPx(tokens.spacing); // 4px

const fontFamily = {
  sans: "PlusJakartaSans_400Regular",
  sansMedium: "PlusJakartaSans_500Medium",
  sansSemiBold: "PlusJakartaSans_600SemiBold",
  sansBold: "PlusJakartaSans_700Bold",
} as const;

export const nativeTheme = {
  light: { ...tokens.color.light, radius, spacing, fontFamily },
  dark: { ...tokens.color.dark, radius, spacing, fontFamily },
} as const;

export type NativeTheme = typeof nativeTheme.light;
