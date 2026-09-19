import { createHash, randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { refreshTokens } from './db.js';
import { config } from '../config.js';

/**
 * Refresh tokens are random secrets, not JWTs.
 *
 * Only their SHA-256 hash is stored, so a database leak cannot be replayed:
 * an attacker holding the hash still cannot produce the token it came from.
 */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) throw new Error(`Invalid duration: ${value}`);

  const amount = Number(match[1]);
  const unit = match[2];
  const seconds = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86_400;

  return amount * seconds * 1000;
}

export async function storeRefreshToken(userId: ObjectId, hash: string): Promise<void> {
  await refreshTokens().insertOne({
    _id: new ObjectId(),
    userId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + parseDuration(config.REFRESH_TOKEN_TTL)),
    revokedAt: null,
    createdAt: new Date(),
  });
}

export interface StoredRefreshToken {
  id: ObjectId;
  userId: ObjectId;
}

/**
 * Returns the token row only when it is live: not expired, not revoked.
 *
 * The TTL index eventually removes expired documents, but deletion is not
 * immediate, so the expiry is still checked here.
 */
export async function findLiveRefreshToken(token: string): Promise<StoredRefreshToken | null> {
  const doc = await refreshTokens().findOne({
    tokenHash: hashToken(token),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });

  return doc ? { id: doc._id, userId: doc.userId } : null;
}

/**
 * Revokes a token and reports whether this call was the one that did it.
 *
 * Returning the count matters for rotation: two concurrent refreshes with the
 * same token must not both succeed, and only the caller whose update actually
 * modified the document may issue a new session.
 */
export async function revokeRefreshToken(id: ObjectId): Promise<boolean> {
  const result = await refreshTokens().updateOne(
    { _id: id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount === 1;
}

/** Used on logout-everywhere and on password change. */
export async function revokeAllForUser(userId: ObjectId): Promise<void> {
  await refreshTokens().updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export function accessTokenTtlSeconds(): number {
  return Math.floor(parseDuration(config.ACCESS_TOKEN_TTL) / 1000);
}
