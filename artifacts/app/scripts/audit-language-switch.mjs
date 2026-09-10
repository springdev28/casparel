/** Exercise language changes in the built mobile workspace without navigation. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { installSession } from './audit-fixtures.mjs';
import { launchOptions } from './chromium.mjs';
import { serveBuild } from './serve-build.mjs';

const server = serveBuild(fileURLToPath(new URL('../dist/public', import.meta.url)), 0);
const port = await server.ready;
const browser = await chromium.launch(launchOptions());
try {
  for (const width of [320, 390, 1280]) {
    const height = width < 768 ? 640 : 900;
    const context = await browser.newContext({ viewport: { width, height } });
    let language = 'en';
    await installSession(context, {
      role: 'student',
      transformBody: (body, pathname) => pathname === '/api/users/me/preferences'
        ? { ...body, language } : body,
    });
    await context.addInitScript(() => {
      localStorage.setItem('schoolar_language', 'en');
      localStorage.setItem('casparel_native_shell', 'true');
      localStorage.setItem('casparel_native_ads_eligible', 'false');
      Object.assign(window, { ReactNativeWebView: { postMessage: (value) => {
        localStorage.setItem('last-native-message', value);
      } } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const documents = [];
    page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url()); });
    const popups = [];
    page.on('popup', popup => popups.push(popup.url()));
    await page.goto(`http://127.0.0.1:${port}/settings`, { waitUntil: 'networkidle' });
    const initialDocuments = documents.length;
    await page.evaluate(() => {
      const sample = document.createElement('section');
      sample.id = 'language-switch-sample';
      sample.innerHTML = '<span>Settings</span><input placeholder="Search resources…"><p translate="no">My English title</p>';
      document.body.append(sample);
    });
    if (width < 768) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    const picker = width < 768
      ? page.getByRole('dialog').getByTestId('language-select')
      : page.getByTestId('sidebar-language').getByTestId('language-select');
    for (const next of ['tr', 'en', 'tr']) {
      language = next;
      await picker.selectOption(next);
      await page.waitForFunction(({ next }) =>
        document.querySelector('#language-switch-sample span')?.textContent === (next === 'tr' ? 'Ayarlar' : 'Settings'), { next });
      await page.waitForTimeout(300);
      assert.equal(documents.length, initialDocuments, 'language selection must not reload the workspace');
      assert.equal(await page.locator('#language-switch-sample p').textContent(), 'My English title');
      assert.equal(await page.locator('#language-switch-sample input').getAttribute('placeholder'), next === 'tr' ? 'Kaynaklarda ara…' : 'Search resources…');
      const values = await page.getByTestId('language-select').evaluateAll(selects => selects.map(select => /** @type {HTMLSelectElement} */ (select).value));
      assert.ok(values.every(value => value === next), 'settings and navigation language controls stay in sync');
      assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('last-native-message'))), { type: 'language', language: next });
    }
    // The installed native shell sends window events, not document events.
    await page.evaluate(() => {
      localStorage.setItem('schoolar_language', 'en');
      window.dispatchEvent(new CustomEvent('schoolar-language-change', { detail: 'en' }));
    });
    await page.waitForFunction(() => document.querySelector('#language-switch-sample span')?.textContent === 'Settings');
    assert.equal(await picker.inputValue(), 'en');
    await page.evaluate(() => {
      localStorage.setItem('schoolar_language', 'tr');
      window.dispatchEvent(new CustomEvent('schoolar-language-change', { detail: 'tr' }));
      document.querySelector('#language-switch-sample span').firstChild.textContent = 'Messages';
      const userTitle = document.createElement('span');
      userTitle.textContent = 'Settings';
      document.querySelector('#language-switch-sample p').append(userTitle);
    });
    await page.waitForFunction(() => document.querySelector('#language-switch-sample span')?.textContent === 'Mesajlar');
    assert.equal(documents.length, initialDocuments);
    assert.equal(await page.locator('#language-switch-sample p span').textContent(), 'Settings');
    assert.deepEqual(popups, []);
    assert.deepEqual(errors, []);
    await page.goto(`http://127.0.0.1:${port}/resources`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.lang === 'tr' && !document.documentElement.hasAttribute('data-translating'));
    await page.getByTestId('advanced-filters-toggle').click();
    await page.getByText('Tam ifade', { exact: true }).waitFor();
    await page.getByTestId('author-filter').fill('Ada Lovelace');
    await page.screenshot({ path: join(tmpdir(), `casparel-tr-filters-${width}.png`), fullPage: true, animations: 'disabled' });
    const filterOverflow = await page.getByTestId('advanced-filters').evaluate(root =>
      [...root.querySelectorAll('button, label, input, select')].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.right > document.documentElement.clientWidth + 1 || rect.left < -1);
      }).map(element => element.textContent));
    assert.deepEqual(filterOverflow, [], 'Turkish filters must fit the screen');
    await page.getByTitle('Kaynakçayı al', { exact: true }).first().click();
    const citation = page.getByRole('dialog');
    await citation.getByText('Sayfa başlığı', { exact: true }).waitFor();
    await citation.getByText('Kaynakça biçimi', { exact: true }).waitFor();
    await citation.locator('#citation-title').fill('My English resource title');
    await page.screenshot({ path: join(tmpdir(), `casparel-tr-citation-${width}.png`), fullPage: true, animations: 'disabled' });
    const box = await citation.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'Turkish citation dialog must fit the screen');
    assert.ok(box.y >= 0 && box.y + box.height <= height + 1, 'dialog content must scroll inside the phone viewport');
    await citation.getByRole('button', { name: 'Kapat', exact: true }).click();
    assert.equal(await page.getByTestId('author-filter').inputValue(), 'Ada Lovelace');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Language switching stays in place and restores both languages at ${width}px`);
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
