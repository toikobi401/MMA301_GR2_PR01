import { useEffect, useState } from 'react';
import { serverMessageSchema, type Leaderboard, type LeaderboardScope } from '@app/shared';
import { apiBaseUrl } from './api';
import { leaderboardApi } from './api-client';

const RECONNECT_DELAY_MS = 3000;

/**
 * The ranking, kept current over the socket.
 *
 * Fetched once first so the screen has something to show even if the socket
 * cannot connect; the server pushes a new ranking whenever a hand ends.
 */
export function useLeaderboard(scope: LeaderboardScope, token: string | null) {
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    setLeaderboard(null);
    setError(null);

    leaderboardApi
      .get(scope)
      .then((result) => {
        if (!cancelled) setLeaderboard(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Không tải được');
      });

    const connect = () => {
      if (cancelled) return;
      const url = `${apiBaseUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(url);

      socket.onopen = () => socket?.send(JSON.stringify({ type: 'subscribe_leaderboard', scope }));

      socket.onmessage = (event) => {
        if (cancelled) return;
        try {
          const message = serverMessageSchema.safeParse(JSON.parse(String(event.data)));
          // A push for a scope this screen has moved away from is ignored.
          if (message.success && message.data.type === 'leaderboard') {
            if (message.data.leaderboard.scope === scope) setLeaderboard(message.data.leaderboard);
          }
        } catch {
          // Not valid JSON: the next push replaces the whole ranking anyway.
        }
      };

      socket.onclose = () => {
        if (!cancelled) retry = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [scope, token]);

  return { leaderboard, error };
}
