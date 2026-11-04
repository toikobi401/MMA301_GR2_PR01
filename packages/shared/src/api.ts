import { z } from 'zod';

/**
 * Every endpoint answers with this envelope so the client has exactly one
 * shape to parse and one place to handle failure.
 */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export function successSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data });
}

export const failureSchema = z.object({ ok: z.literal(false), error: apiErrorSchema });

export function envelopeSchema<T extends z.ZodTypeAny>(data: T) {
  return z.discriminatedUnion('ok', [successSchema(data), failureSchema]);
}

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Stable error codes. The client switches on these, never on message text. */
export const ErrorCode = {
  BadRequest: 'BAD_REQUEST',
  Unauthorized: 'UNAUTHORIZED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  RateLimited: 'RATE_LIMITED',
  Internal: 'INTERNAL',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Cursor pagination. Offset pagination breaks when rows shift under you. */
export const pageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export type Page<T> = { items: T[]; nextCursor: string | null };
