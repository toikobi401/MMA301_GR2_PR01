import { z } from 'zod';

/**
 * Compose passes an unset variable as an empty string, so "" means absent.
 */
const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() ? value.trim() : undefined));

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

  /**
   * Public origin the clients reach, e.g. https://poker.example.com.
   * Behind Cloudflare Tunnel this differs from HOST/PORT, and WebSocket
   * upgrade URLs are derived from it.
   */
  PUBLIC_URL: z.string().default('http://localhost:4000'),

  /**
   * payOS payment channel (kênh thu), used for deposits. Leave all three
   * empty to keep the simulated deposit endpoint instead.
   */
  PAYOS_CLIENT_ID: optionalSecret,
  PAYOS_API_KEY: optionalSecret,
  PAYOS_CHECKSUM_KEY: optionalSecret,

  /**
   * payOS payout channel (kênh chi), used for withdrawals. payOS issues it
   * separately from the payment channel, with its own three keys. Leave empty
   * to keep the simulated withdrawal endpoint.
   */
  PAYOS_PAYOUT_CLIENT_ID: optionalSecret,
  PAYOS_PAYOUT_API_KEY: optionalSecret,
  PAYOS_PAYOUT_CHECKSUM_KEY: optionalSecret,

  /** Price of one chip in VND. 10 means 1,000 chips cost 10,000 ₫. */
  PAYOS_VND_PER_CHIP: z.coerce.number().int().positive().default(10),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Public client configuration. Never put secrets here. */
export const clientEnvSchema = z.object({
  API_URL: z.string().min(1),
  WS_URL: z.string().min(1).optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
