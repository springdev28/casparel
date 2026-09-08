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
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import {
  parseNativeAdPlacement,
  type NativeAdPlacement,
} from '@/utils/native-ad-placement';
import { classifyMobileWebUrl } from '@/utils/mobile-web-navigation';
import { initialWorkspaceLoad, workspaceLoadReducer } from '@/utils/workspace-load';
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
  const { language, setLanguage, t } = useLanguage();
  const entryUrl = `${apiOrigin}${routeParams.path?.startsWith('/') ? routeParams.path : '/dashboard'}`;
  const [load, dispatchLoad] = useReducer(workspaceLoadReducer, entryUrl, initialWorkspaceLoad);

  useEffect(() => { dispatchLoad({ type: 'open', url: entryUrl }); }, [entryUrl]);
  const {
    soundMuted,
    adsDisabled,
    canDisableAds,
    canRequestAds,
    setSoundMuted,
    setAdsDisabled,
  } = useAds();
  const [canGoBack, setCanGoBack] = useState(false);
  const [path, setPath] = useState('/dashboard');
  const [nativeAdPlacement, setNativeAdPlacement] =
    useState<NativeAdPlacement | null>(null);

  const sessionScript = useMemo(() => {
    const serializedToken = JSON.stringify(token ?? '');
    const serializedLanguage = JSON.stringify(language);
    const serializedSoundMuted = JSON.stringify(soundMuted);
    const serializedAdsDisabled = JSON.stringify(adsDisabled);
    const serializedCanDisableAds = JSON.stringify(canDisableAds);
    const serializedCanRequestAds = JSON.stringify(canRequestAds);
    return `
      (function () {
        try {
          window.localStorage.setItem('schoolar_token', ${serializedToken});
          window.localStorage.setItem('schoolar_language', ${serializedLanguage});
          window.localStorage.setItem('casparel_native_shell', 'true');
          window.localStorage.setItem('casparel_ad_sound_muted', String(${serializedSoundMuted}));
          window.localStorage.setItem('casparel_ads_disabled', String(${serializedAdsDisabled}));
          window.localStorage.setItem('casparel_can_disable_ads', String(${serializedCanDisableAds}));
          var nextNativeAdsEligible = String(${serializedCanRequestAds});
          var previousNativeAdsEligible = window.localStorage.getItem('casparel_native_ads_eligible');
          window.localStorage.setItem('casparel_native_ads_eligible', nextNativeAdsEligible);
          window.dispatchEvent(new Event('schoolar-session-change'));
          window.dispatchEvent(new CustomEvent('schoolar-language-change', { detail: ${serializedLanguage} }));
          window.dispatchEvent(new CustomEvent('casparel-ad-preferences-change', { detail: {
            soundMuted: ${serializedSoundMuted},
            adsDisabled: ${serializedAdsDisabled},
            canDisableAds: ${serializedCanDisableAds}
          }}));
          if (previousNativeAdsEligible !== nextNativeAdsEligible) {
            window.dispatchEvent(new Event('casparel-native-ads-eligibility-change'));
          }
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
                if (sameHost && (destination.pathname === '/plans' || destination.pathname === '/' || destination.pathname.startsWith('/auth/'))) {
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
  }, [adsDisabled, canDisableAds, canRequestAds, language, soundMuted, token]);

  useEffect(() => {
    webView.current?.injectJavaScript(sessionScript);
  }, [sessionScript]);

  const openDestination = useCallback(
    (rawUrl: string, navigateInternal: boolean) => {
      const destination = classifyMobileWebUrl(rawUrl, apiOrigin);
      if (destination.kind === 'ignore') return true;
      if (destination.kind === 'home' || destination.kind === 'login' || destination.kind === 'register') {
        router.navigate(`/${destination.kind}`);
        return false;
      }
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

  // The WebView remains mounted behind the native paywall and has its own
  // query cache. Refresh its plan when returning from a purchase or restore.
  useFocusEffect(useCallback(() => {
    webView.current?.injectJavaScript(
      'window.dispatchEvent(new Event("casparel-billing-refresh")); true;',
    );
  }, []));

  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          if (load.failed) {
            router.navigate('/home');
            return true;
          }
          if (!canGoBack) return false;
          webView.current?.goBack();
          return true;
        },
      );
      return () => subscription.remove();
    }, [canGoBack, load.failed, router]),
  );

  function syncNavigation(state: WebViewNavigation) {
    setCanGoBack(state.canGoBack);
    const destination = classifyMobileWebUrl(state.url, apiOrigin);
    if (destination.kind === 'internal') {
      dispatchLoad({ type: 'navigation', url: destination.url });
      if (destination.path !== path) {
        setNativeAdPlacement((current) =>
          current ? { ...current, visible: false } : null,
        );
      }
      setPath(destination.path);
    }
  }

  function receiveMessage(event: WebViewMessageEvent) {
    try {
      const parsed = JSON.parse(event.nativeEvent.data) as unknown;
      const placement = parseNativeAdPlacement(parsed);
      if (placement) {
        setNativeAdPlacement(placement);
        return;
      }
      const message = parsed as NativeMessage;
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

  const dismissNativeAd = useCallback((placementId: string) => {
    setNativeAdPlacement((current) =>
      current?.id === placementId ? { ...current, visible: false } : current,
    );
    webView.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent('casparel-native-ad-dismiss', { detail: ${JSON.stringify(placementId)} })); true;`,
    );
  }, []);

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
      <View style={styles.webArea}>
        <WebView
          key={load.generation}
          ref={webView}
          accessibilityElementsHidden={load.failed}
          importantForAccessibility={load.failed ? 'no-hide-descendants' : 'auto'}
          source={{ uri: load.sourceUrl }}
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
          onLoadStart={(event) => {
            const destination = classifyMobileWebUrl(event.nativeEvent.url, apiOrigin);
            if (destination.kind === 'internal') dispatchLoad({ type: 'loading', url: destination.url });
          }}
          onError={() => dispatchLoad({ type: 'failure' })}
          onHttpError={(event) => dispatchLoad({ type: 'failure', url: event.nativeEvent.url })}
          onRenderProcessGone={() => dispatchLoad({ type: 'failure' })}
          onContentProcessDidTerminate={() => dispatchLoad({ type: 'failure' })}
          renderError={() => <View />}
          onMessage={receiveMessage}
          onShouldStartLoadWithRequest={(request) => {
            return openDestination(request.url, false);
          }}
        />
        {load.failed ? (
          <ScrollView
            testID="workspace-load-error"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, zIndex: 20 }]}
            contentContainerStyle={styles.errorContent}
          >
            <Text accessibilityRole="header" style={[styles.errorTitle, { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold }]}>
              {t('Casparel could not load this workspace. Please try again.')}
            </Text>
            <Text style={[styles.errorMessage, { color: colors.mutedForeground }]}>
              {t('Check your connection and try again.')}
            </Text>
            <Pressable accessibilityRole="button" style={[styles.errorButton, { backgroundColor: colors.primary }]}
              onPress={() => { setCanGoBack(false); setNativeAdPlacement(null); dispatchLoad({ type: 'retry' }); }}>
              <Text style={{ color: colors.primaryForeground, fontFamily: colors.fontFamily.sansSemiBold }}>{t('Try again')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.errorButton} onPress={() => router.navigate('/home')}>
              <Text style={{ color: colors.primary }}>{t('Go to home screen')}</Text>
            </Pressable>
          </ScrollView>
        ) : null}
        {!load.failed && nativeAdPlacement && shouldShowSponsoredAd(path) && canRequestAds ? (
          <View
            pointerEvents={nativeAdPlacement.visible ? 'box-none' : 'none'}
            style={[
              styles.nativeAdOverlay,
              {
                top: nativeAdPlacement.visible
                  ? nativeAdPlacement.top
                  : -10_000,
                left: nativeAdPlacement.left,
                width: nativeAdPlacement.width,
                height: nativeAdPlacement.height,
                opacity: nativeAdPlacement.visible ? 1 : 0,
              },
            ]}
          >
            <SponsoredLearningResourceCard
              key={nativeAdPlacement.id}
              placementId={nativeAdPlacement.id}
              onDismiss={() => dismissNativeAd(nativeAdPlacement.id)}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webArea: { flex: 1, position: 'relative' },
  loading: { alignItems: 'center', justifyContent: 'center' },
  errorContent: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 16 },
  errorTitle: { fontSize: 22, lineHeight: 30, textAlign: 'center' },
  errorMessage: { fontSize: 16, lineHeight: 24, textAlign: 'center' },
  errorButton: { minHeight: 48, borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center' },
  nativeAdOverlay: {
    position: 'absolute',
    zIndex: 10,
    overflow: 'hidden',
    paddingHorizontal: 3,
  },
});
