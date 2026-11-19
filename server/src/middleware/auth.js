import User from '../models/User.js';
import { USER_STATUS } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AUTH_COOKIE, verifyAuthToken } from '../utils/token.js';

/**
 * Reads the session token from the httpOnly cookie (browser) or from an
 * Authorization: Bearer header (API clients and tests), verifies it, then loads
 * the user fresh from the database.
 *
 * Loading fresh on every request is deliberate: suspending an account or
 * changing a role must take effect immediately, not after the token expires.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.get('authorization') || '';
  const bearerToken = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const token = req.cookies?.[AUTH_COOKIE] || bearerToken;

  if (!token) {
    throw ApiError.unauthorized('Please sign in to continue');
  }

  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch (error) {
    throw error.name === 'TokenExpiredError'
      ? ApiError.unauthorized('Your session has expired. Please sign in again.')
      : ApiError.unauthorized('Invalid session. Please sign in again.');
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw ApiError.unauthorized('This account no longer exists');
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden('Your account is not active. Please contact support.');
  }

  /**
   * tokenVersion is bumped whenever the password changes. Every token issued
   * before that moment stops working, so a stolen password cannot be replayed.
   */
  if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
    throw ApiError.unauthorized('Your password was changed. Please sign in again.');
  }

  req.user = user;
  req.userId = user._id;
  next();
});

/**
 * Optional authentication.
 *
 * Ticket pages work for guests and improve for signed-in passengers, so the
 * token is read when present and silently ignored when missing or stale. It is
 * never a substitute for the `authenticate` gate — anything that needs a user
 * still uses `authenticate`.
 */
export async function authenticateOptional(req, _res, next) {
  const header = req.get('authorization') || '';
  const bearerToken = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const token = req.cookies?.[AUTH_COOKIE] || bearerToken;
  if (!token) return next();

  try {
    const payload = verifyAuthToken(token);
    const user = await User.findById(payload.sub);
    if (
      user &&
      user.status === USER_STATUS.ACTIVE &&
      (payload.tv ?? 0) === (user.tokenVersion ?? 0)
    ) {
      req.user = user;
      req.userId = user._id;
    }
  } catch {
    // A bad token is simply a guest visit here.
  }

  return next();
}

/**
 * Role gate. Usage:  router.get('/x', authenticate, authorize('ADMIN','COUNTER'), handler)
 * Returns 403 (not 404) so a wrong role is clearly an authorization problem.
 */
export const authorize = (...allowedRoles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!allowedRoles.includes(req.user.role)) {
    return next(
      ApiError.forbidden(
        `This action requires one of these roles: ${allowedRoles.join(', ')}`,
      ),
    );
  }
  return next();
};
