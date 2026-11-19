import { BOOKABLE_TRIP_STATUS_VALUES } from '../config/constants.js';

/**
 * The public shape of a departure.
 *
 * It lives in its own module because three different areas now need the exact
 * same object: trip search, the seat map, and a ticket (which embeds its trip).
 * One presenter means a ticket can never show different seat counts from search.
 */
export const tripPopulate = [
  {
    path: 'routeId',
    select: 'code name origin destination stops estimatedDurationMinutes',
  },
  {
    path: 'busId',
    select: 'busNumber operatorName busType totalSeats amenities seatLayout',
  },
];

export function toTripSummary(trip) {
  const route = trip.routeId ?? {};
  const bus = trip.busId ?? {};
  const summary = trip.seatSummary ?? {};
  const total = summary.total ?? bus.totalSeats ?? 0;
  const booked = summary.booked ?? 0;
  const held = summary.held ?? 0;

  return {
    id: String(trip._id),
    tripCode: trip.tripCode,
    departureAt: trip.departureAt,
    departureTime: trip.departureTime,
    arrivalEstimateAt: trip.arrivalEstimateAt,
    fare: trip.fare,
    status: trip.status,
    bookable:
      BOOKABLE_TRIP_STATUS_VALUES.includes(trip.status) &&
      new Date(trip.departureAt) > new Date(),
    boardingPoints: trip.boardingPoints ?? [],
    droppingPoints: trip.droppingPoints ?? [],
    route: {
      id: route._id ? String(route._id) : null,
      code: route.code ?? '',
      name: route.name ?? '',
      origin: route.origin ?? null,
      destination: route.destination ?? null,
      estimatedDurationMinutes: route.estimatedDurationMinutes ?? 0,
      stops: route.stops ?? [],
    },
    bus: {
      id: bus._id ? String(bus._id) : null,
      busNumber: bus.busNumber ?? '',
      operatorName: bus.operatorName ?? '',
      busType: bus.busType ?? '',
      totalSeats: bus.totalSeats ?? total,
      amenities: bus.amenities ?? [],
    },
    seats: {
      total,
      booked,
      held,
      available: Math.max(0, total - booked - held),
    },
  };
}
