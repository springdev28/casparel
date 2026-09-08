/**
 * @fileOverview Mobile screen role: defines the Expo Router  Layout screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
import React, { useEffect } from "react";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { storage } from "@/utils/secure-storage";
import { apiOrigin } from "@/utils/api-host";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { useDesignSystemFonts } from "@workspace/edu-ds/hooks/use-fonts";
import { useColors } from "@workspace/edu-ds/hooks/use-colors";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PurchasesProvider } from "@/contexts/PurchasesContext";
import { OnboardingProvider, useOnboarding } from "@/contexts/OnboardingContext";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import { MotionProvider } from "@/contexts/MotionContext";
import { AdsProvider } from "@/contexts/AdsContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { resolveInitialRoute, routeIsSettled } from "@/utils/initial-route";

// Module-level setup, runs before any component renders
setBaseUrl(apiOrigin);
setAuthTokenGetter(() => storage.getItemAsync("schoolar_token"));

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function RootLayoutNav() {
  const { t } = useLanguage();
  const colors = useColors();
  const { isAuthenticated, isLoading } = useAuth();
  const { ready: onboardingReady, needsOnboarding } = useOnboarding();
  const segments = useSegments();
  const router = useRouter();

  // One pure decision for every session/location combination, unit-tested in
  // utils/initial-route.test.ts so wrong-screen flashes are caught by CI, not
  // by users. Both credential screens are reachable while signed out; an
  // authenticated session lives on the hosted workspace or the paywall.
  const sessionRouteState = {
    isLoading,
    onboardingReady,
    isAuthenticated,
    needsOnboarding,
    segment: segments[0],
  };
  const routeIsReady = routeIsSettled(sessionRouteState);

  useEffect(() => {
    const decision = resolveInitialRoute(sessionRouteState);
    if (decision.kind === "replace") router.replace(decision.route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading, onboardingReady, needsOnboarding, segments, router]);

  useEffect(() => {
    if (routeIsReady) void SplashScreen.hideAsync();
  }, [routeIsReady]);

  // Keep the native splash visible until the authenticated destination is
  // selected. Rendering the navigator before this point paints the legacy
  // dashboard for one frame and then replaces it with the hosted app.
  if (!routeIsReady) return null;

  return (
    /*
     * The navigator draws its own header, and its default is white.
     *
     * Every screen underneath reads the design tokens and follows the phone's
     * setting, so on a dark phone the resource and class screens came up dark
     * with a bright white bar across the top -- the two screens with a header
     * are the two you reach by tapping something, which is most of the app's
     * navigation. `contentStyle` matters for the same reason: it is what shows
     * through during a push, and white there is a flash on every transition.
     */
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          color: colors.foreground,
          fontFamily: colors.fontFamily.sansSemiBold,
        },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="home" options={{ headerShown: false }} />
      <Stack.Screen name="mobile" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen
        name="paywall"
        options={{ presentation: "modal", headerShown: false }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const { fontsLoaded, fontError } = useDesignSystemFonts();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (AppState.currentState !== null) {
      focusManager.setFocused(AppState.currentState === 'active');
    }
    const subscription = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    return () => {
      subscription.remove();
      focusManager.setFocused(undefined);
    };
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            {/* One listener for the phone's Reduce Motion setting and one
                safe haptic boundary, shared by every interaction below. */}
            <MotionProvider>
              <AuthProvider>
                {/* Inside AuthProvider: the account's language is fetched with
                    the session token, so this needs the token to exist. */}
                <LanguageProvider>
                  <OnboardingProvider>
                    <PurchasesProvider>
                      {/* Android replaces this provider with the UMP/AdMob
                          implementation. Other platforms use its inert twin,
                          so the navigation tree stays platform-independent. */}
                      <NotificationsProvider>
                        <AdsProvider>
                          <RootLayoutNav />
                        </AdsProvider>
                      </NotificationsProvider>
                    </PurchasesProvider>
                  </OnboardingProvider>
                </LanguageProvider>
              </AuthProvider>
            </MotionProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
