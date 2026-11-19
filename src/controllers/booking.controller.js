import { asyncHandler } from '../utils/asyncHandler.js';
import { guestSessionId, readGuestSessionId } from '../middleware/session.js';
import {
  createBooking,
  getBookingForViewer,
  getBookingViewById,
  listBookingsForPassenger,
  lookupBooking,
} from '../services/booking.service.js';
import { BOOKING_CHANNEL } from '../config/constants.js';
import {
  cancelBooking,
  getCancellationForBooking,
  previewCancellation,
} from '../services/cancellation.service.js';

/**
 * POST /api/bookings — turn this browser's seat holds into a ticket.
 *
 * No login is required, because the hold belongs to the `bb_sid` guest session.
 * A signed-in passenger is linked to the ticket; a guest simply gets a ticket
 * number plus the phone they entered, which together open the ticket later.
 */
export const postBooking = asyncHandler(async (req, res) => {
  const sessionId = guestSessionId(req, res);
  const { tripId, seatNumbers, passenger, paymentMethod } = req.body;

  const { booking } = await createBooking({
    tripId,
    seatNumbers,
    passenger,
    paymentMethod,
    channel: BOOKING_CHANNEL.ONLINE,
    sessionId,
    user: req.user ?? null,
  });

  const view = await getBookingViewById(booking._id, { includeVerification: true });

  res.status(201).json({
    success: true,
    message: 'Ticket created',
    data: { booking: view },
  });
});

/** GET /api/bookings/:code — the ticket itself. */
export const getBooking = asyncHandler(async (req, res) => {
  const view = await getBookingForViewer({
    code: req.params.code,
    user: req.user ?? null,
    sessionId: readGuestSessionId(req),
    phone: req.validatedQuery.phone,
  });

  if (view.cancelledAt) {
    view.cancellation = await getCancellationForBooking(view.id);
  }

  res.json({ success: true, message: 'Ticket', data: { booking: view } });
});

/**
 * GET /api/bookings/lookup?code=…&phone=…
 * Both must match. This is how someone reopens a ticket on another device
 * without remembering a password.
 */
export const getBookingLookup = asyncHandler(async (req, res) => {
  const booking = await lookupBooking({
    code: req.validatedQuery.code,
    phone: req.validatedQuery.phone,
  });

  if (booking.cancelledAt) {
    booking.cancellation = await getCancellationForBooking(booking.id);
  }

  res.json({ success: true, message: 'Ticket', data: { booking } });
});

/** GET /api/bookings/:code/cancellation-preview — allowed? how much refund? */
export const getCancellationPreview = asyncHandler(async (req, res) => {
  const preview = await previewCancellation({
    code: req.params.code,
    user: req.user ?? null,
    sessionId: readGuestSessionId(req),
    phone: req.validatedQuery.phone,
  });

  res.json({ success: true, message: 'Cancellation preview', data: { preview } });
});

/** POST /api/bookings/:code/cancel — cancel once, release seats, record refund. */
export const postCancelBooking = asyncHandler(async (req, res) => {
  const result = await cancelBooking({
    code: req.params.code,
    reason: req.body.reason,
    user: req.user ?? null,
    sessionId: readGuestSessionId(req),
    phone: req.validatedQuery.phone,
  });

  res.json({
    success: true,
    message: 'Ticket cancelled',
    data: result,
  });
});

/** GET /api/bookings — the signed-in passenger's ticket list. */
export const getMyBookings = asyncHandler(async (req, res) => {
  const bookings = await listBookingsForPassenger(req.user);
  res.json({ success: true, message: 'Your tickets', data: { bookings } });
});
