/**
 * @fileOverview Web fallback role: keeps the mobile web export buildable and opens the canonical workspace.
 * System connection: platform counterpart to the authenticated native WebView.
 */
import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { apiOrigin } from '@/utils/api-host';
import { useLanguage } from '@/contexts/LanguageContext';

export function AuthenticatedWebWorkspace({ path }: { path: string }) {
  const { t } = useLanguage();
  const colors = useColors();
  return (
    <View style={styles.centered}>
      <Text style={{ color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }}>
        {t('Open the full Casparel workspace')}
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(`${apiOrigin}${path}`)}
        style={[styles.button, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
      >
        <Text style={{ color: colors.primaryForeground, fontFamily: colors.fontFamily.sansSemiBold }}>
          {t('Open workspace')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  button: { paddingHorizontal: 18, paddingVertical: 11 },
});
