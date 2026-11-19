/**
 * An error we deliberately throw to the client.
 * `isOperational` separates "the user did something wrong" (400/401/403/404/409)
 * from a genuine bug (500), which the error handler logs in full.
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message = 'Invalid request', details = null) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'You are not signed in') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to do this') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'This action conflicts with the current state') {
    return new ApiError(409, message);
  }

  static tooManyRequests(message = 'Too many requests, please slow down') {
    return new ApiError(429, message);
  }

  static internal(message = 'Something went wrong on our side') {
    return new ApiError(500, message);
  }
}
