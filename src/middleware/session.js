import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Guest seat-hold session.
 *
 * A passenger may hold seats before creating an account, so the hold needs an
 * identity that is not a login. We use a random id in an httpOnly cookie:
 *   - httpOnly: page JavaScript cannot read or copy it
 *   - sameSite/secure mirror the auth cookie, so the Vercel → Render split works
 *   - it carries no personal data, only a random 48-character string
 *
 * The id is not a security boundary by itself: a hold is only ever released by
 * the session that created it, and the seat itself is the valuable resource.
 */
export const GUEST_COOKIE = 'bb_sid';

const SESSION_PATTERN = /^[a-f0-9]{32,64}$/;

export function readGuestSessionId(req) {
  const value = String(req.cookies?.[GUEST_COOKIE] ?? '');
  return SESSION_PATTERN.test(value) ? value : null;
}

/** Returns the caller's guest session, creating and setting the cookie if needed. */
export function guestSessionId(req, res) {
  const existing = readGuestSessionId(req);
  if (existing) return existing;

  const id = crypto.randomBytes(24).toString('hex');

  res.cookie(GUEST_COOKIE, id, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });

  return id;
}
