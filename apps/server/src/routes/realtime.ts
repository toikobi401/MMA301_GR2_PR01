import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { WebSocket } from 'ws';
import {
  clientMessageSchema,
  type JwtClaims,
  type LeaderboardScope,
  type ServerMessage,
  type UserRole,
} from '@app/shared';
import { getTable, onAnyHandFinished, peekTable } from '../game/registry.js';
import { chatMessages } from '../lib/db.js';
import { AppError } from '../lib/errors.js';
import { socketClosed, socketOpened } from '../lib/presence.js';
import { buildLeaderboard } from './leaderboard.js';
import { assertCanViewTable } from './tables.js';

interface Client {
  socket: WebSocket;
  userId: string;
  role: UserRole | undefined;
  /** Set while this socket is watching the leaderboard. */
  leaderboardScope: LeaderboardScope | null;
  /** Tables this socket is watching. */
  tables: Set<string>;
}

/** Sockets per table, so a state change reaches only its watchers. */
const rooms = new Map<string, Set<Client>>();

/**
 * One broadcast subscription per table, not per socket.
 *
 * Subscribing on every join would add a duplicate listener each time someone
 * opened the table, and every client would receive one copy of the state per
 * subscriber.
 */
const broadcastSubscriptions = new Map<string, () => void>();

/** One hand-finished subscription per table, alongside the broadcast one. */
const handFinishedSubscriptions = new Map<string, () => void>();

/** Sockets watching the leaderboard, each with the ranking it asked for. */
const leaderboardWatchers = new Set<Client>();

async function sendLeaderboard(client: Client): Promise<void> {
  if (!client.leaderboardScope) return;
  send(client, {
    type: 'leaderboard',
    leaderboard: await buildLeaderboard(client.leaderboardScope, client.userId),
  });
}

/** Hands end close together at a busy table; one push covers all of them. */
const LEADERBOARD_PUSH_DELAY_MS = 1000;
let leaderboardPush: NodeJS.Timeout | null = null;

function scheduleLeaderboardPush(): void {
  if (leaderboardPush || leaderboardWatchers.size === 0) return;

  leaderboardPush = setTimeout(() => {
    leaderboardPush = null;
    for (const client of leaderboardWatchers) {
      sendLeaderboard(client).catch((error: unknown) => {
        console.error('Leaderboard push failed', error);
      });
    }
  }, LEADERBOARD_PUSH_DELAY_MS);
  leaderboardPush.unref?.();
}

function send(client: Client, message: ServerMessage): void {
  // readyState 1 is OPEN. Writing to a closing socket throws.
  if (client.socket.readyState !== 1) return;
  client.socket.send(JSON.stringify(message));
}

/**
 * Pushes table state to every watcher.
 *
 * Each socket gets its own view: hole cards are stripped per viewer on the
 * server, so no client ever receives cards it is not entitled to see.
 */
async function broadcastTable(tableId: string): Promise<void> {
  const room = rooms.get(tableId);
  if (!room || room.size === 0) return;

  const table = peekTable(tableId);
  if (!table) return;

  for (const client of room) {
    send(client, {
      type: 'table_state',
      sequence: table.seq,
      state: table.viewFor(client.userId),
    });
  }
}

function joinRoom(tableId: string, client: Client): void {
  let room = rooms.get(tableId);
  if (!room) {
    room = new Set();
    rooms.set(tableId, room);
  }
  room.add(client);
  client.tables.add(tableId);
}

function leaveRoom(tableId: string, client: Client): void {
  const room = rooms.get(tableId);
  if (!room) return;
  if (!room.delete(client)) return;
  client.tables.delete(tableId);

  // A second tab or device can still be holding the seat.
  const stillHere = [...room].some((member) => member.userId === client.userId);
  if (!stillHere) peekTable(tableId)?.playerDisconnected(client.userId);

  if (room.size === 0) {
    rooms.delete(tableId);
    // Nobody is watching, so stop listening. The table keeps playing — bots
    // may still be in a hand — it simply has no audience.
    broadcastSubscriptions.get(tableId)?.();
    broadcastSubscriptions.delete(tableId);
    handFinishedSubscriptions.get(tableId)?.();
    handFinishedSubscriptions.delete(tableId);
  }
}

