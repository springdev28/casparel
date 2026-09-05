/**
 * @fileOverview Android product role: hosts the complete responsive Casparel web application.
 * System connection: the native shell supplies the signed-in session, Google
 * Play billing, UMP/AdMob, and safe external-link handling while the website
 * remains the single complete implementation of every workspace.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { SponsoredLearningResourceCard } from '@/components/SponsoredLearningResourceCard';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAds } from '@/contexts/AdsContext';
import { apiOrigin } from '@/utils/api-host';
import { shouldShowSponsoredAd } from '@/utils/ad-placement';
import { classifyMobileWebUrl } from '@/utils/mobile-web-navigation';
import {
  useNotifications,
  type NotificationPreferences,
} from '@/contexts/NotificationsContext';

type NativeMessage =
  | { type: 'session'; token: string }
  | { type: 'logout' }
  | { type: 'language'; language: 'en' | 'tr' }
  | { type: 'ad-preferences'; soundMuted?: boolean; adsDisabled?: boolean }
  | { type: 'notification-preferences'; preferences: NotificationPreferences }
  | { type: 'open-native-paywall' }
  | { type: 'open-url'; url: string };

export default function MobileWebAppScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ path?: string }>();
  const { sync: syncNotifications } = useNotifications();
  const webView = useRef<WebView>(null);
  const { token, logout, updateToken } = useAuth();
  const { language, setLanguage } = useLanguage();
  const {
    soundMuted,
    adsDisabled,
    canDisableAds,
    setSoundMuted,
    setAdsDisabled,
  } = useAds();
  const [canGoBack, setCanGoBack] = useState(false);
  const [path, setPath] = useState('/dashboard');

  const sessionScript = useMemo(() => {
    const serializedToken = JSON.stringify(token ?? '');
    const serializedLanguage = JSON.stringify(language);
    const serializedSoundMuted = JSON.stringify(soundMuted);
    const serializedAdsDisabled = JSON.stringify(adsDisabled);
    const serializedCanDisableAds = JSON.stringify(canDisableAds);
    return `
      (function () {
        try {
          window.localStorage.setItem('schoolar_token', ${serializedToken});
          window.localStorage.setItem('schoolar_language', ${serializedLanguage});
          window.localStorage.setItem('casparel_native_shell', 'true');
          window.localStorage.setItem('casparel_ad_sound_muted', String(${serializedSoundMuted}));
          window.localStorage.setItem('casparel_ads_disabled', String(${serializedAdsDisabled}));
          window.localStorage.setItem('casparel_can_disable_ads', String(${serializedCanDisableAds}));
          window.dispatchEvent(new Event('schoolar-session-change'));
          window.dispatchEvent(new CustomEvent('schoolar-language-change', { detail: ${serializedLanguage} }));
          window.dispatchEvent(new CustomEvent('casparel-ad-preferences-change', { detail: {
            soundMuted: ${serializedSoundMuted},
            adsDisabled: ${serializedAdsDisabled},
            canDisableAds: ${serializedCanDisableAds}
          }}));
          if (!window.__casparelNativeLinksInstalled) {
            window.__casparelNativeLinksInstalled = true;
            var sendUrl = function (url) {
              if (!url) return;
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'open-url', url: String(url) }));
            };
            window.open = function (url) { sendUrl(url); return null; };
            document.addEventListener('click', function (event) {
              var element = event.target;
              var anchor = element && element.closest ? element.closest('a') : null;
              if (!anchor || !anchor.href) return;
              try {
                var destination = new URL(anchor.href, window.location.href);
                var sameHost = destination.hostname.replace(/^www\./, '') === window.location.hostname.replace(/^www\./, '');
                if (sameHost && destination.pathname === '/plans') {
                  event.preventDefault();
                  event.stopPropagation();
                  sendUrl(destination.href);
                  return;
                }
              } catch (_) {}
              if (anchor.target !== '_blank') return;
              event.preventDefault();
              event.stopPropagation();
              sendUrl(anchor.href);
            }, true);
          }
        } catch (_) {}
      })();
      true;
    `;
  }, [adsDisabled, canDisableAds, language, soundMuted, token]);

  useEffect(() => {
    webView.current?.injectJavaScript(sessionScript);
  }, [sessionScript]);

  const openDestination = useCallback(
    (rawUrl: string, navigateInternal: boolean) => {
      const destination = classifyMobileWebUrl(rawUrl, apiOrigin);
      if (destination.kind === 'ignore') return true;
      if (destination.kind === 'paywall') {
        router.push('/paywall');
        return false;
      }
      if (destination.kind === 'internal') {
        setPath(destination.path);
        const requested = new URL(rawUrl, apiOrigin).toString();
        const needsCorrection = requested !== destination.url;
        if (navigateInternal || needsCorrection) {
          webView.current?.injectJavaScript(
            `window.location.assign(${JSON.stringify(destination.url)}); true;`,
          );
        }
        return !needsCorrection;
      }
      void Linking.openURL(destination.url);
      return false;
    },
    [router],
  );

  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          if (!canGoBack) return false;
          webView.current?.goBack();
          return true;
        },
      );
      return () => subscription.remove();
    }, [canGoBack]),
  );

  function syncNavigation(state: WebViewNavigation) {
    setCanGoBack(state.canGoBack);
    const destination = classifyMobileWebUrl(state.url, apiOrigin);
    if (destination.kind === 'internal') {
      setPath(destination.path);
    }
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
      } else if (message.type === 'ad-preferences') {
        if (typeof message.soundMuted === 'boolean') {
          void setSoundMuted(message.soundMuted);
        }
        if (typeof message.adsDisabled === 'boolean') {
          void setAdsDisabled(message.adsDisabled);
        }
      } else if (message.type === 'notification-preferences') {
        // This message only arrives because somebody changed the setting, so
        // it is the one moment the system permission sheet is warranted.
        void syncNotifications(message.preferences, { promptIfNeeded: true });
      } else if (message.type === 'open-native-paywall') {
        router.push('/paywall');
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
      {shouldShowSponsoredAd(path) ? (
        <SponsoredLearningResourceCard key={path} />
      ) : null}
      <WebView
        ref={webView}
        source={{
          uri: `${apiOrigin}${routeParams.path?.startsWith('/') ? routeParams.path : '/dashboard'}`,
        }}
        originWhitelist={[
          // Derived from the configured origin, not hardcoded, so a staging
          // build pointed at another host still renders its own workspace.
          `${apiOrigin}/*`,
          `${apiOrigin.replace('://', '://www.')}/*`,
        ]}
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
