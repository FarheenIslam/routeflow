import SystemSetting from '../models/SystemSetting.js';
import Trip from '../models/Trip.js';
import Route from '../models/Route.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BOOKABLE_TRIP_STATUS_VALUES, ROUTE_STATUS } from '../config/constants.js';
import { getBookingSettings } from '../services/seat.service.js';
import { isOnlinePaymentAvailable } from '../services/sslcommerz.service.js';

/**
 * Public settings.
 *
 * Only what a passenger needs to understand the booking flow: how long a seat is
 * held, how many seats one person may take, how far ahead bookings open, and the
 * cancellation policy. Payment keys, mail keys and JWT settings never appear here.
 */
export const getPublicSettings = asyncHandler(async (_req, res) => {
  const [booking, document, onlinePayment] = await Promise.all([
    getBookingSettings(),
    SystemSetting.findOne({ key: 'global' }).lean(),
    isOnlinePaymentAvailable(),
  ]);

  res.json({
    success: true,
    message: 'Public settings',
    data: {
      settings: {
        booking: {
          holdMinutes: booking.holdMinutes,
          maxSeatsPerBooking: booking.maxSeatsPerBooking,
          advanceBookingDays: booking.advanceBookingDays,
          passengerSelfCancel: booking.passengerSelfCancel,
          paymentWindowMinutes: booking.paymentWindowMinutes,
        },
        cancellationPolicy: document?.cancellationPolicy ?? {
          freeCancelHours: 24,
          halfRefundHours: 2,
          halfRefundPercent: 50,
          noRefundPercent: 0,
        },
        localization: document?.localization ?? {
          defaultLanguage: 'bn',
          ticketLanguages: ['bn', 'en'],
        },
        payments: {
          onlineEnabled: document?.payments?.onlineEnabled ?? false,
          /** True only when keys exist AND the admin has enabled online payment. */
          onlineAvailable: onlinePayment,
        },
      },
    },
  });
});

/**
 * Routes with departures in the next seven days, most frequent first.
 * This is real data from the timetable — nothing is invented when it is empty.
 */
export const getPopularRoutes = asyncHandler(async (_req, res) => {
  const now = new Date();
  const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const rows = await Trip.aggregate([
    {
      $match: {
        departureAt: { $gte: now, $lte: horizon },
        status: { $in: BOOKABLE_TRIP_STATUS_VALUES },
      },
    },
    {
      $group: {
        _id: '$routeId',
        trips: { $sum: 1 },
        fromFare: { $min: '$fare' },
        seats: {
          $sum: {
            $subtract: [
              '$seatSummary.total',
              { $add: ['$seatSummary.booked', '$seatSummary.held'] },
            ],
          },
        },
      },
    },
    { $sort: { trips: -1, fromFare: 1 } },
    { $limit: 6 },
  ]);

  const routes = await Route.find({
    _id: { $in: rows.map((row) => row._id) },
    status: ROUTE_STATUS.ACTIVE,
  })
    .select('code name origin destination estimatedDurationMinutes')
    .lean();

  const routeById = new Map(routes.map((route) => [String(route._id), route]));

  const items = rows
    .map((row) => {
      const route = routeById.get(String(row._id));
      if (!route) return null;
      return {
        id: String(route._id),
        code: route.code,
        name: route.name,
        origin: route.origin,
        destination: route.destination,
        estimatedDurationMinutes: route.estimatedDurationMinutes,
        trips: row.trips,
        fromFare: row.fromFare,
        availableSeats: Math.max(0, row.seats),
      };
    })
    .filter(Boolean);

  res.json({ success: true, message: 'Popular routes', data: { routes: items } });
});
