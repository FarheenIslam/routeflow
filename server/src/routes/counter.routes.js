import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  counterBookingSchema,
  counterCollectParamsSchema,
  counterSearchQuerySchema,
} from '../validators/booking.validator.js';
import {
  getContext,
  getCounterBookings,
  postCollectCash,
  postCounterBooking,
} from '../controllers/counter.controller.js';

const router = Router();

/** Every counter route needs a counter or admin login. */
router.use(authenticate, authorize('COUNTER', 'ADMIN'));

router.get('/context', getContext);

router.get('/bookings', validate({ query: counterSearchQuerySchema }), getCounterBookings);

router.post('/bookings', validate({ body: counterBookingSchema }), postCounterBooking);

router.post(
  '/bookings/:code/collect',
  validate({ params: counterCollectParamsSchema }),
  postCollectCash,
);

export default router;
