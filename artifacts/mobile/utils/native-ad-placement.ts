/** A native AdMob surface aligned to an inline placeholder inside the WebView. */
export interface NativeAdPlacement {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
  visible: boolean;
}

const MAX_PLACEMENT_SIZE = 2_048;
const MAX_PLACEMENT_OFFSET = 10_000;

/**
 * Validate an untrusted postMessage before it can position a native view.
 * The hosted page is same-origin, but treating its message as untrusted keeps
 * a malformed or injected payload from covering the phone UI.
 */
export function parseNativeAdPlacement(
  value: unknown,
): NativeAdPlacement | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<NativeAdPlacement> & { type?: unknown };
  if (candidate.type !== 'native-ad-placement') return null;
  if (
    typeof candidate.id !== 'string' ||
    candidate.id.length === 0 ||
    candidate.id.length > 128 ||
    typeof candidate.visible !== 'boolean'
  ) {
    return null;
  }
  const values = [
    candidate.top,
    candidate.left,
    candidate.width,
    candidate.height,
  ];
  if (
    values.some((item) => typeof item !== 'number' || !Number.isFinite(item))
  ) {
    return null;
  }
  const top = candidate.top as number;
  const left = candidate.left as number;
  const width = candidate.width as number;
  const height = candidate.height as number;
  if (
    Math.abs(top) > MAX_PLACEMENT_OFFSET ||
    Math.abs(left) > MAX_PLACEMENT_OFFSET ||
    width <= 0 ||
    width > MAX_PLACEMENT_SIZE ||
    height < 48 ||
    height > 320
  ) {
    return null;
  }
  return {
    id: candidate.id,
    top,
    left,
    width,
    height,
    visible: candidate.visible,
  };
}
