import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/** Anything that reached no route. */
export function notFoundHandler(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * One place decides the HTTP status, the message and the shape of the body:
 *   { success: false, message: "...", errors?: [...], stack?: "..." }
 * Stack traces are only included outside production.
 */
export function errorHandler(error, req, res, _next) {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Something went wrong';
  let details = error.details || null;

  // Mongoose schema validation
  if (error.name === 'ValidationError' && error.errors) {
    statusCode = 400;
    message = 'Some fields are invalid';
    details = Object.values(error.errors).map((item) => ({
      field: item.path,
      message: item.message,
    }));
  }

  // Bad ObjectId / wrong type in a query
  if (error.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for "${error.path}"`;
  }

  // Unique index violations (email, phone, bus number, seat holds, …)
  if (error.code === 11000) {
    statusCode = 409;
    const fields = Object.keys(error.keyValue || {});
    message = fields.length
      ? `This value is already in use: ${fields.join(', ')}`
      : 'This record already exists';
  }

  // Body parser problems
  if (error.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
  }
  if (error.name === 'SyntaxError' && 'body' in error) {
    statusCode = 400;
    message = 'Malformed JSON in request body';
  }

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} failed:`, error.stack || error.message);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { errors: details } : {}),
    ...(env.isProduction ? {} : { stack: error.stack }),
  });
}
