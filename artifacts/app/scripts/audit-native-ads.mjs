/** Checks the real built workspace's placement messages; never requests live inventory. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { installSession } from './audit-fixtures.mjs';
import { launchOptions } from './chromium.mjs';
import { serveBuild } from './serve-build.mjs';

const server = serveBuild(fileURLToPath(new URL('../dist/public', import.meta.url)), 0);
const port = await server.ready;
const browser = await chromium.launch(launchOptions());
try {
  for (const [width, height] of [[320, 568], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await installSession(context, { role: 'student' });
    await context.addInitScript(() => {
      localStorage.setItem('casparel_native_shell', 'true');
      localStorage.setItem('casparel_native_ads_eligible', 'false');
      window.nativeMessages = [];
      window.ReactNativeWebView = { postMessage: value => window.nativeMessages.push(JSON.parse(value)) };
    });
    const page = await context.newPage();
    const errors = [];
    const adRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route(/googlesyndication|doubleclick/, route => {
      adRequests.push(route.request().url());
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:${port}/dashboard`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByTestId('native-inline-ad-placeholder').count(), 0);
    await page.evaluate(() => {
      localStorage.setItem('casparel_native_ads_eligible', 'true');
      window.dispatchEvent(new Event('casparel-native-ads-eligibility-change'));
    });
    await page.waitForFunction(() => window.nativeMessages.some(message => message.type === 'native-ad-placement' && message.visible));
    const placement = await page.evaluate(() => window.nativeMessages.filter(message => message.type === 'native-ad-placement').at(-1));
    assert.ok(placement.top >= 72 && placement.top + placement.height <= height, 'ad must be visible below the toolbar without scrolling to the bottom');
    assert.equal(await page.getByTestId('native-inline-ad-placeholder').count(), 1);
    assert.deepEqual(adRequests, [], 'the native slot must never request a second AdSense creative');
    await page.evaluate(id => window.dispatchEvent(new CustomEvent('casparel-native-ad-dismiss', { detail: id })), placement.id);
    await page.getByTestId('native-inline-ad-placeholder').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.nativeMessages.filter(message => message.type === 'native-ad-placement').at(-1).visible), false);
    await page.goto(`http://127.0.0.1:${port}/plans`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByTestId('native-inline-ad-placeholder').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS native ad placement ${width}px: eligibility, visible first-screen placement, dismissal, excluded payment route`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
