/**
 * @fileOverview Design-system role: implements or demonstrates Button in the shared component/token package.
 * System connection: provides consistent visual, responsive, and accessibility behavior to the web application.
 */
// @ts-nocheck
// react-native / expo-haptics only available in Expo context
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "../../hooks/use-colors";

export type ButtonVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "ghost"
  | "outline";
export type ButtonSize = "default" | "sm" | "lg" | "icon";

interface ButtonProps {
  children?: React.ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  style?: object;
}

export function Button({
  children,
  onPress,
  variant = "default",
  size = "default",
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const colors = useColors();

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  const bgMap: Record<ButtonVariant, string> = {
    default: colors.primary,
    secondary: colors.secondary,
    destructive: colors.destructive,
    ghost: "transparent",
    outline: "transparent",
  };

  const fgMap: Record<ButtonVariant, string> = {
    default: colors.primaryForeground,
    secondary: colors.secondaryForeground,
    destructive: colors.destructiveForeground,
    ghost: colors.foreground,
    outline: colors.foreground,
  };

  const borderMap: Record<ButtonVariant, string> = {
    default: colors.primary,
    secondary: colors.secondary,
    destructive: colors.destructive,
    ghost: "transparent",
    outline: colors.border,
  };

  const paddingMap: Record<ButtonSize, object> = {
    default: { paddingHorizontal: 16, paddingVertical: 10, minHeight: 44 },
    sm: { paddingHorizontal: 12, paddingVertical: 6, minHeight: 32 },
    lg: { paddingHorizontal: 24, paddingVertical: 14, minHeight: 52 },
    icon: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0 },
  };

  const fontSizeMap: Record<ButtonSize, number> = {
    default: 15,
    sm: 13,
    lg: 16,
    icon: 15,
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: colors.radius,
          backgroundColor: bgMap[variant],
          borderColor: borderMap[variant],
        },
        paddingMap[size],
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fgMap[variant]} />
      ) : typeof children === "string" ? (
        <Text
          style={[
            styles.text,
            {
              color: fgMap[variant],
              fontSize: fontSizeMap[size],
              fontFamily: colors.fontFamily.sansSemiBold,
            },
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  text: { letterSpacing: 0.1 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.78 },
});
