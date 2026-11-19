import SeatHold from '../models/SeatHold.js';
import SystemSetting from '../models/SystemSetting.js';
import Trip from '../models/Trip.js';
import { BOOKABLE_TRIP_STATUS_VALUES, HOLD_STATUS, TRIP_STATUS } from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';

const MINUTE_MS = 60 * 1000;

/**
 * Seat availability and the temporary seat lock.
 *
 * The rules live here (not in a controller) because three callers need exactly
 * the same answer: the public seat map, the hold endpoint, and — in Phase 6 —
 * the booking service that converts holds into tickets.
 */

const DEFAULT_BOOKING = Object.freeze({
  holdMinutes: 2,
  maxSeatsPerBooking: 6,
  advanceBookingDays: 60,
  passengerSelfCancel: false,
  paymentWindowMinutes: 15,
});

/** Booking limits from settings, with safe defaults when the document is absent. */
export async function getBookingSettings() {
  const settings = await SystemSetting.findOne({ key: 'global' }).lean();
  return { ...DEFAULT_BOOKING, ...(settings?.booking ?? {}) };
}

/** The cancellation policy shown on the seat map; these are the model defaults. */
export async function getCancellationPolicy() {
  const settings = await SystemSetting.findOne({ key: 'global' }).lean();
  return (
    settings?.cancellationPolicy ?? {
      freeCancelHours: 24,
      halfRefundHours: 2,
      halfRefundPercent: 50,
      noRefundPercent: 0,
    }
  );
}

/**
 * Turns a bus layout into real seats.
 *
 * `seatNumber` is the 1-based position in the grid and never changes, so it is
 * the stable identity used by holds. `label` is what a human reads, and it only
 * counts seats that actually exist (a door at position 1 does not make the first
 * passenger sit in "A2").
 */
export function buildSeatLayout(bus) {
  const raw = bus?.seatLayout ?? {};
  const rows = Number(raw.rows) || 10;
  const columns = Number(raw.columns) || 4;
  const seatPrefix = raw.seatPrefix || 'A';
  const capacity = rows * columns;
  const disabled = new Set(
    (raw.disabledSeats ?? [])
      .map(Number)
      .filter((seat) => Number.isInteger(seat) && seat >= 1 && seat <= capacity),
  );

  const seats = [];
  let labelIndex = 0;

  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= columns; column += 1) {
      const number = (row - 1) * columns + column;
      if (disabled.has(number)) continue;
      labelIndex += 1;
      seats.push({ number, label: `${seatPrefix}${labelIndex}`, row, column });
    }
  }

  return {
    layout: {
      rows,
      columns,
      aisleAfterColumn: Number(raw.aisleAfterColumn) || 2,
      seatPrefix,
      disabledSeats: [...disabled].sort((a, b) => a - b),
    },
    seats,
    capacity,
  };
}

/** A trip must exist, be running, and still be in the future to be sold. */
export function assertTripBookable(trip, now = new Date()) {
  if (!trip) throw ApiError.notFound('Trip not found');
  if (trip.status === TRIP_STATUS.CANCELLED) {
    throw new ApiError(409, 'This trip has been cancelled');
  }
  if (!BOOKABLE_TRIP_STATUS_VALUES.includes(trip.status)) {
    throw new ApiError(409, 'Booking is closed for this trip');
  }
  if (trip.departureAt <= now) {
    throw new ApiError(409, 'This trip has already departed');
  }
}

/** Booked, blocked, or still-valid holds. Expired holds are simply ignored. */
function liveHoldFilter(tripId, now = new Date()) {
  return {
    tripId,
    $or: [
      { status: HOLD_STATUS.BOOKED },
      { status: HOLD_STATUS.BLOCKED },
      { status: HOLD_STATUS.HELD, expiresAt: { $gt: now } },
    ],
  };
}

/** Recounts booked/held seats for one trip so search results stay truthful. */
export async function recountTripSeats(tripId) {
  const now = new Date();
  const [trip, booked, held] = await Promise.all([
    Trip.findById(tripId).select('seatSummary').lean(),
    SeatHold.countDocuments({ tripId, status: HOLD_STATUS.BOOKED }),
    SeatHold.countDocuments({
      tripId,
      status: HOLD_STATUS.HELD,
      expiresAt: { $gt: now },
    }),
  ]);

  const total = trip?.seatSummary?.total ?? 0;
  await Trip.updateOne(
    { _id: tripId },
    { $set: { 'seatSummary.booked': booked, 'seatSummary.held': held } },
  );

  return { total, booked, held, available: Math.max(0, total - booked - held) };
}

