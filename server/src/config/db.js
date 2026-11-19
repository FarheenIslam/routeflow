import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

const READY_STATE = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

/**
 * Connects once, at boot. Mongoose keeps a pool of sockets for us, so no
 * per-request connect/disconnect is ever needed.
 */
export async function connectDB() {
  if (!env.mongoConfigured) {
    logger.warn(
      'MONGODB_URI is missing. The API will start, but every database route will fail.',
    );
    logger.warn(
      'Fix: open server/.env and paste your MongoDB Atlas connection string, then restart.',
    );
    return false;
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      maxPoolSize: 10,
    });

    logger.info(`MongoDB connected (database: ${mongoose.connection.name})`);

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected — Mongoose will retry automatically.');
    });
    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error:', error.message);
    });

    return true;
  } catch (error) {
    logger.error('MongoDB connection failed:', error.message);
    logger.error(
      'Check: Atlas cluster is running, the database user password is correct, and your current IP is allowed in Atlas → Network Access.',
    );
    // In production a server without a database is useless: fail fast so the
    // hosting platform reports a clear crash instead of a half-working API.
    if (env.isProduction) process.exit(1);
    return false;
  }
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed.');
  }
}

/** Snapshot used by GET /api/health. Contains no credentials or hostnames. */
export function getDbStatus() {
  const readyState = mongoose.connection.readyState;
  const connected = readyState === 1;

  return {
    // Report the truth: a live connection counts even if MONGODB_URI came from
    // somewhere other than .env (tests point it at a temporary server).
    status: connected
      ? 'connected'
      : env.mongoConfigured
        ? READY_STATE[readyState] ?? 'unknown'
        : 'not_configured',
    connected,
    database: connected ? mongoose.connection.name : null,
  };
}
