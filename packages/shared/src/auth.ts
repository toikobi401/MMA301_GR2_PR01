import { z } from 'zod';

export const userRoleSchema = z.enum(['user', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  displayName: z.string().min(1).max(64),
  role: userRoleSchema,
  createdAt: z.iso.datetime(),
});

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
