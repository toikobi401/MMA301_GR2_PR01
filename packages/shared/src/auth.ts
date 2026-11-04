import { z } from 'zod';

/**
 * Who someone is allowed to be.
 *
 * `moderator` runs tournaments: opens and closes tables, watches hands, and
 * bans players. `admin` can do all of that and also appoint moderators.
 * Ordinary players cannot open a table at all — that is deliberate, so the
 * lobby stays a curated set of tables rather than whatever anyone made.
 */
export const userRoleSchema = z.enum(['user', 'moderator', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;

/** Roles allowed to run tables and discipline players. */
export const MODERATOR_ROLES: readonly UserRole[] = ['moderator', 'admin'];

export function canModerate(role: UserRole | undefined): boolean {
  return role !== undefined && MODERATOR_ROLES.includes(role);
}

export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  displayName: z.string().min(1).max(64),
  role: userRoleSchema,
  createdAt: z.iso.datetime(),
});

/**
 * A ban.
 *
 * Chips are deliberately untouched: the ledger stays a complete record, and
 * lifting a ban restores the account exactly as it was. Only access is
 * revoked.
 */
export const banSchema = z.object({
  reason: z.string().min(1).max(280),
  bannedAt: z.iso.datetime(),
  bannedBy: z.string(),
  /** Null means indefinite. */
  expiresAt: z.iso.datetime().nullable(),
});
export type Ban = z.infer<typeof banSchema>;

/** One account as a moderator sees it. */
export const managedUserSchema = userSchema.extend({
  chips: z.number().int().nonnegative(),
  isBot: z.boolean(),
  ban: banSchema.nullable(),
  handsPlayed: z.number().int().nonnegative(),
});
export type ManagedUser = z.infer<typeof managedUserSchema>;

export const banUserBodySchema = z.object({
  reason: z.string().min(1).max(280),
  /** Hours from now. Omit for an indefinite ban. */
  durationHours: z.number().int().positive().max(8760).optional(),
});
export type BanUserBody = z.infer<typeof banUserBodySchema>;

export const setRoleBodySchema = z.object({
  role: userRoleSchema,
});
export type SetRoleBody = z.infer<typeof setRoleBodySchema>;

export type User = z.infer<typeof userSchema>;

export const registerBodySchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshBody = z.infer<typeof refreshBodySchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});

export type AuthTokens = z.infer<typeof authTokensSchema>;

export const authSessionSchema = z.object({
  user: userSchema,
  tokens: authTokensSchema,
});

export type AuthSession = z.infer<typeof authSessionSchema>;

/** Decoded access token payload. */
export const jwtClaimsSchema = z.object({
  sub: z.string(),
  role: userRoleSchema,
  iat: z.number(),
  exp: z.number(),
});

export type JwtClaims = z.infer<typeof jwtClaimsSchema>;
