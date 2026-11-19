import { Router } from 'express';
import { authenticate, authenticateOptional } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { bookingCreateLimiter, bookingLookupLimiter } from '../middleware/rateLimit.js';
import {
  bookingCodeParamSchema,
  bookingLookupQuerySchema,
  cancelBookingSchema,
  createBookingSchema,
  ticketQuerySchema,
} from '../validators/booking.validator.js';
import {
  getBooking,
  getBookingLookup,
  getCancellationPreview,
  getMyBookings,
  postBooking,
  postCancelBooking,
} from '../controllers/booking.controller.js';

const router = Router();

/**
 * Passenger tickets.
 *
 * Booking is public (the seat hold is a guest session), but limited because each
 * request creates a real reservation. Reading a ticket needs either the same
 * guest session, a signed-in account that owns it, or its phone number.
 */
router.post(
  '/',
  authenticateOptional,
  bookingCreateLimiter,
  validate({ body: createBookingSchema }),
  postBooking,
);

/** Static route before `/:code`, so "lookup" is never read as a ticket number. */
router.get(
  '/lookup',
  bookingLookupLimiter,
  validate({ query: bookingLookupQuerySchema }),
  getBookingLookup,
);

router.get('/', authenticate, getMyBookings);

router.get(
  '/:code/cancellation-preview',
  authenticateOptional,
  validate({ params: bookingCodeParamSchema, query: ticketQuerySchema }),
  getCancellationPreview,
);

router.post(
  '/:code/cancel',
  authenticateOptional,
  validate({
    params: bookingCodeParamSchema,
    query: ticketQuerySchema,
    body: cancelBookingSchema,
  }),
  postCancelBooking,
);

router.get(
  '/:code',
  authenticateOptional,
  validate({ params: bookingCodeParamSchema, query: ticketQuerySchema }),
  getBooking,
);

export default router;
