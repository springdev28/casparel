import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('mobile release RevenueCat guard', () => {
  function runReleaseCheck(overrides = {}) {
    const env = { ...process.env };
    for (const key of [
      'EAS_BUILD_PROFILE',
      'EAS_BUILD_PLATFORM',
      'EXPO_PUBLIC_RC_USE_TEST_STORE',
      'EXPO_PUBLIC_RC_ANDROID_KEY',
      'EXPO_PUBLIC_RC_IOS_KEY',
      'EXPO_PUBLIC_RC_TEST_KEY',
      'EXPO_PUBLIC_ADS_USE_TEST_IDS',
      'EXPO_PUBLIC_ADMOB_ANDROID_APP_ID',
      'EXPO_PUBLIC_ADMOB_IOS_APP_ID',
      'EXPO_PUBLIC_ADMOB_ANDROID_DASHBOARD_UNIT_ID',
    ]) {
      delete env[key];
    }
    return spawnSync(
      process.execPath,
      [path.resolve('scripts/check-release-config.mjs')],
      {
        cwd: process.cwd(),
        env: { ...env, ...overrides },
        encoding: 'utf8',
      },
    );
  }

  it('rejects a Test Store key selected for production', () => {
    const result = runReleaseCheck({
      EAS_BUILD_PROFILE: 'production',
      EAS_BUILD_PLATFORM: 'android',
      EXPO_PUBLIC_RC_USE_TEST_STORE: 'false',
      EXPO_PUBLIC_RC_ANDROID_KEY: 'test_never_ship',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('selects a Test Store key');
  });

  it('rejects a production Android build with no real RevenueCat key', () => {
    const result = runReleaseCheck({
      EAS_BUILD_PROFILE: 'production',
      EAS_BUILD_PLATFORM: 'android',
      EXPO_PUBLIC_RC_USE_TEST_STORE: 'false',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing EXPO_PUBLIC_RC_ANDROID_KEY');
  });

  it('accepts a production Android build with a Google Play RevenueCat key', () => {
    const result = runReleaseCheck({
      EAS_BUILD_PROFILE: 'production',
      EAS_BUILD_PLATFORM: 'android',
      EXPO_PUBLIC_RC_USE_TEST_STORE: 'false',
      EXPO_PUBLIC_RC_ANDROID_KEY: 'goog_configured_for_release',
      EXPO_PUBLIC_ADS_USE_TEST_IDS: 'false',
      EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: 'ca-app-pub-1234567890123456~1234567890',
      EXPO_PUBLIC_ADMOB_ANDROID_DASHBOARD_UNIT_ID: 'ca-app-pub-1234567890123456/1234567890',
    });
    expect(result.status).toBe(0);
  });

  it('requires a Test Store key for an internal preview build', () => {
    const result = runReleaseCheck({
      EAS_BUILD_PROFILE: 'preview',
      EAS_BUILD_PLATFORM: 'android',
      EXPO_PUBLIC_RC_USE_TEST_STORE: 'true',
      EXPO_PUBLIC_ADS_USE_TEST_IDS: 'true',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing a valid EXPO_PUBLIC_RC_TEST_KEY');
  });

  it('rejects Google sample ads in a production Android build', () => {
    const result = runReleaseCheck({
      EAS_BUILD_PROFILE: 'production',
      EAS_BUILD_PLATFORM: 'android',
      EXPO_PUBLIC_RC_USE_TEST_STORE: 'false',
      EXPO_PUBLIC_RC_ANDROID_KEY: 'goog_configured_for_release',
      EXPO_PUBLIC_ADS_USE_TEST_IDS: 'false',
      EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: 'ca-app-pub-3940256099942544~3347511713',
      EXPO_PUBLIC_ADMOB_ANDROID_DASHBOARD_UNIT_ID: 'ca-app-pub-3940256099942544/6300978111',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Google's sample identifier");
  });
});
