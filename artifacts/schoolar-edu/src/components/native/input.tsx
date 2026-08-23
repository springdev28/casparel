/**
 * @fileOverview Design-system role: implements or demonstrates Input in the shared component/token package.
 * System connection: provides consistent visual, responsive, and accessibility behavior to the web application.
 */
// @ts-nocheck
// react-native only available in Expo context
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useColors } from "../../hooks/use-colors";

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  autoComplete?: string;
  error?: string;
  style?: object;
  editable?: boolean;
}

export function Input({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  autoCapitalize = "sentences",
  keyboardType = "default",
  autoComplete,
  error,
  style,
  editable = true,
}: InputProps) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrapper, style]}>
      {label && (
        <Text
          style={[
            styles.label,
            { color: colors.foreground, fontFamily: colors.fontFamily.sansMedium },
          ]}
        >
          {label}
        </Text>
      )}
      {/*
        The label above is drawn, not announced.

        A <Text> beside a <TextInput> is a visual pairing and nothing more:
        there is no `for`/`id` relationship in React Native, so a screen reader
        read every field in this product as an unnamed text field. Every login,
        every sign-up, every profile edit -- the fields where getting it wrong
        costs somebody their account.

        The label is the name when there is one; a field with only a
        placeholder falls back to that, because a placeholder disappears the
        moment you type and is the only name such a field has. The error is a
        hint rather than part of the name, so it is read after the label
        instead of replacing it.
      */}
      <TextInput
        accessibilityLabel={label || placeholder}
        accessibilityHint={error || undefined}
        accessibilityState={{ disabled: !editable }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.background,
            borderColor: error
              ? colors.destructive
              : focused
              ? colors.ring
              : colors.input,
            borderRadius: colors.radius,
            fontFamily: colors.fontFamily.sans,
          },
          !editable && styles.disabled,
        ]}
      />
      {error && (
        <Text
          style={[
            styles.error,
            { color: colors.destructive, fontFamily: colors.fontFamily.sans },
          ]}
        >
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { fontSize: 14 },
  input: {
    height: 44,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  error: { fontSize: 12, marginTop: 2 },
  disabled: { opacity: 0.6 },
});
