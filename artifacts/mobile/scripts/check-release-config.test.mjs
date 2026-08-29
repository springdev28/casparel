import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('mobile release RevenueCat guard', () => {
  it('rejects a Test Store key selected for production', () => {
    const result = spawnSync(
      process.execPath,
      [path.resolve('scripts/check-release-config.mjs')],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          EAS_BUILD_PROFILE: 'production',
          EXPO_PUBLIC_RC_USE_TEST_STORE: 'false',
          EXPO_PUBLIC_RC_ANDROID_KEY: 'test_never_ship',
        },
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('selects a Test Store key');
  });
});
