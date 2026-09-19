import { useCallback, useEffect, useState } from 'react';
import type { AuthSession, User } from '@app/shared';
import { api, setAccessToken } from './api';

/**
 * Session state, held in memory.
 *
 * Tokens are not persisted yet — closing the app logs you out. Persisting
 * them needs expo-secure-store on device and a deliberate decision about
 * where they live on web, which is worth doing separately rather than
 * reaching for localStorage by default.
 */
let currentSession: AuthSession | null = null;
const listeners = new Set<(session: AuthSession | null) => void>();

function setSession(session: AuthSession | null): void {
  currentSession = session;
  setAccessToken(session?.tokens.accessToken ?? null);
  for (const listener of listeners) listener(session);
}

export function useSession() {
  const [session, setLocal] = useState<AuthSession | null>(currentSession);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listeners.add(setLocal);
    return () => {
      listeners.delete(setLocal);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<AuthSession>('/api/v1/auth/login', { email, password });
      setSession(data);
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
        setSession(data);
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
    setSession(null);
  }, []);

  return {
    session,
    user: session?.user ?? null satisfies User | null,
    token: session?.tokens.accessToken ?? null,
    busy,
    error,
    login,
    register,
    logout,
  };
}
