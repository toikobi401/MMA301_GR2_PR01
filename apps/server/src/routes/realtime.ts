import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import type { WebSocket } from 'ws';
import {
  clientMessageSchema,
  type JwtClaims,
  type ServerMessage,
} from '@app/shared';
import { getTable, peekTable } from '../game/registry.js';
import { chatMessages } from '../lib/db.js';
import { AppError } from '../lib/errors.js';

interface Client {
  socket: WebSocket;
  userId: string;
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
  room.delete(client);
  client.tables.delete(tableId);

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

    const client: Client = { socket, userId: claims.sub, tables: new Set() };

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

    socket.on('close', () => {
      for (const tableId of client.tables) leaveRoom(tableId, client);
    });

    socket.on('error', () => {
      for (const tableId of client.tables) leaveRoom(tableId, client);
    });
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

      case 'subscribe_leaderboard':
      case 'unsubscribe_leaderboard': {
        // Leaderboard streaming is not implemented yet.
        return;
      }
    }
  }
}
