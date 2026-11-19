import { env, describeConfig, assertRuntimeConfig } from './src/config/env.js';
import { connectDB, disconnectDB } from './src/config/db.js';
import { createApp } from './src/app.js';
import { logger } from './src/config/logger.js';
import { startHoldSweeper } from './src/jobs/holdSweeper.js';

/**
 * server.js is intentionally small: it starts things and stops them.
 * All HTTP behaviour lives in src/app.js.
 */
async function start() {
  // Fails immediately in production if JWT_SECRET, MONGODB_URI or CLIENT_URL
  // are unsafe. In development this is a no-op.
  assertRuntimeConfig();

  logger.info(`Starting ${env.serviceName} v${env.version}`);
  logger.info(`Config → ${describeConfig()}`);

  // Connect first. If the URI is missing the API still starts so /api/health
  // can explain the problem instead of leaving you with a silent crash.
  await connectDB();

  const app = createApp();

  const server = app.listen(env.port, '0.0.0.0', () => {
    logger.info(`API listening on http://localhost:${env.port}/api/health`);
    startHoldSweeper();
    if (!env.mongoConfigured) {
      logger.warn(
        'Database not configured — add MONGODB_URI to server/.env, then run "npm run seed".',
      );
    }
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(
        `Port ${env.port} is already in use. Stop the other process or change PORT in server/.env.`,
      );
      process.exit(1);
    }
    logger.error('Server error:', error);
    process.exit(1);
  });

  // Close the HTTP server first (stop accepting requests), then the DB pool.
  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down gracefully…`);
    server.close(async () => {
      await disconnectDB().catch(() => {});
      process.exit(0);
    });
    // Never hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

start();
