import { Router } from 'express';
import { getPopularRoutes, getPublicSettings } from '../controllers/public.controller.js';

const router = Router();

/** Public configuration and homepage data. Cached briefly by the client, not the server. */
router.get('/settings', getPublicSettings);
router.get('/popular-routes', getPopularRoutes);

export default router;
