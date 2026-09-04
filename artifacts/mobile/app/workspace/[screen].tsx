/**
 * @fileOverview Mobile screen role: hosts an allowlisted full Casparel workspace inside the app.
 * System connection: maps a route key to a fixed same-origin path and never accepts an arbitrary URL.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { AuthenticatedWebWorkspace } from '@/components/AuthenticatedWebWorkspace';
import { WEB_WORKSPACES, isWebWorkspaceKey } from '@/utils/web-workspaces';
import { useLanguage } from '@/contexts/LanguageContext';

export default function WorkspaceScreen() {
  const { t } = useLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ screen?: string | string[] }>();
  const screen = Array.isArray(params.screen) ? params.screen[0] : params.screen;
  const workspace = screen && isWebWorkspaceKey(screen) ? WEB_WORKSPACES[screen] : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Go back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/mobile'))}
          style={styles.back}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]} numberOfLines={1}>
          {workspace ? t(workspace.title) : t('Workspace not found')}
        </Text>
        <View style={styles.back} />
      </View>
      {workspace ? (
        <AuthenticatedWebWorkspace path={workspace.path} />
      ) : (
        <View style={styles.missing}>
          <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
            {t('That workspace is not available.')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 16, textAlign: 'center' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
