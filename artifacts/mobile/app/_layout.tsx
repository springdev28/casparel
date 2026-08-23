/**
 * @fileOverview Mobile screen role: defines the Expo Router  Layout screen or route layout.
 * System connection: composed by Expo Router and backed by auth, onboarding, purchases, secure storage, and the shared API.
 */
import React, { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Stack, usePathname, useRouter, useSegments, type Href } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { storage } from "@/utils/secure-storage";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { useDesignSystemFonts } from "@workspace/edu-ds/hooks/use-fonts";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PurchasesProvider } from "@/contexts/PurchasesContext";
import { OnboardingProvider, useOnboarding } from "@/contexts/OnboardingContext";
import { MotionProvider } from "@/contexts/MotionContext";
import {
  mobileReturnPath,
  type MobileReturnPath,
} from "@/utils/navigation-intent";

// Module-level setup, runs before any component renders
const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) {
  setBaseUrl(`https://${domain}`);
}
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
  const { isAuthenticated, isLoading } = useAuth();
  const {
    ready: onboardingReady,
    needsOnboarding,
    replaying,
    takeCompletionDestination,
  } = useOnboarding();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const pendingPath = useRef<MobileReturnPath | null>(null);

  useEffect(() => {
    if (isLoading || !onboardingReady) return;
    // Both credential screens are reachable while signed out. Guarding on
    // "login" alone bounced anyone who tapped "Create an account" straight
    // back, which would have made the new screen unreachable.
    const inAuthScreen = segments[0] === "login" || segments[0] === "register";
    const inOnboarding = segments[0] === "onboarding";
    const nativeIntent = mobileReturnPath(pathname);

    if (!isAuthenticated) {
      if (!inAuthScreen) {
        // Keep a valid native destination while login temporarily owns the
        // route. Without this, a signed-out shared link always landed on the
        // dashboard after authentication instead of its resource or class.
        if (nativeIntent) pendingPath.current = nativeIntent;
        router.replace("/login");
      }
      return;
    }
    // Authenticated: show first-run onboarding once, then land on the tabs.
    if (needsOnboarding && !inOnboarding) {
      // A deliberate Profile replay is not a deep link to resume. Real
      // external/native intent still survives first-run onboarding.
      if (!replaying && !inAuthScreen && nativeIntent) pendingPath.current = nativeIntent;
      router.replace("/onboarding");
    } else if (!needsOnboarding && (inAuthScreen || inOnboarding)) {
      const requestedDestination = takeCompletionDestination();
      const destination = pendingPath.current ?? requestedDestination;
      pendingPath.current = null;
      router.replace((destination ?? "/(tabs)") as Href);
    }
  }, [
    isAuthenticated,
    isLoading,
    onboardingReady,
    needsOnboarding,
    pathname,
    replaying,
    router,
    segments,
    takeCompletionDestination,
  ]);

  if (isLoading || !onboardingReady) return null;

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen
        name="resource/[id]"
        options={{ title: "Resource", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="class/[id]"
        options={{ title: "Class", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="lists/index"
        options={{ title: "Learning Lists", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="lists/[id]"
        options={{ title: "Learning List", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="lists/[id]/path-review"
        options={{ title: "Path Review", headerBackTitle: "List" }}
      />
      <Stack.Screen
        name="goals/index"
        options={{ title: "Learning Paths", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="goals/[id]"
        options={{ title: "Learning Path", headerBackTitle: "Paths" }}
      />
      <Stack.Screen
        name="goals/[id]/study/[stepId]"
        options={{ title: "Focused Study", headerBackTitle: "Path" }}
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <MotionProvider>
                <AuthProvider>
                  <OnboardingProvider>
                    <PurchasesProvider>
                      <RootLayoutNav />
                    </PurchasesProvider>
                  </OnboardingProvider>
                </AuthProvider>
              </MotionProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
