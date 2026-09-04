/**
 * @fileOverview Mobile bridge role: opens full Casparel web workspaces inside the signed-in native app.
 * System connection: injects the native session into Casparel's own origin and routes billing back to the native paywall.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { useAuth } from '@/contexts/AuthContext';
import { apiOrigin } from '@/utils/api-host';
import { classifyMobileWebUrl } from '@/utils/mobile-web-navigation';
import { useLanguage } from '@/contexts/LanguageContext';

export function AuthenticatedWebWorkspace({ path }: { path: string }) {
  const { t } = useLanguage();
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const webView = useRef<WebView>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sessionScript = useMemo(() => {
    const serializedToken = JSON.stringify(token ?? '');
    return `
      (function () {
        try {
          window.localStorage.setItem('schoolar_token', ${serializedToken});
          window.localStorage.setItem('casparel_native_shell', 'true');
          window.dispatchEvent(new Event('schoolar-session-change'));
        } catch (_) {}
      })();
      true;
    `;
  }, [token]);

  if (!token) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }}>
          {t('Sign in again to open this workspace.')}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Feather name="alert-circle" size={28} color={colors.destructiveText} />
        <Text style={[styles.errorTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
          {t('This workspace did not load')}
        </Text>
        <Text style={[styles.errorBody, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
          {error}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setError(null);
            setReloadKey((value) => value + 1);
          }}
          style={[styles.retry, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
        >
          <Text style={{ color: colors.primaryForeground, fontFamily: colors.fontFamily.sansSemiBold }}>
            {t('Try again')}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <WebView
      ref={webView}
      key={reloadKey}
      source={{ uri: `${apiOrigin}${path}` }}
      originWhitelist={[`${apiOrigin}/*`]}
      injectedJavaScriptBeforeContentLoaded={sessionScript}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      setSupportMultipleWindows={false}
      startInLoadingState
      renderLoading={() => (
        <View style={[StyleSheet.absoluteFill, styles.centered, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      onShouldStartLoadWithRequest={(request) => {
        // One classifier for every WebView: /plans opens the native paywall,
        // the public marketing home page is rewritten to /dashboard so an
        // authenticated session can never fall out onto it, same-origin
        // workspaces stay inside, and only genuine externals leave the app.
        const destination = classifyMobileWebUrl(request.url, apiOrigin);
        if (destination.kind === 'ignore') return true;
        if (destination.kind === 'paywall') {
          router.push('/paywall');
          return false;
        }
        if (destination.kind === 'internal') {
          if (destination.url !== new URL(request.url, apiOrigin).toString()) {
            // The rewritten address (e.g. "/" -> "/dashboard") replaces the
            // requested one, so an authenticated workspace never lands on the
            // public marketing home page.
            webView.current?.injectJavaScript(
              `window.location.replace(${JSON.stringify(destination.url)}); true;`,
            );
            return false;
          }
          return true;
        }
        void Linking.openURL(destination.url);
        return false;
      }}
      onError={(event) => {
        setError(event.nativeEvent.description || t('Check your connection and try again.'));
      }}
      onHttpError={(event) => {
        if (event.nativeEvent.statusCode >= 500) {
          setError(t('Casparel could not load this workspace. Please try again.'));
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorTitle: { fontSize: 17, textAlign: 'center' },
  errorBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  retry: { paddingHorizontal: 20, paddingVertical: 11, marginTop: 4 },
});
