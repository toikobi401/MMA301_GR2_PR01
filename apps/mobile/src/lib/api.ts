import { ApiClient } from '@app/shared';

/**
 * On a physical device `localhost` points at the phone, not your machine.
 * Set EXPO_PUBLIC_API_URL to your computer's LAN address, for example
 * http://192.168.1.10:4000
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
