import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PING_INTERVAL_MS,
  serverMessageSchema,
  type ChatMessage,
  type TableState,
} from '@app/shared';
import { apiBaseUrl } from './api';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface UseTableSocket {
  state: TableState | null;
  status: ConnectionStatus;
  messages: ChatMessage[];
  /** True while a fresh hand is being dealt, so the UI can animate. */
  dealing: boolean;
  act: (type: string, amount: number) => void;
  sendChat: (body: string) => void;
  error: string | null;
}

/**
 * Connects to a table and keeps its state in sync.
 *
 * Reconnection is a normal event, not an exception. Phones change networks,
 * screens lock, and Cloudflare closes idle tunnels — so the socket reconnects
 * with backoff and asks for a full snapshot rather than trying to replay what
 * it missed.
 */
export function useTableSocket(tableId: string | null, token: string | null): UseTableSocket {
  const [state, setState] = useState<TableState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('closed');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dealing, setDealing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const sequenceRef = useRef(0);
  const attemptRef = useRef(0);
  const handRef = useRef<string | null>(null);
  const closedByUs = useRef(false);

  const send = useCallback((message: unknown) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    if (!tableId || !token) {
      setStatus('closed');
      return;
    }

    closedByUs.current = false;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      setStatus(attemptRef.current === 0 ? 'connecting' : 'reconnecting');

      const url = `${apiBaseUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`;
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setStatus('open');
        setError(null);

        // `resume` carries the last sequence seen so the server knows this is
        // a reconnect; it answers with a full snapshot either way.
        socket.send(
          JSON.stringify(
            sequenceRef.current > 0
              ? { type: 'resume', tableId, lastSequence: sequenceRef.current }
              : { type: 'subscribe_table', tableId },
          ),
        );

        // Cloudflare drops connections idle for about 100 seconds.
        pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL_MS);
      };

      socket.onmessage = (event) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          return;
        }

        const result = serverMessageSchema.safeParse(parsed);
        if (!result.success) return;
        const message = result.data;

        switch (message.type) {
          case 'table_state': {
            // Out-of-order or duplicate states are ignored rather than
            // applied, so a late broadcast cannot rewind the table.
            if (message.sequence < sequenceRef.current) return;
            sequenceRef.current = message.sequence;

            // A new hand id means cards were just dealt. Animate only then;
            // joining mid-hand should render immediately.
            const isNewHand =
              message.state.handId !== null &&
              message.state.handId !== handRef.current &&
              message.state.street === 'preflop';

            handRef.current = message.state.handId;
            setState(message.state);

            if (isNewHand) {
              setDealing(true);
              // Long enough for the stagger to finish; after this the cards
              // are static so later renders do not re-animate them.
              setTimeout(() => setDealing(false), 1200);
            }
            return;
          }

          case 'chat': {
            setMessages((previous) => [...previous.slice(-49), message.message]);
            return;
          }

          case 'action_result': {
            if (!message.ok) setError(message.error ?? 'Action rejected');
            return;
          }

          case 'error': {
            setError(message.message);
            return;
          }

          default:
            return;
        }
      };

      socket.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        if (closedByUs.current) return;

        setStatus('reconnecting');
        attemptRef.current += 1;

        // Exponential backoff, capped. Retrying every 100ms against a server
        // that is down helps nobody.
        const delay = Math.min(1000 * 2 ** (attemptRef.current - 1), 15_000);
        retryTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        // onclose always follows, which is where reconnection is handled.
      };
    };

    connect();

    return () => {
      closedByUs.current = true;
      if (pingTimer) clearInterval(pingTimer);
      if (retryTimer) clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [tableId, token]);

  const act = useCallback(
    (type: string, amount: number) => {
      if (!tableId) return;
      setError(null);
      send({
        type: 'player_action',
        tableId,
        requestId: `${Date.now()}`,
        action: { type, amount },
      });
    },
    [tableId, send],
  );

  const sendChat = useCallback(
    (body: string) => {
      if (!tableId || !body.trim()) return;
      send({ type: 'chat', tableId, body: body.trim() });
    },
    [tableId, send],
  );

  return { state, status, messages, dealing, act, sendChat, error };
}
