import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWebReleaseConfig } from './release-config.mjs';

const valid = {
  VITE_REVENUECAT_WEB_API_KEY: 'rcb_public_checkout_key',
  VITE_ADSENSE_CLIENT_ID: 'ca-pub-1234567890123456',
  VITE_ADSENSE_DASHBOARD_SLOT: '1234567890',
};

test('accepts production-shaped public monetization configuration', () => {
  assert.deepEqual(validateWebReleaseConfig(valid), []);
});

test('fails closed when web billing or advertising is absent', () => {
  const problems = validateWebReleaseConfig({});
  assert.equal(problems.length, 3);
  assert.match(problems.join('\n'), /VITE_REVENUECAT_WEB_API_KEY/);
  assert.match(problems.join('\n'), /VITE_ADSENSE_CLIENT_ID/);
});

test('rejects a mobile or malformed RevenueCat key', () => {
  const problems = validateWebReleaseConfig({
    ...valid,
    VITE_REVENUECAT_WEB_API_KEY: 'goog_wrong_platform',
  });
  assert.match(problems.join('\n'), /rcb_/);
});
