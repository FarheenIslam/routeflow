import { asyncHandler } from '../utils/asyncHandler.js';
import { BOOKING_CHANNEL, PAYMENT_METHOD } from '../config/constants.js';
import {
  createBooking,
  collectCashPayment,
  getBookingViewById,
  resolveStaffCounter,
  searchBookings,
} from '../services/booking.service.js';

/**
 * Counter sales — the offline half of the system.
 *
 * A counter staff member sells a seat without a guest hold: the same atomic
 * seat claim is used, so an online passenger who is holding that seat still wins
 * and the counter sees a clear 409 instead of a double sale.
 */

/** GET /api/counter/context — which counter this staff member is attached to. */
export const getContext = asyncHandler(async (req, res) => {
  const counter = await resolveStaffCounter(req.user);

  res.json({
    success: true,
    message: 'Counter context',
    data: {
      counter: counter
        ? {
            id: String(counter._id),
            code: counter.code,
            name: counter.name,
            branchName: counter.branchName,
          }
        : null,
      staff: {
        id: String(req.user._id),
        name: req.user.name,
        role: req.user.role,
      },
    },
  });
});

/** POST /api/counter/bookings — cash sale, paid immediately. */
export const postCounterBooking = asyncHandler(async (req, res) => {
  const counter = await resolveStaffCounter(req.user);
  const { tripId, seatNumbers, passenger } = req.body;

  const { booking } = await createBooking({
    tripId,
    seatNumbers,
    passenger,
    paymentMethod: PAYMENT_METHOD.CASH,
    channel: BOOKING_CHANNEL.COUNTER,
    user: req.user,
    counterId: counter?._id ?? null,
  });

  const view = await getBookingViewById(booking._id, { includeVerification: true });

  res.status(201).json({
    success: true,
    message: 'Ticket sold',
    data: { booking: view, counter: counter ? { code: counter.code, name: counter.name } : null },
  });
});

/** POST /api/counter/bookings/:code/collect — take cash for a reservation. */
export const postCollectCash = asyncHandler(async (req, res) => {
  const counter = await resolveStaffCounter(req.user);

  const booking = await collectCashPayment({
    code: req.params.code,
    user: req.user,
    counterId: counter?._id ?? null,
  });

  res.json({
    success: true,
    message: 'Cash received — ticket confirmed',
    data: { booking },
  });
});

/** GET /api/counter/bookings?q=… — find a ticket by number, phone or name. */
export const getCounterBookings = asyncHandler(async (req, res) => {
  const bookings = await searchBookings({ query: req.validatedQuery.q });
  res.json({ success: true, message: 'Bookings', data: { bookings } });
});
