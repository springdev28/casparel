/**
 * @fileOverview Mobile native-boundary role: loads Google Mobile Ads only where its native module exists.
 * System connection: AdsContext and the Android sponsored card share this
 * loader so Expo Go, iOS, and web retain the same graceful behavior as the
 * existing lazy RevenueCat integration.
 */
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

export type GoogleMobileAdsModule =
  typeof import("react-native-google-mobile-ads");

let cached: GoogleMobileAdsModule | null | undefined;

/**
 * Expo Go cannot contain third-party native modules. A static import would
 * crash the whole app before entitlement or consent gates could return null.
 */
export async function loadGoogleMobileAds(): Promise<GoogleMobileAdsModule | null> {
  if (cached !== undefined) return cached;
  if (
    Platform.OS !== "android" ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    cached = null;
    return null;
  }

  try {
    cached = await import("react-native-google-mobile-ads");
  } catch {
    cached = null;
  }
  return cached;
}
