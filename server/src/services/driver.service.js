import Booking from '../models/Booking.js';
import Driver from '../models/Driver.js';
import Trip from '../models/Trip.js';
import TripLocationUpdate from '../models/TripLocationUpdate.js';
import Route from '../models/Route.js';
import { BOOKING_STATUS, TRIP_STATUS } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { dhakaDateTime, dhakaToday } from '../utils/query.js';

/**
 * Driver console.
 *
 * Everything here is scoped to the signed-in driver's own profile. There is no
 * "pick any driver" endpoint, so a driver can never start or move another
 * driver's trip by guessing an id.
 *
 * Location reporting is manual by design: the driver says where the bus is. No
 * GPS is implied and no position is invented.
 */

const DRIVER_TRANSITIONS = Object.freeze({
  [TRIP_STATUS.SCHEDULED]: [TRIP_STATUS.STARTED, TRIP_STATUS.DELAYED],
  [TRIP_STATUS.DELAYED]: [TRIP_STATUS.STARTED],
  [TRIP_STATUS.STARTED]: [TRIP_STATUS.AT_STOP, TRIP_STATUS.COMPLETED],
  [TRIP_STATUS.AT_STOP]: [TRIP_STATUS.STARTED, TRIP_STATUS.COMPLETED],
});

function tripDayRange(dateValue) {
  const date = dateValue ? String(dateValue).slice(0, 10) : dhakaToday();
  const start = dhakaDateTime(date, '00:00');
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { date, start, end };
}

export function driverSummary(driver) {
  return {
    id: String(driver._id),
    name: driver.name,
    phone: driver.phone,
    licenseNumber: driver.licenseNumber,
    status: driver.status,
    assignedBus: driver.assignedBusId
      ? {
          id: String(driver.assignedBusId._id ?? driver.assignedBusId),
          busNumber: driver.assignedBusId.busNumber ?? null,
          operatorName: driver.assignedBusId.operatorName ?? null,
          busType: driver.assignedBusId.busType ?? null,
        }
      : null,
  };
}

export async function getDriverProfile(user) {
  const driver = await Driver.findOne({ userId: user._id }).populate(
    'assignedBusId',
    'busNumber operatorName busType',
  );

  if (!driver) {
    throw ApiError.notFound(
      'No driver profile is linked to this account. Ask an administrator to create it.',
    );
  }
  return driver;
}

function stopList(route) {
  return [...(route?.stops ?? [])].sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0),
  );
}

function tripSummary(trip) {
  return {
    id: String(trip._id),
    tripCode: trip.tripCode,
    status: trip.status,
    departureAt: trip.departureAt,
    departureTime: trip.departureTime,
    arrivalEstimateAt: trip.arrivalEstimateAt,
    fare: trip.fare,
    boardingPoints: trip.boardingPoints ?? [],
    droppingPoints: trip.droppingPoints ?? [],
    seatSummary: trip.seatSummary ?? { total: 0, booked: 0, held: 0 },
    passengerCount: trip.seatSummary?.booked ?? 0,
    startedAt: trip.startedAt ?? null,
    completedAt: trip.completedAt ?? null,
    cancelReason: trip.cancelReason ?? null,
    route: trip.routeId
      ? {
          id: String(trip.routeId._id ?? trip.routeId),
          code: trip.routeId.code ?? '',
          name: trip.routeId.name ?? '',
          origin: trip.routeId.origin ?? null,
          destination: trip.routeId.destination ?? null,
          stops: stopList(trip.routeId),
        }
      : null,
    bus: trip.busId
      ? {
          id: String(trip.busId._id ?? trip.busId),
          busNumber: trip.busId.busNumber ?? '',
          operatorName: trip.busId.operatorName ?? '',
          busType: trip.busId.busType ?? '',
        }
      : null,
  };
}

const driverTripPopulate = [
  {
    path: 'routeId',
    select:
      'code name origin destination stops estimatedDurationMinutes totalDistanceKm',
  },
  { path: 'busId', select: 'busNumber operatorName busType totalSeats amenities' },
  { path: 'driverId', select: 'name phone licenseNumber' },
];

/** Today's assigned trips (Dhaka day), or another date for planning. */
export async function listDriverTrips(user, { date } = {}) {
  const driver = await getDriverProfile(user);
  const range = tripDayRange(date);

  const trips = await Trip.find({
    driverId: driver._id,
    departureAt: { $gte: range.start, $lt: range.end },
  })
    .populate(driverTripPopulate)
    .sort({ departureAt: 1 })
    .lean();

  return {
    driver: driverSummary(driver),
    date: range.date,
    trips: trips.map(tripSummary),
  };
}

async function assertOwnTrip(driver, tripId) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw ApiError.notFound('Trip not found');

  if (String(trip.driverId) !== String(driver._id)) {
    throw ApiError.forbidden('This trip is assigned to another driver');
  }
  return trip;
}

function locationSummary(update) {
  if (!update) return null;
  return {
    id: String(update._id),
    lat: update.location.lat,
    lng: update.location.lng,
    currentStopIndex: update.currentStopIndex ?? null,
    currentStopName: update.currentStopName ?? null,
    nextStopName: update.nextStopName ?? null,
    atStop: update.atStop,
    betweenStops: update.betweenStops,
    note: update.note ?? null,
    reportedAt: update.reportedAt,
    isManual: update.isManual,
  };
}

