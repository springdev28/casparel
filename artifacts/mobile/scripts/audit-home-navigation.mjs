/** Render the native home and verify role switching in the hosted workspace.
 * Uses API fixtures and the Expo web export; native ads/store sheets require a device.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../app/node_modules/playwright-core/index.mjs';
import { installSession, FIXTURES, sessionToken } from '../../app/scripts/audit-fixtures.mjs';
import { launchOptions } from '../../app/scripts/chromium.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.env.MOBILE_AUDIT_SHOTS;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
async function serve(directory) {
  const server = http.createServer((req, res) => {
    const requested = path.resolve(directory, `.${new URL(req.url, 'http://localhost').pathname}`);
    const file = requested.startsWith(`${directory}/`) && fs.existsSync(requested) && fs.statSync(requested).isFile()
      ? requested : path.join(directory, 'index.html');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

const native = await serve(path.resolve(here, '../.expo/web-export'));
const web = await serve(path.resolve(process.env.WEB_AUDIT_BUILD || path.resolve(here, '../../app/dist/public')));
let browser;
try {
  browser = await chromium.launch(launchOptions());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/api/**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(FIXTURES[new URL(route.request().url()).pathname] ?? {}) }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${native.url}/home`);
  await page.getByTestId('native-home').last().waitFor();
  assert.match(await page.locator('body').innerText(), /A clearer path to learning/);
  assert.equal(await page.locator('iframe').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, 'native-home.png'), fullPage: true });
  }
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Casparel home' }).click();
  await page.getByTestId('native-home').last().waitFor();
  await page.getByTestId('native-home').last().getByText('Create account', { exact: true }).click();
  await page.getByRole('button', { name: 'Casparel home' }).click();
  await page.getByTestId('native-home').last().waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS native home, guest entry, login/register logos, phone layout');

  const signedIn = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let activeRole = 'teacher';
  await installSession(signedIn, {
    role: 'teacher', accountRole: 'teacher',
    transformBody: (body, pathname) => pathname === '/api/users/me' ? { ...body, activeRole } : body,
  });
  await signedIn.addInitScript(() => {
    localStorage.setItem('casparel_native_shell', 'true');
    window.nativeMessages = [];
    window.ReactNativeWebView = { postMessage: (message) => window.nativeMessages.push(JSON.parse(message)) };
  });
  await signedIn.route('**/api/users/me/role', async (route) => {
    activeRole = route.request().postDataJSON().role;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      token: sessionToken({ role: activeRole, accountRole: 'teacher' }),
      user: { ...FIXTURES['/api/users/me'], role: 'teacher', activeRole },
    }) });
  });
  const workspace = await signedIn.newPage();
  await workspace.goto(`${web.url}/dashboard`);
  assert.equal(await workspace.getByTestId('mobile-brand-home').getAttribute('href'), '/', 'the logo must address native home, not the dashboard');
  assert.equal(await workspace.getByTestId('ad-consent-banner').count(), 0, 'native consent belongs to the native app');
  await workspace.getByRole('button', { name: 'Open navigation' }).click();
  await workspace.getByTestId('mobile-role-select').waitFor();
  let documents = 0;
  workspace.on('request', (request) => { if (request.isNavigationRequest() && request.frame() === workspace.mainFrame()) documents++; });
  await workspace.getByTestId('mobile-role-select').click();
  await workspace.getByRole('option', { name: 'Student', exact: true }).click();
  await workspace.waitForFunction(() => window.nativeMessages.some((message) => message.type === 'session'));
  await workspace.getByTestId('mobile-role-select').getByText('Student', { exact: true }).waitFor();
  assert.equal(documents, 0, 'role switching must not reload the WebView');
  assert.equal(new URL(workspace.url()).pathname, '/dashboard');
  console.log('PASS mobile role switch stays on-route, updates selection and sends native token');

  if (process.env.AUDIT_CONFIGURED_ADS === 'true') {
    for (const width of [390, 1280]) {
      const guest = await browser.newContext({ viewport: { width, height: 844 } });
      let scriptRequests = 0;
      // Fake build IDs and a local SDK stub: this test never requests live inventory.
      await guest.route('https://pagead2.googlesyndication.com/**', (route) => {
        scriptRequests++;
        return route.fulfill({ contentType: 'text/javascript', body: `
          window.adPushes = 0;
          window.adsbygoogle = { push: function () {
            window.adPushes++;
            document.querySelector('.adsbygoogle').setAttribute('data-ad-status', 'filled');
          }};
        ` });
      });
      const landing = await guest.newPage();
      await landing.goto(web.url);
      assert.equal(await landing.getByTestId('inline-ad').count(), 0);
      assert.equal(scriptRequests, 0, 'no ad request before consent');
      await landing.getByRole('button', { name: 'Allow ads', exact: true }).click();
      await landing.getByTestId('inline-ad').waitFor();
      await landing.waitForFunction(() => window.adPushes === 1);
      assert.equal(scriptRequests, 1);
      assert.equal(await landing.evaluate(() => localStorage.getItem('schoolar_token')), null);
      assert.equal(await landing.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await landing.getByRole('button', { name: 'Close this advertisement' }).click();
      assert.equal(await landing.getByTestId('inline-ad').count(), 0);
      console.log(`PASS signed-out landing ad at ${width}px: consent, request, dismissal`);
      await guest.close();
    }
  }
} finally {
  await browser?.close();
  await Promise.all([native.server, web.server].map((server) => new Promise((resolve) => server.close(resolve))));
}
