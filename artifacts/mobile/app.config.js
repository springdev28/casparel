/**
 * Expo config boundary for native SDK identifiers.
 *
 * AdMob application IDs are public identifiers, but production values still
 * live in EAS/environment configuration so a release can never inherit
 * Google's sample application by accident. Development and preview builds
 * opt in to Google's documented sample IDs through ADS_USE_TEST_IDS.
 */
const { expo } = require('./app.json');

const googleSamplePublisher = '3940256099942544';
const configuredTestAds = process.env.EXPO_PUBLIC_ADS_USE_TEST_IDS;
const useTestAds = configuredTestAds !== 'false';
const androidAppId = useTestAds
  ? `ca-app-pub-${googleSamplePublisher}~3347511713`
  : process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID;
const iosAppId = useTestAds
  ? `ca-app-pub-${googleSamplePublisher}~1458002511`
  : process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID;

module.exports = {
  expo: {
    ...expo,
    plugins: (expo.plugins ?? []).map((plugin) => {
      const name = Array.isArray(plugin) ? plugin[0] : plugin;
      if (name !== 'react-native-google-mobile-ads') return plugin;
      return [
        name,
        {
          androidAppId,
          iosAppId,
          // Consent is gathered by the app before the first ad request.
          delayAppMeasurementInit: true,
        },
      ];
    }),
  },
};
