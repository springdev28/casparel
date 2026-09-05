import { describe, expect, it } from 'vitest';
import { classifyMobileWebUrl } from './mobile-web-navigation';

const origin = 'https://casparel.com';

describe('classifyMobileWebUrl', () => {
  it('keeps every Casparel workspace inside the app', () => {
    expect(
      classifyMobileWebUrl('https://casparel.com/canvases/12', origin),
    ).toMatchObject({
      kind: 'internal',
      path: '/canvases/12',
    });
    expect(
      classifyMobileWebUrl('https://www.casparel.com/messages', origin),
    ).toMatchObject({
      kind: 'internal',
      path: '/messages',
    });
    expect(classifyMobileWebUrl('/goals', origin)).toMatchObject({
      kind: 'internal',
      path: '/goals',
    });
  });

  it('keeps an authenticated shell off the public marketing home page', () => {
    expect(classifyMobileWebUrl('https://casparel.com/', origin)).toEqual({
      kind: 'internal',
      url: 'https://casparel.com/dashboard',
      path: '/dashboard',
    });
  });

  it('keeps every authenticated home destination inside the Android WebView', () => {
    for (const rawUrl of [
      '/dashboard',
      'https://casparel.com/dashboard',
      'https://www.casparel.com/dashboard',
    ]) {
      expect(classifyMobileWebUrl(rawUrl, origin)).toMatchObject({
        kind: 'internal',
        path: '/dashboard',
      });
    }
  });

  it('opens the native Google Play paywall', () => {
    expect(
      classifyMobileWebUrl('https://casparel.com/plans?from=settings', origin),
    ).toEqual({
      kind: 'paywall',
    });
    expect(classifyMobileWebUrl('https://casparel.com/plans/', origin)).toEqual(
      {
        kind: 'paywall',
      },
    );
  });

  it('only sends genuine external destinations outside the app', () => {
    expect(
      classifyMobileWebUrl('https://openstax.org/books', origin).kind,
    ).toBe('external');
    expect(
      classifyMobileWebUrl('mailto:support@casparel.com', origin).kind,
    ).toBe('external');
    expect(
      classifyMobileWebUrl(
        'https://casparel.com.evil.example/dashboard',
        origin,
      ).kind,
    ).toBe('external');
  });
});
