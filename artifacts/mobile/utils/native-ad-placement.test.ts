import { describe, expect, it } from 'vitest';
import { parseNativeAdPlacement } from './native-ad-placement';

describe('parseNativeAdPlacement', () => {
  const placement = {
    type: 'native-ad-placement',
    id: 'inline:/resources',
    top: 180,
    left: 16,
    width: 360,
    height: 300,
    visible: true,
  };

  it('accepts a bounded inline WebView placement', () => {
    expect(parseNativeAdPlacement(placement)).toEqual({
      id: placement.id,
      top: 180,
      left: 16,
      width: 360,
      height: 300,
      visible: true,
    });
  });

  it('rejects malformed and screen-covering messages', () => {
    expect(
      parseNativeAdPlacement({ ...placement, type: 'open-url' }),
    ).toBeNull();
    expect(parseNativeAdPlacement({ ...placement, height: 900 })).toBeNull();
    expect(
      parseNativeAdPlacement({ ...placement, width: Number.NaN }),
    ).toBeNull();
    expect(parseNativeAdPlacement({ ...placement, id: '' })).toBeNull();
  });
});
