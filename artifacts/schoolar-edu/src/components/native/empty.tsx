/**
 * @fileOverview Design-system role: implements or demonstrates Empty in the shared component/token package.
 * System connection: provides consistent visual, responsive, and accessibility behavior to the web application.
 */
// @ts-nocheck
// react-native only available in Expo context
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";

interface EmptyProps {
  icon?: string;
  title: string;
  description?: string;
  style?: object;
}

export function Empty({ icon = "inbox", title, description, style }: EmptyProps) {
  const colors = useColors();
  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: colors.muted, borderRadius: colors.radius * 2 },
        ]}
      >
        <Feather name={icon} size={28} color={colors.mutedForeground} />
      </View>
      <Text
        style={[
          styles.title,
          { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
        ]}
      >
        {title}
      </Text>
      {description && (
        <Text
          style={[
            styles.description,
            { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
          ]}
        >
          {description}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 12,
  },
  iconContainer: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { fontSize: 16, textAlign: "center" },
  description: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
