import { Router } from 'express';
import { env } from '../config/env.js';
import { getDbStatus } from '../config/db.js';

const router = Router();

/**
 * GET /api/health
 *
 * Purpose: prove the API is alive AND report the database state separately.
 * Monitoring tools should use this before anything else. It runs no queries,
 * so it stays fast and cannot fail because of a slow collection.
 *
 * 200 = API is up (database may still be disconnected — see data.database)
 * 503 = API is up but the database it depends on is not usable
 */
router.get('/', (req, res) => {
  const database = getDbStatus();
  const healthy = database.connected;

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    message: healthy
      ? 'API is running and connected to the database'
      : database.status === 'not_configured'
        ? 'API is running, but MONGODB_URI is not configured yet'
        : 'API is running, but the database is not connected',
    data: {
      service: env.serviceName,
      version: env.version,
      environment: env.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      serverTime: new Date().toISOString(),
      database,
    },
  });
});

export default router;
