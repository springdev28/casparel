/**
 * @fileOverview Native build role: supplies environment-aware AdMob metadata to Expo.
 * System connection: starts from app.json, configures the Google Mobile Ads and
 * UMP native SDKs, and is evaluated by local prebuilds and EAS before Android
 * source is generated.
 */
const base = require("./app.json");

// Google's published sample IDs are the only safe identifiers for local and
// preview builds. They render test inventory and cannot create accidental
// traffic against Casparel's production AdMob account.
const GOOGLE_TEST_ANDROID_APP_ID = "ca-app-pub-3940256099942544~3347511713";
const GOOGLE_TEST_IOS_APP_ID = "ca-app-pub-3940256099942544~1458002511";

const profile = process.env.EAS_BUILD_PROFILE;
const isProduction = profile === "production";
const androidAppId =
  process.env.ADMOB_ANDROID_APP_ID || GOOGLE_TEST_ANDROID_APP_ID;
const iosAppId = process.env.ADMOB_IOS_APP_ID || GOOGLE_TEST_IOS_APP_ID;

if (isProduction && !process.env.ADMOB_ANDROID_APP_ID) {
  throw new Error(
    "Production Android builds require ADMOB_ANDROID_APP_ID. Refusing to ship Google test metadata.",
  );
}

if (
  isProduction &&
  !process.env.EXPO_PUBLIC_ADMOB_ANDROID_DASHBOARD_NATIVE_AD_UNIT_ID
) {
  throw new Error(
    "Production Android builds require EXPO_PUBLIC_ADMOB_ANDROID_DASHBOARD_NATIVE_AD_UNIT_ID.",
  );
}

// app.json keeps the plugin names visible to the repository's static release
// checker. Replace those bare entries here with their actual native options.
const configuredElsewhere = new Set([
  "react-native-google-mobile-ads",
  "expo-build-properties",
]);
const plugins = (base.expo.plugins || []).filter((entry) => {
  const name = Array.isArray(entry) ? entry[0] : entry;
  return !configuredElsewhere.has(name);
});

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    plugins: [
      ...plugins,
      [
        "react-native-google-mobile-ads",
        {
          androidAppId,
          iosAppId,
          // UMP must finish before Google begins app measurement or preloads
          // an ad. AdsContext is the code that deliberately starts the SDK.
          delayAppMeasurementInit: true,
          optimizeInitialization: true,
          optimizeAdLoading: true,
        },
      ],
      [
        "expo-build-properties",
        {
          android: {
            // Google documents this keep rule for release builds that use the
            // User Messaging Platform consent form.
            extraProguardRules:
              "-keep class com.google.android.gms.internal.consent_sdk.** { *; }",
          },
        },
      ],
    ],
  },
};
