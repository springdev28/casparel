// @ts-nocheck — react-native only available in Expo context
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
      <TextInput
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