export async function realtimeRoutes(app: FastifyInstance) {
  onAnyHandFinished(scheduleLeaderboardPush);

  app.get('/ws', { websocket: true }, (socket, request) => {
    // The token travels as a query parameter: browsers cannot set headers on
    // a WebSocket handshake. It is still verified the same way.
    const token = (request.query as { token?: string }).token;
    let claims: JwtClaims;

    try {
      if (!token) throw new Error('missing token');
      claims = app.jwt.verify<JwtClaims>(token);
    } catch {
      socket.send(
        JSON.stringify({
          type: 'error',
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing access token',
        } satisfies ServerMessage),
      );
      socket.close(1008, 'unauthorized');
      return;
    }

    const client: Client = {
      socket,
      userId: claims.sub,
      role: claims.role,
      leaderboardScope: null,
      tables: new Set(),
    };
    socketOpened(client.userId);

    // `close` follows `error`, and each must count once.
    let closed = false;
    const disconnect = () => {
      if (closed) return;
      closed = true;
      socketClosed(client.userId);
      leaderboardWatchers.delete(client);
      for (const tableId of [...client.tables]) leaveRoom(tableId, client);
    };

    socket.on('message', (raw: Buffer) => {
      void handleMessage(client, raw).catch((error: unknown) => {
        const failure =
          error instanceof AppError
            ? { code: error.code, message: error.message }
            : { code: 'INTERNAL', message: 'Something went wrong' };

        if (!(error instanceof AppError)) {
          app.log.error({ err: error }, 'WebSocket handler failed');
        }
        send(client, { type: 'error', ...failure });
      });
    });

    socket.on('close', disconnect);
    socket.on('error', disconnect);
  });

  async function handleMessage(client: Client, raw: Buffer): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      throw AppError.badRequest('Message is not valid JSON');
    }

    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      throw AppError.badRequest('Unrecognised message');
    }

    const message = result.data;

    switch (message.type) {
      case 'ping': {
        send(client, { type: 'pong' });
        return;
      }

      case 'subscribe_table':
      // `resume` is deliberately the same path: after a dropped connection the
      // client gets a full snapshot rather than a replay of missed deltas,
      // which is simpler and cannot desynchronise.
      case 'resume': {
        const table = await getTable(message.tableId);
        assertCanViewTable(table.table, client.userId, client.role);
        joinRoom(message.tableId, client);

        if (!broadcastSubscriptions.has(message.tableId)) {
          broadcastSubscriptions.set(
            message.tableId,
            table.subscribe(() => {
              void broadcastTable(message.tableId);
            }),
          );
        }

        if (!handFinishedSubscriptions.has(message.tableId)) {
          handFinishedSubscriptions.set(
            message.tableId,
            table.onHandFinished((hand) => {
              // Tells watchers the hand is now part of the table's public
              // record, so they know when to refetch it. The cards here are
              // only the ones already shown at showdown.
              const room = rooms.get(message.tableId);
              if (!room) return;

              const names = new Map(
                table.table.seats
                  .filter((seat) => seat.userId !== null)
                  .map((seat) => [seat.userId?.toHexString() ?? '', seat.displayName ?? '']),
              );

              const results = (hand.results ?? []).map((result) => ({
                userId: result.playerId,
                displayName: names.get(result.playerId) ?? 'Unknown',
                amount: result.amount,
                handDescription: result.handDescription,
                cards: result.cards,
              }));

              for (const member of room) {
                send(member, {
                  type: 'hand_finished',
                  sequence: table.seq,
                  tableId: message.tableId,
                  handId: hand.handId,
                  results,
                });
              }
            }),
          );
        }

        // After the listeners above, so a hand this deals reaches the room.
        table.playerConnected(client.userId);

        send(client, {
          type: 'table_state',
          sequence: table.seq,
          state: table.viewFor(client.userId),
        });
        return;
      }

      case 'unsubscribe_table': {
        leaveRoom(message.tableId, client);
        return;
      }

      case 'player_action': {
        const table = await getTable(message.tableId);
        try {
          // `act` fires onChange, which broadcasts. Broadcasting again here
          // would send every client two states per action, and a client that
          // acts on the first while the second is in flight reads a stale
          // turn.
          table.act(client.userId, message.action.type, message.action.amount);
          send(client, { type: 'action_result', requestId: message.requestId, ok: true });
        } catch (error) {
          send(client, {
            type: 'action_result',
            requestId: message.requestId,
            ok: false,
            error: error instanceof AppError ? error.message : 'Action rejected',
          });
        }
        return;
      }

      case 'chat': {
        const table = await getTable(message.tableId);
        const seat = table.table.seats.find(
          (entry) => entry.userId?.toHexString() === client.userId,
        );
        if (!seat) throw AppError.forbidden('Only seated players can chat');

        const doc = {
          _id: new ObjectId(),
          tableId: table.table._id,
          userId: new ObjectId(client.userId),
          displayName: seat.displayName ?? 'Unknown',
          body: message.body,
          createdAt: new Date(),
        };

        await chatMessages().insertOne(doc);

        const room = rooms.get(message.tableId);
        if (room) {
          for (const member of room) {
            send(member, {
              type: 'chat',
              sequence: table.seq,
              message: {
                id: doc._id.toHexString(),
                tableId: message.tableId,
                userId: client.userId,
                displayName: doc.displayName,
                body: doc.body,
                createdAt: doc.createdAt.toISOString(),
              },
            });
          }
        }
        return;
      }

      case 'subscribe_leaderboard': {
        client.leaderboardScope = message.scope;
        leaderboardWatchers.add(client);
        await sendLeaderboard(client);
        return;
      }

      case 'unsubscribe_leaderboard': {
        client.leaderboardScope = null;
        leaderboardWatchers.delete(client);
        return;
      }
    }
  }
}
