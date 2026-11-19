import { Router } from 'express';
import { authenticateOptional } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { bookingCreateLimiter } from '../middleware/rateLimit.js';
import { initiatePaymentSchema } from '../validators/booking.validator.js';
import {
  gatewayCancel,
  gatewayFail,
  gatewayIpn,
  gatewaySuccess,
  postInitiatePayment,
} from '../controllers/payment.controller.js';

const router = Router();

/**
 * Online gateway routes.
 *
 * `/callback/*` and `/ipn` are deliberately mounted before any auth: SSLCommerz
 * calls them from its own servers, with a form body and no Origin header. They
 * are protected by server-side validation instead (see payment.service.js), not
 * by a session. The CSRF middleware exempts exactly these prefixes.
 */
router.post(
  '/initiate',
  authenticateOptional,
  bookingCreateLimiter,
  validate({ body: initiatePaymentSchema }),
  postInitiatePayment,
);

router.post('/callback/success', gatewaySuccess);
router.post('/callback/fail', gatewayFail);
router.post('/callback/cancel', gatewayCancel);
router.post('/ipn', gatewayIpn);

export default router;
