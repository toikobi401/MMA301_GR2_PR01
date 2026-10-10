import { ErrorCode, type ErrorCodeValue } from '@app/shared';

/**
 * Errors thrown with this class carry an HTTP status and a stable code, so
 * the error handler can translate them without guessing.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCodeValue;
  readonly details: unknown;

  constructor(statusCode: number, code: ErrorCodeValue, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'Invalid request', details?: unknown) {
    return new AppError(400, ErrorCode.BadRequest, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(401, ErrorCode.Unauthorized, message);
  }

  static forbidden(message = 'Not allowed') {
    return new AppError(403, ErrorCode.Forbidden, message);
  }

  static notFound(message = 'Not found') {
    return new AppError(404, ErrorCode.NotFound, message);
  }

  static conflict(message = 'Already exists') {
    return new AppError(409, ErrorCode.Conflict, message);
  }

  static internal(message = 'Something went wrong') {
    return new AppError(500, ErrorCode.Internal, message);
  }
}
