import { z } from 'zod';
import {
  chatMessageSchema,
  leaderboardSchema,
  playerActionBodySchema,
  tableStateSchema,
} from './poker';

/**
 * WebSocket protocol.
 *
 * Both directions are discriminated unions on `type`, so adding a message
 * without handling it is a compile error rather than a silent no-op.
 *
 * Reconnection is a first-class case, not an afterthought: a dropped socket
 * mid-hand must not cost a player their seat. The client reconnects, sends
 * `resume` with the last sequence number it saw, and the server replies with
 * a full `table_state` snapshot rather than trying to replay deltas.
 */

// ------------------------------------------------------- client to server

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('subscribe_table'),
    tableId: z.string(),
  }),
  z.object({
    type: z.literal('unsubscribe_table'),
    tableId: z.string(),
  }),
  z.object({
    type: z.literal('player_action'),
    tableId: z.string(),
    /** Echoed back on the result so the client can match request to response. */
    requestId: z.string(),
    action: playerActionBodySchema,
  }),
  z.object({
    type: z.literal('chat'),
    tableId: z.string(),
    body: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal('subscribe_leaderboard'),
    scope: z.enum(['net_chips', 'hands_won', 'biggest_pot']),
  }),
  z.object({
    type: z.literal('unsubscribe_leaderboard'),
  }),
  z.object({
    type: z.literal('resume'),
    tableId: z.string(),
    /** Last server sequence the client processed; 0 when starting fresh. */
    lastSequence: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('ping'),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ------------------------------------------------------- server to client

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('table_state'),
    /** Monotonic per table. The client ignores anything it has already seen. */
    sequence: z.number().int().nonnegative(),
    state: tableStateSchema,
  }),
  z.object({
    type: z.literal('hand_started'),
    sequence: z.number().int().nonnegative(),
    tableId: z.string(),
    handId: z.string(),
    handNumber: z.number().int(),
  }),
  z.object({
    type: z.literal('hand_finished'),
    sequence: z.number().int().nonnegative(),
    tableId: z.string(),
    handId: z.string(),
    results: z.array(
      z.object({
        userId: z.string(),
        displayName: z.string(),
        amount: z.number().int(),
        handDescription: z.string().nullable(),
        cards: z.array(z.string()).nullable(),
      }),
    ),
  }),
  z.object({
    type: z.literal('chat'),
    sequence: z.number().int().nonnegative(),
    message: chatMessageSchema,
  }),
  z.object({
    type: z.literal('leaderboard'),
    leaderboard: leaderboardSchema,
  }),
  z.object({
    type: z.literal('action_result'),
    requestId: z.string(),
    ok: z.boolean(),
    /** Present when ok is false. */
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('pong'),
  }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** Redis pub/sub channels, so several server instances stay in sync. */
export const Channel = {
  table: (tableId: string) => `table:${tableId}`,
  leaderboard: () => 'leaderboard',
} as const;

/** Sorted set keys backing the live leaderboard. */
export const LeaderboardKey = {
  netChips: 'leaderboard:net_chips',
  handsWon: 'leaderboard:hands_won',
  biggestPot: 'leaderboard:biggest_pot',
} as const;

/**
 * Seconds a player has to act before the server folds or checks for them.
 *
 * Without this a disconnected player freezes the table for everyone else,
 * which is the single most common way an online poker game becomes unplayable.
 */
export const ACTION_TIMEOUT_SECONDS = 30;

/** Client heartbeat interval. Cloudflare closes idle tunnels. */
export const PING_INTERVAL_MS = 25_000;
