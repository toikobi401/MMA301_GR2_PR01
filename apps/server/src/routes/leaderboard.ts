import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import {
  leaderboardScopeSchema,
  type Leaderboard,
  type LeaderboardEntry,
  type LeaderboardScope,
} from '@app/shared';
import { playerStats, users, type PlayerStatsDoc } from '../lib/db.js';
import { AppError } from '../lib/errors.js';

const SCORE_FIELD = {
  net_chips: 'netChips',
  hands_won: 'handsWon',
  biggest_pot: 'biggestPot',
} as const satisfies Record<LeaderboardScope, keyof PlayerStatsDoc>;

const TOP_ENTRIES = 50;

/**
 * Current ranking. Bots get no stats row, so they never appear: a leaderboard
 * topped by the house would tell a player nothing.
 */
export async function buildLeaderboard(
  scope: LeaderboardScope,
  viewerId: string,
): Promise<Leaderboard> {
  const field = SCORE_FIELD[scope];
  // Ties break on _id so the order, and so every rank, is stable between calls.
  const docs = await playerStats()
    .find({})
    .sort({ [field]: -1, _id: 1 })
    .limit(TOP_ENTRIES)
    .toArray();

  const viewer = new ObjectId(viewerId);
  const viewerDoc = docs.find((doc) => doc.userId.equals(viewer))
    ?? (await playerStats().findOne({ userId: viewer }));

  const people = await users()
    .find(
      { _id: { $in: [...docs.map((doc) => doc.userId), viewer] } },
      { projection: { displayName: 1 } },
    )
    .toArray();
  const names = new Map(people.map((person) => [person._id.toHexString(), person.displayName]));

  const toEntry = (doc: PlayerStatsDoc, rank: number): LeaderboardEntry => ({
    rank,
    userId: doc.userId.toHexString(),
    displayName: names.get(doc.userId.toHexString()) ?? 'Unknown',
    score: doc[field],
    handsPlayed: doc.handsPlayed,
    handsWon: doc.handsWon,
  });

  const entries = docs.map((doc, index) => toEntry(doc, index + 1));

  let viewerRank = entries.find((entry) => entry.userId === viewerId) ?? null;
  if (!viewerRank && viewerDoc) {
    const ahead = await playerStats().countDocuments({ [field]: { $gt: viewerDoc[field] } });
    viewerRank = toEntry(viewerDoc, ahead + 1);
  }

  return { scope, entries, viewerRank, updatedAt: new Date().toISOString() };
}

export async function leaderboardRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);

  app.get('/', async (request) => {
    const claim = request.claims?.sub;
    if (!claim) throw AppError.unauthorized();

    const scope = leaderboardScopeSchema.parse(
      (request.query as { scope?: string }).scope ?? 'net_chips',
    );

    return { ok: true as const, data: await buildLeaderboard(scope, claim) };
  });
}
