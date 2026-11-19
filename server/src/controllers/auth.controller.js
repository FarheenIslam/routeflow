import { asyncHandler } from '../utils/asyncHandler.js';
import {
  AUTH_COOKIE,
  authCookieOptions,
  clearAuthCookieOptions,
  signAuthToken,
} from '../utils/token.js';
import {
  changePassword,
  loginUser,
  registerPassenger,
  requestPasswordReset,
  resetPassword,
  toPublicUser,
} from '../services/auth.service.js';

/**
 * Controllers stay thin: read the request, call a service, shape the response.
 * No database queries and no business rules live here.
 */

export const register = asyncHandler(async (req, res) => {
  const user = await registerPassenger(req.body);
  res.cookie(AUTH_COOKIE, signAuthToken(user), authCookieOptions());

  res.status(201).json({
    success: true,
    message: 'Your account has been created',
    data: { user: toPublicUser(user) },
  });
});

export const login = asyncHandler(async (req, res) => {
  const user = await loginUser(req.body);
  res.cookie(AUTH_COOKIE, signAuthToken(user), authCookieOptions());

  res.json({
    success: true,
    message: 'Signed in successfully',
    data: { user: toPublicUser(user) },
  });
});

export const logout = (req, res) => {
  res.clearCookie(AUTH_COOKIE, clearAuthCookieOptions());
  res.json({ success: true, message: 'Signed out', data: null });
};

export const me = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Current session',
    data: { user: toPublicUser(req.user) },
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await requestPasswordReset(req.body.email);

  res.json({
    success: true,
    // Same message whether or not the account exists.
    message: 'If that email is registered, a password reset link has been sent.',
    data: result.devResetUrl ? { devResetUrl: result.devResetUrl } : null,
  });
});

export const resetPasswordWithToken = asyncHandler(async (req, res) => {
  await resetPassword(req.params.token, req.body.password);

  res.json({
    success: true,
    message: 'Your password has been updated. Please sign in with the new password.',
    data: null,
  });
});

export const updatePassword = asyncHandler(async (req, res) => {
  const user = await changePassword(req.userId, req.body);

  // The password change invalidated the old token, so issue a fresh one.
  res.cookie(AUTH_COOKIE, signAuthToken(user), authCookieOptions());

  res.json({
    success: true,
    message: 'Password updated',
    data: { user: toPublicUser(user) },
  });
});
