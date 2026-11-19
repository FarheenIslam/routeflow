/**
 * Express 4 does not catch rejected promises from async handlers — an error
 * would hang the request. This wrapper forwards everything to next(error),
 * which lands in errorHandler. Every async controller will use it.
 */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
