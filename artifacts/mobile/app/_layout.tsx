import React, { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Redirect, Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { storage } from "@/utils/secure-storage";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { useDesignSystemFonts } from "@workspace/edu-ds/hooks/use-fonts";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PurchasesProvider } from "@/contexts/PurchasesContext";
import { OnboardingProvider, useOnboarding } from "@/contexts/OnboardingContext";

// Module-level setup — runs before any component renders
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
  const { ready: onboardingReady, needsOnboarding } = useOnboarding();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !onboardingReady) return;
    const inLogin = segments[0] === "login";
    const inOnboarding = segments[0] === "onboarding";

    if (!isAuthenticated) {
      if (!inLogin) router.replace("/login");
      return;
    }
    // Authenticated: show first-run onboarding once, then land on the tabs.
    if (needsOnboarding && !inOnboarding) {
      router.replace("/onboarding");
    } else if (!needsOnboarding && (inLogin || inOnboarding)) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, onboardingReady, needsOnboarding, segments, router]);

  if (isLoading || !onboardingReady) return null;

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
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
              <AuthProvider>
                <OnboardingProvider>
                  <PurchasesProvider>
                    <RootLayoutNav />
                  </PurchasesProvider>
                </OnboardingProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
