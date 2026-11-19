import mongoose from 'mongoose';

import { env, describeConfig } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { logger } from '../config/logger.js';
import { ROLES, USER_STATUS, BD_PHONE_PATTERN } from '../config/constants.js';
import User from '../models/User.js';
import SystemSetting from '../models/SystemSetting.js';
// Side-effect import: registering the model makes ensureIndexes() build the
// unique (tripId, seatNumber) index that keeps concurrent seat holds safe.
import '../models/SeatHold.js';
import '../models/Booking.js';
import '../models/Payment.js';
import '../models/Cancellation.js';
import '../models/Notification.js';
import '../models/TripLocationUpdate.js';
import { seedDemoData } from './demo.js';

/**
 * npm run seed
 *
 * Safe to run many times: it never overwrites data that already exists.
 * Step 1 builds the real MongoDB indexes (important: the seat-hold unique index
 * later depends on this, so index creation is part of every seed run).
 * Step 2 creates the singleton settings document.
 * Step 3 creates the first admin from ADMIN_* variables.
 */

async function ensureIndexes() {
  // syncIndexes() also drops stale indexes, so a changed unique index (for
  // example the partial trip-conflict indexes) is replaced, not duplicated.
  const models = Object.values(mongoose.models);
  await Promise.all(models.map((model) => model.syncIndexes()));
  logger.info(`Indexes synced: ${models.map((model) => model.modelName).join(', ')}.`);
}

async function seedSettings() {
  const existing = await SystemSetting.findOne({ key: 'global' });
  if (existing) {
    logger.info('SystemSettings already exists — left untouched.');
    return existing;
  }
  const created = await SystemSetting.create({ key: 'global' });
  logger.info(
    'SystemSettings created (cancellation 24h=100%, 2–24h=50%, <2h=0%; hold 2 min).',
  );
  return created;
}

function adminConfigProblems() {
  const problems = [];
  if (!env.admin.email) problems.push('ADMIN_EMAIL is empty');
  if (!env.admin.password || env.admin.password.length < 8) {
    problems.push('ADMIN_PASSWORD must be at least 8 characters');
  }
  if (!BD_PHONE_PATTERN.test(env.admin.phone)) {
    problems.push('ADMIN_PHONE must be a valid BD number, e.g. 01712345678');
  }
  return problems;
}

async function seedAdmin() {
  const problems = adminConfigProblems();
  if (problems.length > 0) {
    problems.forEach((problem) => logger.warn(`Admin account skipped: ${problem}`));
    logger.warn(
      'Set ADMIN_NAME / ADMIN_EMAIL / ADMIN_PHONE / ADMIN_PASSWORD in server/.env, then run "npm run seed" again.',
    );
    return null;
  }

  const email = env.admin.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    logger.info(`Admin ${email} already exists — left untouched.`);
    return existing;
  }

  const admin = await User.create({
    name: env.admin.name,
    email,
    phone: env.admin.phone,
    passwordHash: await User.hashPassword(env.admin.password),
    role: ROLES.ADMIN,
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
  });

  logger.info(`Admin created: ${admin.email}`);
  return admin;
}

async function main() {
  logger.info(`Seed started → ${describeConfig()}`);

  const connected = await connectDB();
  if (!connected) {
    logger.error(
      'Seed aborted: no database connection. Put your MongoDB Atlas URI in server/.env as MONGODB_URI and try again.',
    );
    process.exitCode = 1;
    return;
  }

  await ensureIndexes();
  await seedSettings();
  await seedAdmin();

  if (env.seedDemoData) {
    await seedDemoData();
  } else {
    logger.info('Demo fleet data skipped (SEED_DEMO_DATA=false).');
  }

  logger.info('Seed finished successfully.');

  await disconnectDB();
}

main().catch(async (error) => {
  logger.error('Seed failed:', error);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
