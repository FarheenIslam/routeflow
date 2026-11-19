import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { AUTH_COOKIE } from '../utils/token.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Payment gateways call us server-to-server with no Origin header and no cookie.
 * Those routes are verified by signature/validator instead, so they are exempt.
 */
const GATEWAY_PREFIXES = ['/api/payments/ipn', '/api/payments/callback'];

/**
 * CSRF guard for cookie-based sessions.
 *
 * A cookie with sameSite=none (needed for the Vercel → Render split) is sent on
 * cross-site requests. An attacker's page cannot read our JSON responses, but it
 * could still trigger a state change with a plain HTML form. Two cheap rules
 * close that door:
 *   1. Any request that changes data must carry an Origin we recognise.
 *   2. A request with no Origin at all is only accepted when it carries no
 *      session cookie (i.e. it is a server-to-server call).
 */
export function verifyRequestOrigin(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const path = req.originalUrl.split('?')[0];
  if (GATEWAY_PREFIXES.some((prefix) => path.startsWith(prefix))) return next();

  const origin = req.get('origin');
  if (origin) {
    const allowed = new Set(env.clientUrls);
    const isLocalDev =
      !env.isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

    if (allowed.has(origin) || isLocalDev) return next();
    return next(ApiError.forbidden('Request blocked: untrusted origin'));
  }

  if (req.cookies?.[AUTH_COOKIE]) {
    return next(ApiError.forbidden('Request blocked: missing Origin header'));
  }

  return next();
}
