import crypto from 'node:crypto';
import Trip from '../models/Trip.js';
import Bus from '../models/Bus.js';
import Route from '../models/Route.js';
import Driver from '../models/Driver.js';
import { ApiError } from '../utils/ApiError.js';
import { dhakaDateTime } from '../utils/query.js';
import { BUS_STATUS, DRIVER_STATUS, TRIP_STATUS } from '../config/constants.js';

const MINUTE = 60 * 1000;

/**
 * Trip scheduling rules live here so the admin API and (later) the counter API
 * cannot disagree about what a valid trip is.
 */

/** Short unique-looking code: TRP-261110-K3F9. Uniqueness is enforced by an index. */
function generateTripCode(departureAt) {
  const stamp = departureAt.toISOString().slice(2, 10).replace(/-/g, '');
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `TRP-${stamp}-${suffix}`;
}

async function loadReferences({ routeId, busId, driverId }) {
  const [route, bus, driver] = await Promise.all([
    routeId ? Route.findById(routeId) : null,
    busId ? Bus.findById(busId) : null,
    driverId ? Driver.findById(driverId) : null,
  ]);

  const errors = [];
  if (!route) errors.push({ field: 'routeId', message: 'Select an existing route' });
  if (!bus) errors.push({ field: 'busId', message: 'Select an existing bus' });
  if (!driver) errors.push({ field: 'driverId', message: 'Select an existing driver' });
  if (errors.length > 0) throw new ApiError(400, 'Please check the trip details', errors);

  if (bus.status !== BUS_STATUS.ACTIVE) {
    throw new ApiError(400, `Bus ${bus.busNumber} is ${bus.status} and cannot be scheduled`, [
      { field: 'busId', message: 'This bus is not active' },
    ]);
  }
  if (driver.status !== DRIVER_STATUS.ACTIVE) {
    throw new ApiError(400, `${driver.name} is not available for trips`, [
      { field: 'driverId', message: 'This driver is not active' },
    ]);
  }

  return { route, bus, driver };
}

/**
 * Rejects a second trip for the same bus (or driver) starting at the same
 * instant. The unique indexes are the real guarantee; this check exists to give
 * a readable message before the database throws a duplicate-key error.
 */
async function assertNoConflict({ busId, driverId, departureAt, ignoreTripId = null }) {
  const query = { departureAt, status: { $ne: TRIP_STATUS.CANCELLED } };
  if (ignoreTripId) query._id = { $ne: ignoreTripId };

  const [busClash, driverClash] = await Promise.all([
    Trip.findOne({ ...query, busId }),
    Trip.findOne({ ...query, driverId }),
  ]);

  if (busClash) {
    throw new ApiError(409, 'That bus is already scheduled to depart at this time', [
      { field: 'departureTime', message: `Bus already on trip ${busClash.tripCode}` },
    ]);
  }
  if (driverClash) {
    throw new ApiError(409, 'That driver is already assigned to another trip at this time', [
      { field: 'departureTime', message: `Driver already on trip ${driverClash.tripCode}` },
    ]);
  }
}

export async function createTrip(payload, userId) {
  const { route, bus } = await loadReferences(payload);

  const departureAt = dhakaDateTime(payload.departureDate, payload.departureTime);
  if (Number.isNaN(departureAt.getTime())) {
    throw ApiError.badRequest('Departure date or time is not valid');
  }
  await assertNoConflict({
    busId: bus._id,
    driverId: payload.driverId,
    departureAt,
  });

  const arrivalEstimateAt = route.estimatedDurationMinutes
    ? new Date(departureAt.getTime() + route.estimatedDurationMinutes * MINUTE)
    : null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await Trip.create({
        tripCode: generateTripCode(departureAt),
        routeId: route._id,
        busId: bus._id,
        driverId: payload.driverId,
        departureDate: departureAt,
        departureTime: payload.departureTime,
        departureAt,
        arrivalEstimateAt,
        fare: payload.fare,
        boardingPoints: payload.boardingPoints ?? [],
        droppingPoints: payload.droppingPoints ?? [],
        status: payload.status ?? TRIP_STATUS.SCHEDULED,
        seatSummary: { total: bus.totalSeats, booked: 0, held: 0 },
        createdBy: userId ?? null,
      });
    } catch (error) {
      if (error.code === 11000 && error.keyPattern?.tripCode) continue; // rare collision
      if (error.code === 11000) {
        throw new ApiError(409, 'That bus or driver is already scheduled at this time');
      }
      throw error;
    }
  }
  throw new ApiError(500, 'Could not create the trip, please try again');
}

export async function updateTrip(tripId, payload) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw ApiError.notFound('Trip not found');

  if (trip.status === TRIP_STATUS.CANCELLED) {
    throw new ApiError(409, 'A cancelled trip cannot be edited');
  }

  const routeId = payload.routeId ?? trip.routeId;
  const busId = payload.busId ?? trip.busId;
  const driverId = payload.driverId ?? trip.driverId;
  const { route, bus } = await loadReferences({ routeId, busId, driverId });

  const departureTime = payload.departureTime ?? trip.departureTime;
  const departureDate =
    payload.departureDate ?? trip.departureAt.toISOString().slice(0, 10);
  const departureAt = dhakaDateTime(
    String(departureDate).slice(0, 10),
    departureTime,
  );

  await assertNoConflict({ busId, driverId, departureAt, ignoreTripId: trip._id });

  trip.set({
    routeId,
    busId,
    driverId,
    departureDate: departureAt,
    departureTime,
    departureAt,
    arrivalEstimateAt: route.estimatedDurationMinutes
      ? new Date(departureAt.getTime() + route.estimatedDurationMinutes * MINUTE)
      : null,
    fare: payload.fare ?? trip.fare,
    boardingPoints: payload.boardingPoints ?? trip.boardingPoints,
    droppingPoints: payload.droppingPoints ?? trip.droppingPoints,
    status: payload.status ?? trip.status,
    seatSummary: { ...trip.seatSummary, total: bus.totalSeats },
  });

  return trip.save();
}

export async function setTripStatus(tripId, status) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw ApiError.notFound('Trip not found');
  if (trip.status === TRIP_STATUS.CANCELLED && status !== TRIP_STATUS.CANCELLED) {
    throw new ApiError(409, 'A cancelled trip cannot be reopened');
  }
  trip.status = status;
  return trip.save();
}

export async function cancelTrip(tripId, reason) {
  const trip = await Trip.findById(tripId);
  if (!trip) throw ApiError.notFound('Trip not found');
  if (trip.status === TRIP_STATUS.CANCELLED) {
    throw new ApiError(409, 'This trip is already cancelled');
  }
  trip.status = TRIP_STATUS.CANCELLED;
  trip.cancelReason = reason;
  return trip.save();
}

/** Shared populate used by list/detail endpoints so the UI always gets names. */
export const tripPopulate = [
  { path: 'routeId', select: 'code name origin destination estimatedDurationMinutes' },
  { path: 'busId', select: 'busNumber operatorName busType totalSeats' },
  { path: 'driverId', select: 'name phone licenseNumber' },
];
