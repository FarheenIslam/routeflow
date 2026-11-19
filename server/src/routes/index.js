import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import publicRoutes from './public.routes.js';
import tripRoutes from './trips.routes.js';
import holdRoutes from './holds.routes.js';
import bookingRoutes from './bookings.routes.js';
import paymentRoutes from './payments.routes.js';
import counterRoutes from './counter.routes.js';
import driverRoutes from './driver.routes.js';
import adminRoutes from './admin.routes.js';

/**
 * The single place where API areas are mounted.
 * Later phases add: /admin/reports — each as its own router file, mounted here once.
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/public', publicRoutes);
router.use('/trips', tripRoutes);
router.use('/holds', holdRoutes);
router.use('/bookings', bookingRoutes);
router.use('/payments', paymentRoutes);
router.use('/counter', counterRoutes);
router.use('/driver', driverRoutes);
router.use('/admin', adminRoutes);

export default router;
