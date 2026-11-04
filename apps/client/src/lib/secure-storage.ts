import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Where the session token lives between launches.
 *
 * On device this is the OS keychain, which is encrypted and not readable by
 * other apps. On web there is no equivalent — `expo-secure-store` is a no-op
 * there — so it falls back to `localStorage`.
 *
 * That fallback is a real weakening: anything running in the page can read
 * localStorage, so an XSS bug would leak the token. It is the accepted
 * trade-off here because the alternative is an httpOnly cookie, which needs
 * the server to set it and would not work for the native app at all. The
 * token is short-lived (15 minutes) which limits the damage.
 */

const WEB = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  try {
    if (WEB) return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    // A private window, cleared site data, or a device with no keychain.
    // Behaving as if nothing was stored is correct in every one of those.
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    if (WEB) globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Failing to persist must not break signing in; the session simply will
    // not survive a reload.
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    if (WEB) globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // Nothing to do — the caller is signing out either way.
  }
}
