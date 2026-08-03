/**
 * Platform-safe storage: SecureStore on native, localStorage on web.
 * expo-secure-store v15+ is native-only and throws on web.
 */
import { Platform } from 'react-native';

async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  const SecureStore = await import('expo-secure-store');
  return SecureStore.getItemAsync(key);
}

async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
    return;
  }
  const SecureStore = await import('expo-secure-store');
  return SecureStore.setItemAsync(key, value);
}

async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  const SecureStore = await import('expo-secure-store');
  return SecureStore.deleteItemAsync(key);
}

export const storage = { getItemAsync, setItemAsync, deleteItemAsync };
