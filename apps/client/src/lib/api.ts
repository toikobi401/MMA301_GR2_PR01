import { ApiClient } from '@app/shared';

/**
 * EXPO_PUBLIC_ variables are inlined at build time on every platform, so the
 * same file works in the browser and on device.
 *
 * On a physical phone `localhost` points at the phone itself — set
 * EXPO_PUBLIC_API_URL to your computer's LAN address, e.g. http://192.168.1.10:4000
 */
const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export const api = new ApiClient({
  baseUrl,
  getAccessToken: () => accessToken,
});

export { baseUrl as apiBaseUrl };
