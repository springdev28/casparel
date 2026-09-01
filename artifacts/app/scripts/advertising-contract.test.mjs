import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ad = fs.readFileSync(new URL('../src/components/WebAdSlot.tsx', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../src/pages/AdaptiveDashboardPage.tsx', import.meta.url), 'utf8');

test('web ads fail closed until the authoritative Free tier is loaded', () => {
  assert.match(ad, /!plan\.pending &&\s+plan\.tier === 'free'/);
  assert.match(ad, /billingState === 'free'/);
  assert.match(ad, /webBillingEntitlementState/);
});

test('web ads are non-personalized and isolated to the dashboard', () => {
  assert.match(ad, /requestNonPersonalizedAds = 1/);
  assert.match(ad, /data-npa="1"/);
  assert.match(ad, /casparel_native_shell/);
  assert.match(dashboard, /<WebAdSlot \/>/);
});
