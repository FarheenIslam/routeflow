import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/constants.js';
import {
  driverLocationSchema,
  driverTripParamsSchema,
  driverTripStatusSchema,
} from '../validators/driver.validator.js';
import {
  getDriverHistory,
  getDriverLocations,
  getDriverTripDetail,
  getDriverTrips,
  postDriverLocation,
  postDriverTripStatus,
} from '../controllers/driver.controller.js';

const router = Router();

/** The driver console belongs to drivers. Admin tooling stays in /api/admin. */
router.use(authenticate, authorize(ROLES.DRIVER));

const withTripId = validate({ params: driverTripParamsSchema });

router.get('/trips', getDriverTrips);
router.get('/history', getDriverHistory);
router.get('/trips/:id', withTripId, getDriverTripDetail);
router.get('/trips/:id/locations', withTripId, getDriverLocations);
router.post(
  '/trips/:id/status',
  withTripId,
  validate({ body: driverTripStatusSchema }),
  postDriverTripStatus,
);
router.post(
  '/trips/:id/location',
  withTripId,
  validate({ body: driverLocationSchema }),
  postDriverLocation,
);

export default router;