/**
 * Everything the seat map needs: the layout, every seat with its live status,
 * and the holds this browser already owns (so a refresh does not lose them).
 */
export async function buildSeatView(trip, sessionId) {
  const now = new Date();
  const { layout, seats } = buildSeatLayout(trip.busId);
  const holds = await SeatHold.find(liveHoldFilter(trip._id, now)).lean();
  const holdBySeat = new Map(holds.map((hold) => [hold.seatNumber, hold]));

  const view = seats.map((seat) => {
    const hold = holdBySeat.get(seat.number);
    let status = 'available';

    if (hold) {
      if (hold.status === HOLD_STATUS.BOOKED) status = 'booked';
      else if (hold.status === HOLD_STATUS.BLOCKED) status = 'blocked';
      else status = hold.holderSessionId === sessionId ? 'mine' : 'held';
    }

    return { ...seat, status };
  });

  const mine = view.filter((seat) => seat.status === 'mine');
  const booked = view.filter(
    (seat) => seat.status === 'booked' || seat.status === 'blocked',
  ).length;
  const heldByOthers = view.filter((seat) => seat.status === 'held').length;

  return {
    layout,
    seats: view,
    seatSummary: {
      total: view.length,
      booked,
      held: heldByOthers,
      mine: mine.length,
      available: view.length - booked - heldByOthers - mine.length,
    },
    sessionHold: mine.length > 0 ? { seats: mine.map((seat) => seat.number) } : null,
  };
}

/**
 * Locks a set of seats for one guest session.
 *
 * Atomic per seat: the update only matches a row that is already mine or whose
 * hold has expired. If the seat is taken, the upsert hits the unique index and
 * the database — not our JavaScript — decides the winner.
 */
