/** Real app interactions: audible first tap, quick glow, mute, and reduced motion. */
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installSession(context, { role: 'student' });
  await context.addInitScript(() => {
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      document.documentElement.dataset.cueCount = String(Number(document.documentElement.dataset.cueCount || 0) + 1);
      return create.call(this);
    };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (typeof options === 'object' && options?.duration === 180) {
        document.documentElement.dataset.glowCount = String(Number(document.documentElement.dataset.glowCount || 0) + 1);
      }
      return animate.call(this, frames, options);
    };
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/dashboard`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog').waitFor();
  await page.waitForFunction(() => Number(document.documentElement.dataset.cueCount) > 0);
  assert.ok(await page.evaluate(() => Number(document.documentElement.dataset.glowCount) > 0));
  await page.keyboard.press('Escape');
  await page.goto(`http://127.0.0.1:${port}/settings`, { waitUntil: 'networkidle' });
  const sound = page.getByRole('switch', { name: 'Play sound effects', exact: true });
  assert.equal(await sound.getAttribute('aria-checked'), 'true');
  await sound.click();
  assert.equal(await sound.getAttribute('aria-checked'), 'false');
  const count = await page.evaluate(() => Number(document.documentElement.dataset.cueCount || 0));
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.evaluate(() => Number(document.documentElement.dataset.cueCount || 0)), count, 'muted controls must not schedule audio');
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const glows = await page.evaluate(() => Number(document.documentElement.dataset.glowCount || 0));
  await sound.click();
  await page.waitForFunction(previous => Number(document.documentElement.dataset.cueCount || 0) > previous, count);
  assert.equal(await page.evaluate(() => Number(document.documentElement.dataset.glowCount || 0)), glows, 'reduced motion must suppress press glows');
  assert.equal(await sound.getAttribute('aria-checked'), 'true');
  assert.deepEqual(errors, []);
  console.log('PASS actual controls: first-tap audio, 180ms glow, immediate action, persisted mute, reduced motion, audible Settings preview');
  await context.close();
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
