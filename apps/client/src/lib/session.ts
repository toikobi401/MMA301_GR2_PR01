import { useCallback, useEffect, useState } from 'react';
import type { AuthSession } from '@app/shared';
import { api, setAccessToken } from './api';
import { getItem, removeItem, setItem } from './secure-storage';

const STORAGE_KEY = 'poker.session';

/**
 * The signed-in session.
 *
 * Persisted so a reload does not sign you out. The refresh token is the part
 * that matters on disk: access tokens expire in fifteen minutes, so a stored
 * one is usually stale and the refresh token is exchanged for a new pair on
 * startup.
 */
let currentSession: AuthSession | null = null;
let restored = false;

const listeners = new Set<(session: AuthSession | null) => void>();

function publish(session: AuthSession | null): void {
  currentSession = session;
  setAccessToken(session?.tokens.accessToken ?? null);
  for (const listener of listeners) listener(session);
}

async function persist(session: AuthSession | null): Promise<void> {
  if (session) await setItem(STORAGE_KEY, session.tokens.refreshToken);
  else await removeItem(STORAGE_KEY);
}

/**
 * Exchanges a stored refresh token for a live session.
 *
 * Runs once per app start. A rejected token means it expired or was revoked,
 * which is not an error worth showing — it just means signing in again.
 */
async function restore(): Promise<AuthSession | null> {
  const refreshToken = await getItem(STORAGE_KEY);
  if (!refreshToken) return null;

  try {
    return await api.post<AuthSession>('/api/v1/auth/refresh', { refreshToken });
  } catch {
    await removeItem(STORAGE_KEY);
    return null;
  }
}

export function useSession() {
  const [session, setLocal] = useState<AuthSession | null>(currentSession);
  const [restoring, setRestoring] = useState(!restored);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listeners.add(setLocal);
    return () => {
      listeners.delete(setLocal);
    };
  }, []);

  useEffect(() => {
    if (restored) {
      setRestoring(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const recovered = await restore();
      restored = true;
      if (cancelled) return;
      if (recovered) {
        publish(recovered);
        // Rotation issued a fresh refresh token; store that one.
        await persist(recovered);
      }
      setRestoring(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<AuthSession>('/api/v1/auth/login', { email, password });
      publish(data);
      await persist(data);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      setBusy(true);
      setError(null);
      try {
        const data = await api.post<AuthSession>('/api/v1/auth/register', {
          email,
          password,
          displayName,
        });
        publish(data);
        await persist(data);
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not create the account');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const logout = useCallback(() => {
    publish(null);
    void persist(null);
  }, []);

  return {
    session,
    user: session?.user ?? null,
    token: session?.tokens.accessToken ?? null,
    /** True while the stored token is being exchanged on startup. */
    restoring,
    busy,
    error,
    login,
    register,
    logout,
  };
}
