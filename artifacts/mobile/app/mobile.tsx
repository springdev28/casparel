/**
 * @fileOverview Android product role: hosts the complete responsive Casparel web application.
 * System connection: the native shell supplies the signed-in session, Google
 * Play billing, UMP/AdMob, and safe external-link handling while the website
 * remains the single complete implementation of every workspace.
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { SponsoredLearningResourceCard } from '@/components/SponsoredLearningResourceCard';
import { useAuth } from '@/contexts/AuthContext';
import { apiOrigin } from '@/utils/api-host';

type NativeMessage =
  | { type: 'session'; token: string }
  | { type: 'logout' };

function pathFromUrl(url: string): string {
  if (!url.startsWith(apiOrigin)) return '';
  try {
    return new URL(url).pathname;
  } catch {
    return url.slice(apiOrigin.length).split('?')[0] || '/dashboard';
  }
}

export default function MobileWebAppScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const webView = useRef<WebView>(null);
  const { token, logout, updateToken } = useAuth();
  const [canGoBack, setCanGoBack] = useState(false);
  const [path, setPath] = useState('/dashboard');

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

  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!canGoBack) return false;
        webView.current?.goBack();
        return true;
      });
      return () => subscription.remove();
    }, [canGoBack]),
  );

  function syncNavigation(state: WebViewNavigation) {
    setCanGoBack(state.canGoBack);
    const nextPath = pathFromUrl(state.url);
    if (nextPath) setPath(nextPath);
  }

  function receiveMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as NativeMessage;
      if (message.type === 'logout') {
        void logout();
      } else if (message.type === 'session' && message.token) {
        void updateToken(message.token);
      }
    } catch {
      // Ignore non-Casparel messages from page scripts.
    }
  }

  if (!token) return null;

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {path === '/dashboard' ? <SponsoredLearningResourceCard /> : null}
      <WebView
        ref={webView}
        source={{ uri: `${apiOrigin}/dashboard` }}
        originWhitelist={[`${apiOrigin}/*`]}
        injectedJavaScriptBeforeContentLoaded={sessionScript}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        startInLoadingState
        renderLoading={() => (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.loading,
              { backgroundColor: colors.background },
            ]}
          >
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
        onNavigationStateChange={syncNavigation}
        onMessage={receiveMessage}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === 'about:blank') return true;
          if (request.url.startsWith(apiOrigin)) {
            const destination = pathFromUrl(request.url);
            if (destination === '/plans') {
              router.push('/paywall');
              return false;
            }
            return true;
          }
          void Linking.openURL(request.url);
          return false;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { alignItems: 'center', justifyContent: 'center' },
});
