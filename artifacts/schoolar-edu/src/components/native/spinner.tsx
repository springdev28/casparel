/**
 * @fileOverview Design-system role: implements or demonstrates Spinner in the shared component/token package.
 * System connection: provides consistent visual, responsive, and accessibility behavior to the web application.
 */
// @ts-nocheck
// react-native only available in Expo context
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useColors } from "../../hooks/use-colors";

interface SpinnerProps {
  size?: "small" | "large";
  fullScreen?: boolean;
  style?: object;
}

export function Spinner({ size = "small", fullScreen = false, style }: SpinnerProps) {
  const colors = useColors();
  const indicator = <ActivityIndicator size={size} color={colors.primary} />;

  if (fullScreen) {
    return (
      <View style={[styles.fullScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <View style={[styles.wrapper, style]}>{indicator}</View>;
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
});
