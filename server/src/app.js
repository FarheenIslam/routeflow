import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import { ApiError } from './utils/ApiError.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { verifyRequestOrigin } from './middleware/security.js';
import apiRoutes from './routes/index.js';

/**
 * Builds the Express app without listening on a port.
 * Keeping app creation separate from server.js lets the test suite import the
 * app directly with Supertest later, without opening a real port.
 */
export function createApp() {
  const app = express();

  // Render/Vercel put a proxy in front of us; this makes req.ip and
  // secure-cookie detection see the real client instead of the proxy.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // --- Security headers -----------------------------------------------------
  app.use(
    helmet({
      // The API serves JSON only, so the default restrictive CSP is fine.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // --- CORS ----------------------------------------------------------------
  // Only origins listed in CLIENT_URL may call this API with cookies.
  const allowedOrigins = new Set(env.clientUrls);

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header: server-to-server, curl, or payment gateway IPN.
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        // Local development on any localhost port (Vite sometimes shifts 3000→3001).
        if (!env.isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        return callback(
          new ApiError(403, `Origin ${origin} is not allowed to call this API`),
        );
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      maxAge: 86_400,
    }),
  );

  // --- Body parsing & sanitising -------------------------------------------
  // 1 MB is plenty: this API accepts JSON only, never files.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  // Strips keys starting with "$" or containing "." from body/query/params,
  // which blocks the classic MongoDB injection payloads.
  app.use(mongoSanitize());
  // Blocks HTTP parameter pollution (?role=ADMIN&role=PASSENGER).
  app.use(hpp());

  // CSRF guard: a state-changing request that carries our session cookie must
  // also carry a trusted Origin header. Runs after cookieParser so it can see
  // whether a session cookie is present.
  app.use(verifyRequestOrigin);

  app.use(compression());
  if (!env.isProduction) app.use(morgan('dev'));

  // --- Rate limiting -------------------------------------------------------
  // Health checks are mounted before the limiter so uptime pings are never
  // rate limited. Stricter per-route limits (login, holds) are added later.
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests from this IP. Please try again in a few minutes.',
    },
  });

  // --- Routes --------------------------------------------------------------
  app.use('/api', globalLimiter, apiRoutes);

  // --- Errors --------------------------------------------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
