/**
 * @fileOverview Web reliability role: performs a bounded recovery when a deployment invalidates a cached lazy chunk URL.
 * System connection: installed before React renders so Vite preload failures reload once instead of producing an unrecoverable blank shell.
 */
const CHUNK_RECOVERY_KEY = 'casparel_chunk_recovery_attempted';

interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Reload at most once per tab session. A second failure must reach the normal
 * React error boundary rather than creating an infinite refresh loop when a
 * deployment or CDN is genuinely unhealthy.
 */
export function recoverStaleChunk(
  storage: RecoveryStorage,
  reload: () => void,
): boolean {
  try {
    if (storage.getItem(CHUNK_RECOVERY_KEY)) return false;
    storage.setItem(CHUNK_RECOVERY_KEY, new Date().toISOString());
    reload();
    return true;
  } catch {
    // Some privacy modes disable sessionStorage. The existing error boundary
    // remains the safe manual recovery path in that environment.
    return false;
  }
}