export async function acquireHolds({ tripId, seatNumbers, sessionId }) {
  const trip = await Trip.findById(tripId).populate('busId', 'seatLayout totalSeats busNumber');
  if (!trip) throw ApiError.notFound('Trip not found');
  assertTripBookable(trip);

  const settings = await getBookingSettings();
  const requested = [...new Set(seatNumbers.map(Number))]
    .filter((seat) => Number.isInteger(seat) && seat > 0)
    .sort((a, b) => a - b);

  if (requested.length === 0) {
    throw new ApiError(400, 'Select at least one seat', [
      { field: 'seatNumbers', message: 'Select at least one seat' },
    ]);
  }
  if (requested.length > settings.maxSeatsPerBooking) {
    throw new ApiError(
      400,
      `You can hold at most ${settings.maxSeatsPerBooking} seats at a time`,
      [
        {
          field: 'seatNumbers',
          message: `Choose up to ${settings.maxSeatsPerBooking} seats`,
        },
      ],
    );
  }

  const { seats } = buildSeatLayout(trip.busId);
  const seatByNumber = new Map(seats.map((seat) => [seat.number, seat]));
  const unknown = requested.filter((number) => !seatByNumber.has(number));
  if (unknown.length > 0) {
    throw new ApiError(400, 'Some of those seats do not exist on this bus', [
      { field: 'seatNumbers', message: `Unknown seat: ${unknown.join(', ')}` },
    ]);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + settings.holdMinutes * MINUTE_MS);

  const existing = await SeatHold.find({
    tripId: trip._id,
    seatNumber: { $in: requested },
  }).lean();

  const myActiveSeats = new Set(
    existing
      .filter(
        (hold) =>
          hold.status === HOLD_STATUS.HELD &&
          hold.holderSessionId === sessionId &&
          hold.expiresAt &&
          hold.expiresAt > now,
      )
      .map((hold) => hold.seatNumber),
  );

  // A hold that already expired is free for anyone, even if the sweeper has not
  // deleted its row yet.
  const isExpired = (hold) =>
    hold.status === HOLD_STATUS.HELD &&
    (!hold.expiresAt || hold.expiresAt <= now);

  const taken = existing.filter(
    (hold) => !myActiveSeats.has(hold.seatNumber) && !isExpired(hold),
  );
  if (taken.length > 0) {
    throw new ApiError(409, 'Some of those seats are no longer available', [
      {
        field: 'seatNumbers',
        message: `Already taken: ${taken
          .map((hold) => hold.seatLabel || hold.seatNumber)
          .join(', ')}`,
      },
    ]);
  }

  const acquired = [];
  try {
    for (const number of requested) {
      const seat = seatByNumber.get(number);
      // Filters: my own live hold, or an expired hold. Anything else must fail.
      const hold = await SeatHold.findOneAndUpdate(
        {
          tripId: trip._id,
          seatNumber: number,
          $or: [
            { status: HOLD_STATUS.HELD, expiresAt: { $lte: now } },
            { status: HOLD_STATUS.HELD, holderSessionId: sessionId },
          ],
        },
        {
          $set: {
            seatLabel: seat.label,
            status: HOLD_STATUS.HELD,
            holderSessionId: sessionId,
            holderUserId: null,
            expiresAt,
          },
          $unset: { bookingId: 1 },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );
      acquired.push(hold);
    }
  } catch (error) {
    // A seat was grabbed between our check and the write: undo only the seats
    // this attempt created, keeping holds the session already had.
    const freshSeats = requested.filter((number) => !myActiveSeats.has(number));
    await SeatHold.deleteMany({
      tripId: trip._id,
      seatNumber: { $in: freshSeats },
      holderSessionId: sessionId,
      status: HOLD_STATUS.HELD,
    }).catch(() => {});
    await recountTripSeats(trip._id).catch(() => {});

    if (error?.code === 11000) {
      throw new ApiError(409, 'Some of those seats were just taken. Please pick again.');
    }
    throw error;
  }

  const seatSummary = await recountTripSeats(trip._id);

  return {
    tripId: String(trip._id),
    seats: acquired.map((hold) => ({
      holdId: String(hold._id),
      seatNumber: hold.seatNumber,
      label: hold.seatLabel,
    })),
    holdMinutes: settings.holdMinutes,
    expiresAt,
    seatSummary,
  };
}

/** Frees a single hold. Only the session that created it may release it. */
export async function releaseHold({ holdId, sessionId }) {
  const hold = await SeatHold.findById(holdId);
  if (!hold) throw ApiError.notFound('Seat hold not found');

  if (hold.status !== HOLD_STATUS.HELD) {
    throw new ApiError(409, 'This seat is already booked, not held');
  }
  if (hold.holderSessionId !== sessionId) {
    throw ApiError.forbidden('This seat hold belongs to another session');
  }

  const tripId = hold.tripId;
  await SeatHold.deleteOne({ _id: hold._id, holderSessionId: sessionId });

  return { tripId: String(tripId), seatSummary: await recountTripSeats(tripId) };
}

/** Our own "release everything on this trip" path (used when a page is left). */
export async function releaseSessionSeats({ tripId, sessionId }) {
  const result = await SeatHold.deleteMany({
    tripId,
    holderSessionId: sessionId,
    status: HOLD_STATUS.HELD,
  });

  return {
    released: result.deletedCount,
    seatSummary: await recountTripSeats(tripId),
  };
}

/**
 * The sweeper: removes expired holds and recounts the affected trips.
 * Run every 30 seconds from server.js. It is safe to run at any time — expired
 * holds are already invisible to availability queries, this just cleans up.
 */
export async function sweepExpiredHolds(now = new Date()) {
  const expired = await SeatHold.find({
    status: HOLD_STATUS.HELD,
    expiresAt: { $lte: now },
  })
    .select('_id tripId')
    .lean();

  if (expired.length === 0) return { removed: 0, trips: 0 };

  const result = await SeatHold.deleteMany({
    _id: { $in: expired.map((hold) => hold._id) },
    status: HOLD_STATUS.HELD,
  });

  const tripIds = [...new Set(expired.map((hold) => String(hold.tripId)))];
  await Promise.all(tripIds.map((tripId) => recountTripSeats(tripId)));

  return { removed: result.deletedCount, trips: tripIds.length };
}
