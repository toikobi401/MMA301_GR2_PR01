import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

/**
 * Where payOS sends the player after checkout.
 *
 * On web that is the wallet route itself, in the same tab. On device it is
 * the app's deep link, which the auth session below watches for so the
 * in-app browser closes on its own.
 */
export function checkoutReturnUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/wallet`;
  }
  return Linking.createURL('/wallet');
}

/**
 * Opens payOS checkout.
 *
 * Web navigates away and comes back to /wallet with `orderCode` in the query,
 * so this never resolves there. On device it resolves when the browser
 * closes, whether the player paid, cancelled, or just dismissed it. The
 * result says nothing reliable about payment either way: the caller must ask
 * the server, which asks payOS.
 */
export async function openCheckout(checkoutUrl: string, returnUrl: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.location.assign(checkoutUrl);
    return new Promise(() => {});
  }
  await WebBrowser.openAuthSessionAsync(checkoutUrl, returnUrl);
}

export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)} ₫`;
}
