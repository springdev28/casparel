/**
 * @fileOverview Mobile screen role: defines the Expo Router  Layout screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
import React, { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Redirect, Stack, useRouter, useSegments } from "expo-router";
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

  const inAuthScreen = segments[0] === "login" || segments[0] === "register";
  const inOnboarding = segments[0] === "onboarding";
  const inMobileApp = segments[0] === "mobile";
  const inNativeModal = segments[0] === "paywall";
  const routeIsReady =
    !isLoading &&
    onboardingReady &&
    (!isAuthenticated
      ? inAuthScreen
      : needsOnboarding
        ? inOnboarding
        : inMobileApp || inNativeModal);

  useEffect(() => {
    if (isLoading || !onboardingReady) return;
    // Both credential screens are reachable while signed out. Guarding on
    // "login" alone bounced anyone who tapped "Create an account" straight
    // back, which would have made the new screen unreachable.
    if (!isAuthenticated) {
      if (!inAuthScreen) router.replace("/login");
      return;
    }
    // Authenticated: show first-run onboarding once, then use the complete
    // responsive web product as Android's single source of feature truth.
    if (needsOnboarding && !inOnboarding) {
      router.replace("/onboarding");
    } else if (
      !needsOnboarding &&
      !inMobileApp &&
      !inNativeModal
    ) {
      router.replace("/mobile");
    }
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="mobile" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen
        name="resource/[id]"
        options={{ title: t('Resource'), headerBackTitle: t("Back") }}
      />
      <Stack.Screen
        name="class/[id]"
        options={{ title: t('Class'), headerBackTitle: t("Back") }}
      />
      <Stack.Screen
        name="study/[id]"
        options={{ title: t('Study'), headerBackTitle: t("Back") }}
      />
      <Stack.Screen
        name="messages/index"
        options={{ title: t('Messages'), headerBackTitle: t("Back") }}
      />
      <Stack.Screen
        name="goals/index"
        options={{ title: t('Learning goals'), headerBackTitle: t("Back") }}
      />
      <Stack.Screen
        name="lists/index"
        options={{ title: t('Learning lists'), headerBackTitle: t("Back") }}
      />
      <Stack.Screen
        name="lists/[id]"
        options={{ title: t('Learning list'), headerBackTitle: t("Back") }}
      />
      <Stack.Screen
        /* The goal's own title is too long for a phone header and belongs to
           the reader rather than to us, so the header names the kind of thing
           and the screen names the thing. */
        name="goals/[id]"
        options={{ title: t('Goal'), headerBackTitle: t("Back") }}
      />
      <Stack.Screen
        /* The title becomes the other person's name once the conversation
           loads; this is what shows for the moment before it does. */
        name="messages/[id]"
        options={{ title: t('Conversation'), headerBackTitle: t("Back") }}
      />
      <Stack.Screen
        name="paywall"
        options={{ presentation: "modal", headerShown: false }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const { fontsLoaded, fontError } = useDesignSystemFonts();

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
                      <AdsProvider>
                        <RootLayoutNav />
                      </AdsProvider>
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
