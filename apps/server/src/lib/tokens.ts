import { createHash, randomBytes } from 'node:crypto';
import { sql } from './db.js';
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
  const seconds =
    unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86_400;

  return amount * seconds * 1000;
}

export async function storeRefreshToken(userId: string, hash: string): Promise<void> {
  const expiresAt = new Date(Date.now() + parseDuration(config.REFRESH_TOKEN_TTL));
  await sql`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES (${userId}, ${hash}, ${expiresAt})
  `;
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
}

/** Returns the token row only when it is live: not expired, not revoked. */
export async function findLiveRefreshToken(token: string): Promise<StoredRefreshToken | null> {
  const rows = await sql<Array<{ id: string; user_id: string }>>`
    SELECT id, user_id
    FROM refresh_tokens
    WHERE token_hash = ${hashToken(token)}
      AND revoked_at IS NULL
      AND expires_at > now()
    LIMIT 1
  `;

  const row = rows[0];
  return row ? { id: row.id, userId: row.user_id } : null;
}

export async function revokeRefreshToken(id: string): Promise<void> {
  await sql`UPDATE refresh_tokens SET revoked_at = now() WHERE id = ${id}`;
}

/** Used on logout-everywhere and on password change. */
export async function revokeAllForUser(userId: string): Promise<void> {
  await sql`
    UPDATE refresh_tokens
    SET revoked_at = now()
    WHERE user_id = ${userId} AND revoked_at IS NULL
  `;
}

export function accessTokenTtlSeconds(): number {
  return Math.floor(parseDuration(config.ACCESS_TOKEN_TTL) / 1000);
}
