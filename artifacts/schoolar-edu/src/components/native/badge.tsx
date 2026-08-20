// @ts-nocheck
// react-native only available in Expo context
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success";

interface BadgeProps {
  children: string;
  variant?: BadgeVariant;
  style?: object;
}

export function Badge({ children, variant = "default", style }: BadgeProps) {
  const colors = useColors();

  const bgMap: Record<BadgeVariant, string> = {
    default: colors.primary,
    secondary: colors.secondary,
    destructive: colors.destructive,
    outline: "transparent",
    success: colors.accent,
  };

  const fgMap: Record<BadgeVariant, string> = {
    default: colors.primaryForeground,
    secondary: colors.secondaryForeground,
    destructive: colors.destructiveForeground,
    outline: colors.foreground,
    success: colors.accentForeground,
  };

  const borderMap: Record<BadgeVariant, string> = {
    default: colors.primary,
    secondary: colors.secondary,
    destructive: colors.destructive,
    outline: colors.border,
    success: colors.accent,
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bgMap[variant],
          borderColor: borderMap[variant],
          borderRadius: colors.radius / 2,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: fgMap[variant],
            fontFamily: colors.fontFamily.sansSemiBold,
          },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    letterSpacing: 0.2,
    /*
     * No textTransform.
     *
     * This carried `capitalize`, which in React Native upper-cases the first
     * letter of *every* word. It was there because badges were being handed
     * database enums -- "article", "student", "pdf" -- and capitalising them
     * made a column value look like a label. It made "pdf" into "Pdf".
     *
     * It also reached the two kinds of text it had no business touching. A
     * badge often holds something the reader typed: a subject, a year group.
     * "IB physics HL" is not ours to re-case. And once the enums became
     * written words, those words get translated -- so a French reader saw
     * "En Cours" and a Turkish one "Devam Ediyor", which is not how either
     * language capitalises a phrase.
     *
     * Callers pass the words they want shown. See mobile utils/labels.ts.
     */
  },
});
