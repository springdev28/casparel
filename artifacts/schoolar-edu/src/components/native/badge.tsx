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
    textTransform: "capitalize",
  },
});
