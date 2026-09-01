/**
 * @fileOverview Mobile bridge role: opens full Casparel web workspaces inside the signed-in native app.
 * System connection: injects the native session into Casparel's own origin and routes billing back to the native paywall.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { useAuth } from '@/contexts/AuthContext';
import { apiOrigin } from '@/utils/api-host';
import { useLanguage } from '@/contexts/LanguageContext';

export function AuthenticatedWebWorkspace({ path, requiresAuth = true }: { path: string; requiresAuth?: boolean }) {
  const { t } = useLanguage();
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const webViewRef = useRef<WebView>(null);

  const sessionScript = useMemo(() => {
    const serializedToken = JSON.stringify(token);
    return `
      (function () {
        try {
          var token = ${serializedToken};
          if (token) window.localStorage.setItem('schoolar_token', token);
          else window.localStorage.removeItem('schoolar_token');
          window.localStorage.setItem('casparel_native_shell', 'true');
          window.dispatchEvent(new Event('schoolar-session-change'));
        } catch (_) {}

        document.addEventListener('click', function (event) {
          var element = event.target;
          var anchor = element && element.closest ? element.closest('a[download]') : null;
          if (!anchor || !anchor.href || !window.ReactNativeWebView) return;
          event.preventDefault();
          var headers = {};
          var sessionToken = window.localStorage.getItem('schoolar_token');
          var destination = new URL(anchor.href, window.location.href);
          if (sessionToken && destination.origin === window.location.origin) {
            headers.Authorization = 'bearer ' + sessionToken;
          }
          fetch(anchor.href, { credentials: 'include', headers: headers })
            .then(function (response) {
              if (!response.ok) throw new Error(String(response.status));
              return response.blob();
            })
            .then(function (blob) {
              var reader = new FileReader();
              reader.onloadend = function () {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'download',
                  name: anchor.getAttribute('download') || 'casparel-download',
                  dataUrl: reader.result
                }));
              };
              reader.readAsDataURL(blob);
            })
            .catch(function (downloadError) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'download-error',
                message: downloadError && downloadError.message
              }));
            });
        }, true);
      })();
      true;
    `;
  }, [token]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false;
      webViewRef.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const shareDownloadedFile = async (name: string, base64: string) => {
    if (!FileSystem.cacheDirectory) throw new Error('cache unavailable');
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'casparel-download';
    const destination = `${FileSystem.cacheDirectory}${Date.now()}-${safeName}`;
    await FileSystem.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64 });
    if (!(await Sharing.isAvailableAsync())) throw new Error('sharing unavailable');
    await Sharing.shareAsync(destination, { dialogTitle: t('Save or share this file') });
  };

  const downloadFromUrl = async (url: string) => {
    if (!FileSystem.cacheDirectory) throw new Error('cache unavailable');
    const parsedName = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'casparel-download');
    const safeName = parsedName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'casparel-download';
    const destination = `${FileSystem.cacheDirectory}${Date.now()}-${safeName}`;
    const isSameOrigin = (() => {
      try {
        return new URL(url).origin === new URL(apiOrigin).origin;
      } catch {
        return false;
      }
    })();
    const result = await FileSystem.downloadAsync(url, destination, {
      headers: token && isSameOrigin ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!(await Sharing.isAvailableAsync())) throw new Error('sharing unavailable');
    await Sharing.shareAsync(result.uri, { dialogTitle: t('Save or share this file') });
  };

  const showDownloadError = () => {
    Alert.alert(t('Download failed'), t('The file could not be saved. Check your connection and try again.'));
  };

  const openExternal = (url: string) => {
    if (!/^(https?:|mailto:|tel:)/i.test(url)) return;
    void Linking.openURL(url);
  };

  if (requiresAuth && !token) {
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
      ref={webViewRef}
      key={reloadKey}
      source={{ uri: `${apiOrigin}${path}` }}
      originWhitelist={['https://*', 'http://*', 'mailto:*', 'tel:*']}
      injectedJavaScriptBeforeContentLoaded={sessionScript}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      setSupportMultipleWindows={false}
      allowsBackForwardNavigationGestures
      startInLoadingState
      renderLoading={() => (
        <View style={[StyleSheet.absoluteFill, styles.centered, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      onShouldStartLoadWithRequest={(request) => {
        const url = request.url;
        if (url === 'about:blank') return true;
        try {
          const requested = new URL(url);
          const appOrigin = new URL(apiOrigin);
          if (requested.origin !== appOrigin.origin) {
            openExternal(url);
            return false;
          }
          const destination = `${requested.pathname}${requested.search}${requested.hash}`;
          if (destination === '/plans' || destination.startsWith('/plans?')) {
            router.push('/paywall');
            return false;
          }
          return true;
        } catch {
          return false;
        }
      }}
      onNavigationStateChange={(navigation) => setCanGoBack(navigation.canGoBack)}
      onOpenWindow={(event) => openExternal(event.nativeEvent.targetUrl)}
      onFileDownload={(event) => {
        void downloadFromUrl(event.nativeEvent.downloadUrl).catch(showDownloadError);
      }}
      onMessage={(event) => {
        try {
          const message = JSON.parse(event.nativeEvent.data) as {
            type?: string;
            name?: string;
            dataUrl?: string;
          };
          if (message.type === 'download-error') {
            showDownloadError();
            return;
          }
          if (message.type !== 'download' || !message.dataUrl) return;
          const comma = message.dataUrl.indexOf(',');
          if (comma < 0) throw new Error('invalid download');
          void shareDownloadedFile(message.name ?? 'casparel-download', message.dataUrl.slice(comma + 1))
            .catch(showDownloadError);
        } catch {
          // Ignore messages not created by the native download bridge.
        }
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
