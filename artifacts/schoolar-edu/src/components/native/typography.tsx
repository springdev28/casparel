// @ts-nocheck
// react-native only available in Expo context
import React from "react";
import { StyleSheet, Text } from "react-native";
import { useColors } from "../../hooks/use-colors";

interface TypographyProps {
  children: React.ReactNode;
  style?: object;
  numberOfLines?: number;
}

export function H1({ children, style, numberOfLines }: TypographyProps) {
  const colors = useColors();
  return (
    <Text
      style={[styles.h1, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }, style]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

export function H2({ children, style, numberOfLines }: TypographyProps) {
  const colors = useColors();
  return (
    <Text
      style={[styles.h2, { color: colors.foreground, fontFamily: colors.fontFamily.sansBold }, style]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

export function H3({ children, style, numberOfLines }: TypographyProps) {
  const colors = useColors();
  return (
    <Text
      style={[styles.h3, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }, style]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

export function Body({ children, style, numberOfLines }: TypographyProps) {
  const colors = useColors();
  return (
    <Text
      style={[styles.body, { color: colors.foreground, fontFamily: colors.fontFamily.sans }, style]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

export function BodySm({ children, style, numberOfLines }: TypographyProps) {
  const colors = useColors();
  return (
    <Text
      style={[styles.bodySm, { color: colors.foreground, fontFamily: colors.fontFamily.sans }, style]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

export function Caption({ children, style, numberOfLines }: TypographyProps) {
  const colors = useColors();
  return (
    <Text
      style={[styles.caption, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }, style]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

export function Label({ children, style, numberOfLines }: TypographyProps) {
  const colors = useColors();
  return (
    <Text
      style={[styles.label, { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium }, style]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  h2: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  h3: { fontSize: 17, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontSize: 15, lineHeight: 22 },
  bodySm: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 14, lineHeight: 20 },
});
