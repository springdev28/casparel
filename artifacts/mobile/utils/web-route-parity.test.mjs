import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WEB_ROUTE_PARITY, WEB_WORKSPACES } from './web-workspaces';

describe('web to Android route parity', () => {
  it('declares an Android entry for every explicit web route', () => {
    const appSource = fs.readFileSync(path.resolve('../app/src/App.tsx'), 'utf8');
    const webRoutes = [...appSource.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(WEB_ROUTE_PARITY.map((entry) => entry.webRoute))).toEqual(new Set(webRoutes));
  });

  it('makes every allowlisted authenticated workspace discoverable from More', () => {
    const moreSource = fs.readFileSync(path.resolve('app/(tabs)/more.tsx'), 'utf8');
    for (const key of Object.keys(WEB_WORKSPACES)) {
      expect(moreSource, `${key} must be discoverable`).toContain(`'${key}'`);
    }
  });

  it('keeps the WebView bridge requirements visible in source', () => {
    const bridge = fs.readFileSync(
      path.resolve('components/AuthenticatedWebWorkspace.native.tsx'),
      'utf8',
    );
    for (const behavior of [
      'schoolar_token',
      'BackHandler',
      'onNavigationStateChange',
      'onShouldStartLoadWithRequest',
      'onOpenWindow',
      'onFileDownload',
      'expo-file-system/legacy',
      'expo-sharing',
      'onError',
      'onHttpError',
    ]) {
      expect(bridge).toContain(behavior);
    }
  });
});
