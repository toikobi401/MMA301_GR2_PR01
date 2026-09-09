import { z } from 'zod';

/**
 * Server environment contract.
 * Validated once at boot so a missing variable fails loudly instead of
 * surfacing as a confusing runtime error later.
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),

  CORS_ORIGINS: z
    .string()
    .default('*')
    .transform((value) =>
      value === '*' ? ['*'] : value.split(',').map((entry) => entry.trim()).filter(Boolean),
    ),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Public client configuration. Never put secrets here. */
export const clientEnvSchema = z.object({
  API_URL: z.string().min(1),
  WS_URL: z.string().min(1).optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
