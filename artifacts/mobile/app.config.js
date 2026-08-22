const base = require('./app.json');

// Google's sample App IDs keep local/dev builds buildable before Casparel's
// production AdMob apps exist. Production EAS builds must provide the real IDs.
const GOOGLE_TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const GOOGLE_TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

const androidAppId = process.env.ADMOB_ANDROID_APP_ID || GOOGLE_TEST_ANDROID_APP_ID;
const iosAppId = process.env.ADMOB_IOS_APP_ID || GOOGLE_TEST_IOS_APP_ID;

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    plugins: [
      ...(base.expo.plugins || []),
      [
        'react-native-google-mobile-ads',
        {
          androidAppId,
          iosAppId,
        },
      ],
    ],
  },
};
