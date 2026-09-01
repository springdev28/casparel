import { describe, expect, it } from 'vitest';
import { mayShowProgrammaticAd } from './ad-policy';

const freeAndroid = {
  platform: 'android',
  accountRole: 'student',
  serverTier: 'free',
  revenueCatTier: 'free',
};

describe('native advertising eligibility', () => {
  it('allows the approved dashboard placement for a free Android account', () => {
    expect(mayShowProgrammaticAd(freeAndroid)).toBe(true);
    expect(mayShowProgrammaticAd({ ...freeAndroid, accountRole: 'teacher' })).toBe(true);
  });

  it.each(['plus', 'pro', 'institutional', 'administrator'])(
    'never shows when the server tier is %s',
    (serverTier) => {
      expect(mayShowProgrammaticAd({ ...freeAndroid, serverTier })).toBe(false);
    },
  );

  it.each(['plus', 'pro'])('disappears immediately when RevenueCat reports %s', (revenueCatTier) => {
    expect(mayShowProgrammaticAd({ ...freeAndroid, revenueCatTier })).toBe(false);
  });

  it('never shows to an administrator or before authoritative usage loads', () => {
    expect(mayShowProgrammaticAd({ ...freeAndroid, accountRole: 'admin' })).toBe(false);
    expect(mayShowProgrammaticAd({ ...freeAndroid, serverTier: undefined })).toBe(false);
    expect(mayShowProgrammaticAd({ ...freeAndroid, revenueCatTier: undefined })).toBe(false);
  });

  it('never shows outside Android', () => {
    expect(mayShowProgrammaticAd({ ...freeAndroid, platform: 'ios' })).toBe(false);
    expect(mayShowProgrammaticAd({ ...freeAndroid, platform: 'web' })).toBe(false);
  });
});
