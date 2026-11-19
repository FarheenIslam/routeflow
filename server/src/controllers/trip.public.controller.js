import Bus from '../models/Bus.js';
import Route from '../models/Route.js';
import Trip from '../models/Trip.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import {
  containsRegex,
  dhakaDateTime,
  dhakaToday,
  paginated,
} from '../utils/query.js';
import {
  BOOKABLE_TRIP_STATUS_VALUES,
  BUS_TYPE_VALUES,
  ROUTE_STATUS,
} from '../config/constants.js';
import {
  assertTripBookable,
  buildSeatView,
  getBookingSettings,
  getCancellationPolicy,
} from '../services/seat.service.js';
import { guestSessionId } from '../middleware/session.js';
import { tripPopulate, toTripSummary } from '../services/tripView.js';
import { isOnlinePaymentAvailable } from '../services/sslcommerz.service.js';

/**
 * GET /api/trips/search?origin=Dhaka&destination=Chattogram&date=YYYY-MM-DD
 *
 * Matches origin/destination against both the place name and its city, so
 * "Dhaka" finds a route whose origin is "Gabtoli" with city "Dhaka".
 */
export const searchTrips = asyncHandler(async (req, res) => {
  const { origin, destination, busType, page, limit } = req.validatedQuery;
  const settings = await getBookingSettings();
  const today = dhakaToday();
  const date = req.validatedQuery.date ?? today;

  if (date < today) {
    throw new ApiError(400, 'Choose today or a later date', [
      { field: 'date', message: 'This date has already passed' },
    ]);
  }

  const startOfDay = dhakaDateTime(date, '00:00');
  const endOfDay = dhakaDateTime(date, '23:59');
  const horizon = new Date(Date.now() + settings.advanceBookingDays * 24 * 60 * 60 * 1000);

  if (startOfDay > horizon) {
    throw new ApiError(
      400,
      `Bookings open ${settings.advanceBookingDays} days ahead`,
      [{ field: 'date', message: `Choose a date within the next ${settings.advanceBookingDays} days` }],
    );
  }

  const originMatcher = containsRegex(origin);
  const destinationMatcher = containsRegex(destination);

  const routes = await Route.find({
    status: ROUTE_STATUS.ACTIVE,
    $and: [
      { $or: [{ 'origin.name': originMatcher }, { 'origin.city': originMatcher }] },
      {
        $or: [
          { 'destination.name': destinationMatcher },
          { 'destination.city': destinationMatcher },
        ],
      },
    ],
  })
    .select('_id')
    .lean();

  const emptyBody = (total = 0) =>
    res.json({
      success: true,
      message: 'Trips',
      data: {
        items: [],
        pagination: { page, limit, total, totalPages: 1 },
        search: { origin, destination, date, busType: busType ?? null, total },
      },
    });

  if (routes.length === 0) return emptyBody();

  const filter = {
    routeId: { $in: routes.map((route) => route._id) },
    departureAt: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: BOOKABLE_TRIP_STATUS_VALUES },
  };

  if (busType && BUS_TYPE_VALUES.includes(busType)) {
    const buses = await Bus.find({ busType }).select('_id').lean();
    if (buses.length === 0) return emptyBody();
    filter.busId = { $in: buses.map((bus) => bus._id) };
  }

  const [trips, total] = await Promise.all([
    Trip.find(filter)
      .populate(tripPopulate)
      .sort({ departureAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Trip.countDocuments(filter),
  ]);

  const pageData = paginated(trips.map(toTripSummary), total, page, limit);

  res.json({
    success: true,
    message: 'Trips',
    data: {
      ...pageData,
      search: { origin, destination, date, busType: busType ?? null, total },
    },
  });
});

/** GET /api/trips/:id — public departure details (used for a direct link). */
export const getTrip = asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.id).populate(tripPopulate).lean();
  if (!trip) throw ApiError.notFound('Trip not found');

  res.json({ success: true, message: 'Trip', data: { trip: toTripSummary(trip) } });
});

/**
 * GET /api/trips/:id/seats — the seat map.
 *
 * It also tells this browser which seats it already holds, so refreshing the
 * page does not lose a selection that is still inside its two minutes.
 */
export const getTripSeats = asyncHandler(async (req, res) => {
  const sessionId = guestSessionId(req, res);
  const trip = await Trip.findById(req.params.id).populate(tripPopulate);
  if (!trip) throw ApiError.notFound('Trip not found');

  assertTripBookable(trip);

  const [view, settings, cancellationPolicy, onlinePayment] = await Promise.all([
    buildSeatView(trip, sessionId),
    getBookingSettings(),
    getCancellationPolicy(),
    isOnlinePaymentAvailable(),
  ]);

  res.json({
    success: true,
    message: 'Trip seats',
    data: {
      trip: toTripSummary(trip),
      layout: view.layout,
      seats: view.seats,
      seatSummary: view.seatSummary,
      sessionHold: view.sessionHold,
      holdMinutes: settings.holdMinutes,
      maxSeatsPerBooking: settings.maxSeatsPerBooking,
      paymentWindowMinutes: settings.paymentWindowMinutes,
      cancellationPolicy,
      /**
       * What the checkout page may offer. `cash` means "reserve now, pay at a
       * counter"; it is always possible because counters exist offline.
       */
      paymentOptions: {
        online: onlinePayment,
        cashAtCounter: true,
      },
    },
  });
});
