/**
 * @fileOverview Design-system role: implements or demonstrates Button in the shared component/token package.
 * System connection: provides consistent visual, responsive, and accessibility behavior to the web application.
 */
// @ts-nocheck
// react-native / expo-haptics only available in Expo context
import React, { useEffect, useRef, useState } from "react";
import { nativeFeedback } from "../../lib/native-feedback";
import { AccessibilityInfo, ActivityIndicator, Animated, Pressable, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { useColors } from "../../hooks/use-colors";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const pop = useRef(new Animated.Value(0)).current;
  const [pressed, setPressed] = useState(false);
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduced(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { mounted = false; subscription.remove(); pop.stopAnimation(); };
  }, [pop]);

  const handlePress = () => {
    if (disabled || loading) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    nativeFeedback('tick');
    if (!reduced) {
      pop.setValue(1);
      Animated.timing(pop, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    }
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
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={handlePress}
      disabled={disabled || loading}
      style={[
        styles.base,
        {
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }],
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
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: fgMap[variant], opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }) }]} />
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
    </AnimatedPressable>
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
