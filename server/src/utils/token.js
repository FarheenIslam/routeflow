import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/** Name of the httpOnly cookie that carries the session token. */
export const AUTH_COOKIE = 'bb_token';

/** "7d" / "12h" / "30m" / "45s" → milliseconds. Falls back to 7 days. */
function durationToMs(value) {
  const match = /^(\d+)([smhd])$/.exec(String(value).trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return amount * unit;
}

/**
 * Cookie flags.
 * - httpOnly: JavaScript in the browser cannot read the token, so an XSS bug
 *   cannot steal a session.
 * - secure + sameSite=none in production: the Vercel frontend and the Render API
 *   are different sites, so a cross-site cookie is required. sameSite=lax is
 *   safer locally, where everything is on localhost.
 */
export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: durationToMs(env.jwtExpiresIn),
  };
}

export function clearAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'lax',
    path: '/',
  };
}

/**
 * The token carries the role for fast authorization, but `authenticate` always
 * reloads the user from the database — so demoting or suspending someone takes
 * effect immediately instead of when their token expires.
 */
export function signAuthToken(user) {
  return jwt.sign(
    { role: user.role, tv: user.tokenVersion ?? 0 },
    env.jwtSecret,
    { subject: String(user._id), expiresIn: env.jwtExpiresIn },
  );
}

export function verifyAuthToken(token) {
  return jwt.verify(token, env.jwtSecret);
}
