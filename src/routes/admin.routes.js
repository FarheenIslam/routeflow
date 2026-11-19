import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../config/constants.js';

import { getDashboard } from '../controllers/admin/dashboard.controller.js';
import { getLookups } from '../controllers/admin/lookup.controller.js';
import { getSettings, updateSettings } from '../controllers/admin/settings.controller.js';
import {
  getCancellations,
  patchCancellationRefund,
} from '../controllers/admin/cancellation.controller.js';
import {
  getReportsBookingsCsv,
  getReportsSummary,
} from '../controllers/admin/report.controller.js';

import {
  createBus,
  deleteBus,
  getBus,
  listBuses,
  updateBus,
  updateBusStatus,
} from '../controllers/admin/bus.controller.js';
import {
  createDriver,
  deleteDriver,
  getDriver,
  listDrivers,
  updateDriver,
} from '../controllers/admin/driver.controller.js';
import {
  createRoute,
  deleteRoute,
  getRoute,
  listRoutes,
  updateRoute,
} from '../controllers/admin/route.controller.js';
import {
  getTrip,
  listTrips,
  patchTrip,
  patchTripStatus,
  postTrip,
  postTripCancel,
} from '../controllers/admin/trip.controller.js';
import {
  createCounter,
  deleteCounter,
  getCounter,
  listCounters,
  updateCounter,
} from '../controllers/admin/counter.controller.js';
import {
  createStaffUser,
  listUsers,
  updateUserRole,
  updateUserStatus,
} from '../controllers/admin/user.controller.js';

import {
  busCreateSchema,
  busStatusSchema,
  busUpdateSchema,
  counterCreateSchema,
  counterUpdateSchema,
  driverCreateSchema,
  driverUpdateSchema,
  routeCreateSchema,
  routeUpdateSchema,
  cancellationQuerySchema,
  refundReviewSchema,
  reportQuerySchema,
  settingsUpdateSchema,
  tripCancelSchema,
  tripCreateSchema,
  tripStatusSchema,
  tripUpdateSchema,
  userCreateSchema,
  userRoleSchema,
  userStatusSchema,
} from '../validators/admin.validator.js';

const router = Router();

// Every route below requires a signed-in ADMIN. Mounted once, so a new endpoint
// added later cannot accidentally be public.
router.use(authenticate, authorize(ROLES.ADMIN));

const idParams = z.object({
  id: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'That identifier is not valid'),
});
const withId = validate({ params: idParams });

router.get('/dashboard', getDashboard);
router.get('/lookups', getLookups);

router.get('/settings', getSettings);
router.put('/settings', validate({ body: settingsUpdateSchema }), updateSettings);

// --- Buses -----------------------------------------------------------------
router.get('/buses', listBuses);
router.post('/buses', validate({ body: busCreateSchema }), createBus);
router.get('/buses/:id', withId, getBus);
router.patch('/buses/:id', withId, validate({ body: busUpdateSchema }), updateBus);
router.patch('/buses/:id/status', withId, validate({ body: busStatusSchema }), updateBusStatus);
router.delete('/buses/:id', withId, deleteBus);

// --- Drivers ---------------------------------------------------------------
router.get('/drivers', listDrivers);
router.post('/drivers', validate({ body: driverCreateSchema }), createDriver);
router.get('/drivers/:id', withId, getDriver);
router.patch('/drivers/:id', withId, validate({ body: driverUpdateSchema }), updateDriver);
router.delete('/drivers/:id', withId, deleteDriver);

// --- Routes ----------------------------------------------------------------
router.get('/routes', listRoutes);
router.post('/routes', validate({ body: routeCreateSchema }), createRoute);
router.get('/routes/:id', withId, getRoute);
router.patch('/routes/:id', withId, validate({ body: routeUpdateSchema }), updateRoute);
router.delete('/routes/:id', withId, deleteRoute);

// --- Trips -----------------------------------------------------------------
router.get('/trips', listTrips);
router.post('/trips', validate({ body: tripCreateSchema }), postTrip);
router.get('/trips/:id', withId, getTrip);
router.patch('/trips/:id', withId, validate({ body: tripUpdateSchema }), patchTrip);
router.patch('/trips/:id/status', withId, validate({ body: tripStatusSchema }), patchTripStatus);
router.post('/trips/:id/cancel', withId, validate({ body: tripCancelSchema }), postTripCancel);

// --- Cancellations & refunds ------------------------------------------------
router.get(
  '/cancellations',
  validate({ query: cancellationQuerySchema }),
  getCancellations,
);
router.patch(
  '/cancellations/:id/refund',
  withId,
  validate({ body: refundReviewSchema }),
  patchCancellationRefund,
);

// --- Reports ---------------------------------------------------------------
router.get(
  '/reports/summary',
  validate({ query: reportQuerySchema }),
  getReportsSummary,
);
router.get(
  '/reports/bookings.csv',
  validate({ query: reportQuerySchema }),
  getReportsBookingsCsv,
);

// --- Counters --------------------------------------------------------------
router.get('/counters', listCounters);
router.post('/counters', validate({ body: counterCreateSchema }), createCounter);
router.get('/counters/:id', withId, getCounter);
router.patch('/counters/:id', withId, validate({ body: counterUpdateSchema }), updateCounter);
router.delete('/counters/:id', withId, deleteCounter);

// --- Users -----------------------------------------------------------------
router.get('/users', listUsers);
router.post('/users', validate({ body: userCreateSchema }), createStaffUser);
router.patch('/users/:id/status', withId, validate({ body: userStatusSchema }), updateUserStatus);
router.patch('/users/:id/role', withId, validate({ body: userRoleSchema }), updateUserRole);

export default router;
