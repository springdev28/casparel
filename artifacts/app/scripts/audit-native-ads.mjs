/** Checks the real built workspace's placement messages; never requests live inventory. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { installSession } from './audit-fixtures.mjs';
import { launchOptions } from './chromium.mjs';
import { serveBuild } from './serve-build.mjs';

/** @typedef {{ type?: string, id?: string, top?: number, height?: number, clipTop?: number, clipBottom?: number, visible?: boolean }} AdMessage */
/** @typedef {Window & { casparelNativeAdReadiness: boolean, casparelNativeAdClipping: boolean, nativeMessages: AdMessage[], ReactNativeWebView: { postMessage: (value: string) => void } }} HarnessWindow */
/** @type {Array<[number, number, boolean]>} */
const cases = [[320, 568, true], [390, 844, true], [390, 844, false]];

const server = serveBuild(fileURLToPath(new URL('../dist/public', import.meta.url)), 0);
const port = await server.ready;
const browser = await chromium.launch(launchOptions());
try {
  for (const [width, height, readinessSupported] of cases) {
    const context = await browser.newContext({ viewport: { width, height } });
    await installSession(context, { role: 'student' });
    await context.addInitScript(readinessSupported => {
      (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).casparelNativeAdReadiness = readinessSupported;
      (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).casparelNativeAdClipping = readinessSupported;
      localStorage.setItem('casparel_native_shell', 'true');
      localStorage.setItem('casparel_native_ads_eligible', 'false');
      (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).nativeMessages = [];
      (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).ReactNativeWebView = { postMessage: value => (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).nativeMessages.push(JSON.parse(value)) };
    }, readinessSupported);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    const adRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route(/googlesyndication|doubleclick/, route => {
      adRequests.push(route.request().url());
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:${port}/dashboard`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByTestId('native-inline-ad-placeholder').count(), 0);
    // A hidden/offscreen popup must not suppress the native creative. Keep a
    // style animation running as well: placement updates must not starve.
    await page.evaluate(() => {
      const popup = document.createElement('div');
      popup.id = 'ad-audit-offscreen-popup';
      popup.setAttribute('data-radix-popper-content-wrapper', '');
      popup.style.cssText = 'position:fixed;top:-10000px;width:100px;height:100px';
      document.body.append(popup);
      let count = 0;
      const animate = () => {
        if (!popup.isConnected) return;
        popup.style.opacity = String(0.5 + (count++ % 10) / 20);
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    });
    await page.evaluate(() => {
      localStorage.setItem('casparel_native_ads_eligible', 'true');
      window.dispatchEvent(new Event('casparel-native-ads-eligibility-change'));
    });
    if (readinessSupported) {
      await page.getByTestId('native-inline-ad-placeholder').waitFor({ state: 'attached' });
      assert.equal((await page.getByTestId('native-inline-ad-placeholder').boundingBox()).height, 0, 'no blank card while inventory loads');
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('casparel-native-ad-ready', { detail: { id: 'inline:/other-page', ready: true } })));
      assert.equal((await page.getByTestId('native-inline-ad-placeholder').boundingBox()).height, 0, 'ignore an old page creative');
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('casparel-native-ad-ready', { detail: { id: 'inline:/dashboard', ready: true } })));
    }
    await page.waitForFunction(() => (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).nativeMessages.some(message => message.type === 'native-ad-placement' && message.visible));
    const placement = await page.evaluate(() => (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).nativeMessages.filter(message => message.type === 'native-ad-placement').at(-1));
    assert.ok(placement.top >= 72 && placement.top + placement.height <= height, 'ad must be visible below the toolbar without scrolling to the bottom');
    assert.equal(await page.getByTestId('native-inline-ad-placeholder').count(), 1);
    // Mounted but transparent menus and tooltip accessibility text also do
    // not cover the ad. Real navigation below still must hide it.
    for (const hiddenStyle of ['opacity:0', 'visibility:hidden', 'display:none']) {
      await page.evaluate(style => {
        const popup = document.createElement('div');
        popup.id = 'ad-audit-hidden-menu';
        popup.setAttribute('role', 'menu');
        popup.style.cssText = `position:fixed;top:100px;width:100px;height:100px;${style}`;
        document.body.append(popup);
      }, hiddenStyle);
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).nativeMessages.filter(message => message.type === 'native-ad-placement').at(-1)?.visible), true, `${hiddenStyle} menu must not hide the ad`);
      await page.evaluate(() => document.getElementById('ad-audit-hidden-menu').remove());
    }
    await page.evaluate(() => {
      const tooltip = document.createElement('span');
      tooltip.setAttribute('role', 'tooltip');
      tooltip.className = 'sr-only';
      tooltip.textContent = 'Navigation hint';
      document.body.append(tooltip);
    });
    if (readinessSupported) {
    // A loaded native card reports its real height; even a large creative
    // must remain partially visible on the smallest phone.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('casparel-native-ad-ready', { detail: { id: 'inline:/dashboard', ready: true, height: 420 } })));
    await page.waitForFunction(() => (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).nativeMessages.filter(message => message.type === 'native-ad-placement').at(-1)?.height === 420);
    await page.evaluate(() => document.querySelector('main').scrollBy(0, 30));
    await page.waitForFunction(() => {
      const latest = (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).nativeMessages.filter(message => message.type === 'native-ad-placement').at(-1);
      return latest?.visible && latest.clipTop > 0;
    });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.waitForFunction(() => (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).nativeMessages.filter(message => message.type === 'native-ad-placement').at(-1)?.visible === false);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).nativeMessages.filter(message => message.type === 'native-ad-placement').at(-1)?.visible === true);
    await page.evaluate(() => document.querySelector('main').scrollBy(0, 600));
    await page.waitForFunction(() => (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).nativeMessages.filter(message => message.type === 'native-ad-placement').at(-1)?.visible === false);
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 0));
    await page.waitForFunction(() => (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).nativeMessages.filter(message => message.type === 'native-ad-placement').at(-1)?.visible === true);

    }
    assert.deepEqual(adRequests, [], 'the native slot must never request a second AdSense creative');
    await page.evaluate(id => window.dispatchEvent(new CustomEvent('casparel-native-ad-dismiss', { detail: id })), placement.id);
    await page.getByTestId('native-inline-ad-placeholder').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => (/** @type {HarnessWindow} */ (/** @type {unknown} */ (window))).nativeMessages.filter(message => message.type === 'native-ad-placement').at(-1).visible), false);
    await page.goto(`http://127.0.0.1:${port}/plans`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByTestId('native-inline-ad-placeholder').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS native ad placement ${width}px (readiness bridge ${readinessSupported}): eligibility, animated/offscreen/hidden overlays, measured height, partial scrolling, sidebar occlusion, return to view, dismissal compatibility, excluded payment route`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
