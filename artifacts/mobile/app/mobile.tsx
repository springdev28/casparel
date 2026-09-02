/**
 * @fileOverview Android product role: hosts the complete responsive Casparel web application.
 * System connection: the native shell supplies the signed-in session, Google
 * Play billing, UMP/AdMob, and safe external-link handling while the website
 * remains the single complete implementation of every workspace.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useLanguage } from '@/contexts/LanguageContext';
import { apiOrigin } from '@/utils/api-host';
import { classifyMobileWebUrl } from '@/utils/mobile-web-navigation';

type NativeMessage =
  | { type: 'session'; token: string }
  | { type: 'logout' }
  | { type: 'language'; language: 'en' | 'tr' }
  | { type: 'open-url'; url: string };

export default function MobileWebAppScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const webView = useRef<WebView>(null);
  const { token, logout, updateToken } = useAuth();
  const { language, setLanguage } = useLanguage();
  const [canGoBack, setCanGoBack] = useState(false);
  const [path, setPath] = useState('/dashboard');

  const sessionScript = useMemo(() => {
    const serializedToken = JSON.stringify(token ?? '');
    const serializedLanguage = JSON.stringify(language);
    return `
      (function () {
        try {
          window.localStorage.setItem('schoolar_token', ${serializedToken});
          window.localStorage.setItem('schoolar_language', ${serializedLanguage});
          window.localStorage.setItem('casparel_native_shell', 'true');
          window.dispatchEvent(new Event('schoolar-session-change'));
          window.dispatchEvent(new CustomEvent('schoolar-language-change', { detail: ${serializedLanguage} }));
          if (!window.__casparelNativeLinksInstalled) {
            window.__casparelNativeLinksInstalled = true;
            var sendUrl = function (url) {
              if (!url) return;
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'open-url', url: String(url) }));
            };
            window.open = function (url) { sendUrl(url); return null; };
            document.addEventListener('click', function (event) {
              var element = event.target;
              var anchor = element && element.closest ? element.closest('a[target="_blank"]') : null;
              if (!anchor || !anchor.href) return;
              event.preventDefault();
              event.stopPropagation();
              sendUrl(anchor.href);
            }, true);
          }
        } catch (_) {}
      })();
      true;
    `;
  }, [language, token]);

  useEffect(() => {
    webView.current?.injectJavaScript(sessionScript);
  }, [sessionScript]);

  const openDestination = useCallback((rawUrl: string, navigateInternal: boolean) => {
    const destination = classifyMobileWebUrl(rawUrl, apiOrigin);
    if (destination.kind === 'ignore') return true;
    if (destination.kind === 'paywall') {
      router.push('/paywall');
      return false;
    }
    if (destination.kind === 'internal') {
      setPath(destination.path);
      if (navigateInternal) {
        webView.current?.injectJavaScript(
          `window.location.assign(${JSON.stringify(destination.url)}); true;`,
        );
      }
      return true;
    }
    void Linking.openURL(destination.url);
    return false;
  }, [router]);

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
    const destination = classifyMobileWebUrl(state.url, apiOrigin);
    if (destination.kind === 'internal') setPath(destination.path);
  }

  function receiveMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as NativeMessage;
      if (message.type === 'logout') {
        void logout();
      } else if (message.type === 'session' && message.token) {
        void updateToken(message.token);
      } else if (message.type === 'language') {
        void setLanguage(message.language);
      } else if (message.type === 'open-url' && message.url) {
        openDestination(message.url, true);
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
        originWhitelist={['https://casparel.com/*', 'https://www.casparel.com/*']}
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
          return openDestination(request.url, false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { alignItems: 'center', justifyContent: 'center' },
});
