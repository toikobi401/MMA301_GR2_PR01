import type { ApiError, Envelope } from './api.js';
import { ErrorCode } from './api.js';

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = 'ApiClientError';
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Called before each request. Return null when there is no session. */
  getAccessToken?: () => string | null | Promise<string | null>;
  /** Called once after a 401 so the caller can refresh and retry. */
  onUnauthorized?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

/**
 * Thin fetch wrapper shared by mobile and web. It understands the response
 * envelope and refreshes the access token once on a 401.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken: ApiClientOptions['getAccessToken'];
  private readonly onUnauthorized: ApiClientOptions['onUnauthorized'];
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.getAccessToken = options.getAccessToken;
    this.onUnauthorized = options.onUnauthorized;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = (await this.getAccessToken?.()) ?? null;
    const response = await this.send<T>(path, options, token);

    if (response.status !== 401 || !this.onUnauthorized) {
      return this.unwrap<T>(response);
    }

    const refreshed = await this.onUnauthorized();
    if (!refreshed) {
      return this.unwrap<T>(response);
    }

    return this.unwrap<T>(await this.send<T>(path, options, refreshed));
  }

  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  private async send<T>(
    path: string,
    options: RequestOptions,
    token: string | null,
  ): Promise<{ status: number; payload: Envelope<T> | null }> {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);

    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await this.fetchImpl(url.toString(), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });

    let payload: Envelope<T> | null = null;
    try {
      payload = (await response.json()) as Envelope<T>;
    } catch {
      payload = null;
    }

    return { status: response.status, payload };
  }

  private unwrap<T>(response: { status: number; payload: Envelope<T> | null }): T {
    const { status, payload } = response;

    if (!payload) {
      throw new ApiClientError(
        { code: ErrorCode.Internal, message: `Malformed response (HTTP ${status})` },
        status,
      );
    }

    if (payload.ok) return payload.data;
    throw new ApiClientError(payload.error, status);
  }
}