export async function getDriverTrip(user, tripId) {
  const driver = await getDriverProfile(user);
  await assertOwnTrip(driver, tripId);

  const [trip, lastLocation, passengers] = await Promise.all([
    Trip.findById(tripId).populate(driverTripPopulate).lean(),
    TripLocationUpdate.findOne({ tripId }).sort({ reportedAt: -1 }).lean(),
    Booking.find({
      tripId,
      status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] },
    })
      .select('bookingCode passenger.name passenger.phone seats seatCount')
      .sort({ 'seats.seatNumber': 1 })
      .lean(),
  ]);

  return {
    ...tripSummary(trip),
    driver: trip.driverId
      ? { name: trip.driverId.name, phone: trip.driverId.phone }
      : null,
    lastLocation: locationSummary(lastLocation),
    passengers: passengers.map((booking) => ({
      bookingCode: booking.bookingCode,
      name: booking.passenger.name,
      phone: booking.passenger.phone,
      seats: booking.seats.map((seat) => seat.seatLabel),
      seatCount: booking.seatCount,
    })),
  };
}

/**
 * Driver moves the trip through its real lifecycle. The transition table is the
 * rule; anything else (including reopening a completed or cancelled trip) is a
 * clear 409 rather than a silent status write.
 */
export async function updateTripStatus({ user, tripId, status, note = null }) {
  const driver = await getDriverProfile(user);
  const trip = await assertOwnTrip(driver, tripId);

  if (trip.status === status) {
    throw ApiError.conflict(`This trip is already ${status}`);
  }
  if (trip.status === TRIP_STATUS.CANCELLED) {
    throw ApiError.conflict('A cancelled trip cannot be updated by the driver');
  }
  if (trip.status === TRIP_STATUS.COMPLETED) {
    throw ApiError.conflict('A completed trip cannot be reopened');
  }

  const allowed = DRIVER_TRANSITIONS[trip.status] ?? [];
  if (!allowed.includes(status)) {
    throw ApiError.conflict(
      `A ${trip.status} trip cannot be moved to ${status}`,
    );
  }

  const updates = { status };
  if (status === TRIP_STATUS.STARTED && !trip.startedAt) updates.startedAt = new Date();
  if (status === TRIP_STATUS.COMPLETED) updates.completedAt = new Date();

  const saved = await Trip.findByIdAndUpdate(trip._id, { $set: updates }, { new: true })
    .populate(driverTripPopulate)
    .lean();

  // A status note is a useful manual breadcrumb, but only when coordinates are
  // absent we cannot store a location without lat/lng — so keep it on the trip
  // only as a log line rather than inventing a position.
  if (note) {
    logger.info(
      `[DRIVER] ${driver.name} moved ${trip.tripCode} to ${status}: ${note}`,
    );
  }

  return tripSummary(saved);
}

/**
 * Manual location update. `currentStopIndex` decides which stop the bus is at;
 * when omitted we keep the last reported index (or the first stop) instead of
 * guessing a new one.
 */
export async function reportDriverLocation({
  user,
  tripId,
  lat,
  lng,
  note = null,
  currentStopIndex = null,
  atStop = false,
}) {
  const driver = await getDriverProfile(user);
  const trip = await assertOwnTrip(driver, tripId);

  if (![TRIP_STATUS.STARTED, TRIP_STATUS.AT_STOP].includes(trip.status)) {
    throw ApiError.conflict(
      'Start the trip before reporting a location. A scheduled or finished trip has no live position.',
    );
  }

  const route = await Route.findById(trip.routeId).select(
    'name origin destination stops',
  );
  const stops = stopList(route);

  const previous = await TripLocationUpdate.findOne({ tripId })
    .sort({ reportedAt: -1 })
    .select('currentStopIndex')
    .lean();

  let index = currentStopIndex ?? previous?.currentStopIndex ?? 0;
  if (!Number.isInteger(index) || index < 0 || index >= Math.max(stops.length, 1)) {
    throw ApiError.badRequest('That stop does not exist on this route', [
      { field: 'currentStopIndex', message: 'Choose an existing stop' },
    ]);
  }

  const currentStop = stops[index] ?? null;
  const nextStop = stops[index + 1] ?? null;

  const update = await TripLocationUpdate.create({
    tripId: trip._id,
    driverId: driver._id,
    tripStatusAtReport: trip.status,
    currentStopIndex: currentStop ? index : null,
    currentStopName: currentStop?.name ?? route?.origin?.name ?? null,
    nextStopName:
      nextStop?.name ?? route?.destination?.name ?? null,
    atStop: Boolean(atStop),
    betweenStops: Boolean(atStop) ? false : Boolean(nextStop),
    location: { lat, lng },
    note,
    isManual: true,
    reportedAt: new Date(),
  });

  return locationSummary(update);
}

/** Recent completed trips for the driver's history. */
export async function listDriverHistory(user) {
  const driver = await getDriverProfile(user);
  const trips = await Trip.find({
    driverId: driver._id,
    status: TRIP_STATUS.COMPLETED,
  })
    .populate(driverTripPopulate)
    .sort({ departureAt: -1 })
    .limit(20)
    .lean();

  return trips.map(tripSummary);
}

export async function listDriverLocations(user, tripId) {
  const driver = await getDriverProfile(user);
  await assertOwnTrip(driver, tripId);

  const updates = await TripLocationUpdate.find({ tripId })
    .sort({ reportedAt: -1 })
    .limit(50)
    .lean();

  return updates.map(locationSummary);
}
