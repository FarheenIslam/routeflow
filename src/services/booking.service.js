import crypto from 'node:crypto';
import mongoose from 'mongoose';

import Booking from '../models/Booking.js';
import Counter from '../models/Counter.js';
import Payment from '../models/Payment.js';
import SeatHold from '../models/SeatHold.js';
import Trip from '../models/Trip.js';
import {
  BOOKING_CHANNEL,
  BOOKING_STATUS,
  HOLD_STATUS,
  PAYMENT_METHOD,
  PAYMENT_PROVIDER,
  PAYMENT_RECORD_STATUS,
  PAYMENT_STATUS,
  ROLES,
} from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import {
  assertTripBookable,
  buildSeatLayout,
  getBookingSettings,
  recountTripSeats,
} from './seat.service.js';
import { isOnlinePaymentAvailable } from './sslcommerz.service.js';
import { notifyBookingConfirmed } from './notification.service.js';
import { toTripSummary, tripPopulate } from './tripView.js';

/**
 * Booking service — turning held seats into a sold ticket.
 *
 * The one rule that must never bend: a seat is only converted when the
 * database's conditional update agrees. The unique index on SeatHold decides
 * who owns a seat; this file only asks it to change status, and the returned
 * `modifiedCount` decides whether the booking survives.
 */

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 6;

/** BB-7K2M9Q — no 0/O/1/I, so a phone call cannot lose the ticket. */
function randomCode() {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return `BB-${code}`;
}

async function nextBookingCode() {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = randomCode();
    // eslint-disable-next-line no-await-in-loop
    if (!(await Booking.exists({ bookingCode: code }))) return code;
  }
  // Six random characters from a 32-letter alphabet: this is practically
  // impossible. If it happens, failing loudly beats issuing a duplicate ticket.
  throw ApiError.internal('Could not allocate a ticket number. Please try again.');
}

function verificationCode() {
  return String(crypto.randomInt(100_000, 1_000_000));
}

/** Ticket numbers are typed by humans: accept any case and stray spaces. */
export function normaliseBookingCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function normalisePhone(value) {
  return String(value ?? '').replace(/[^\d]/g, '');
}

function seatNumbersFromRequest(seatNumbers) {
  return [...new Set((seatNumbers ?? []).map(Number))]
    .filter((number) => Number.isInteger(number) && number > 0)
    .sort((a, b) => a - b);
}

function requirePassenger(passenger) {
  if (!passenger?.name || !passenger?.phone) {
    throw ApiError.badRequest('Passenger name and phone are required', [
      { field: 'passenger.name', message: 'Enter the passenger name' },
      { field: 'passenger.phone', message: 'Enter a mobile number' },
    ]);
  }
  return {
    name: String(passenger.name).trim(),
    phone: normalisePhone(passenger.phone),
    email: passenger.email ? String(passenger.email).trim().toLowerCase() : null,
    gender: passenger.gender ?? null,
    age: passenger.age === '' || passenger.age === undefined ? null : Number(passenger.age),
    nid: passenger.nid ? String(passenger.nid).trim() : null,
  };
}

/** The staff member's counter, if they are attached to one. */
export async function resolveStaffCounter(user) {
  if (!user?._id) return null;
  return Counter.findOne({
    status: 'active',
    $or: [{ staffUserIds: user._id }, { managerUserId: user._id }],
  })
    .select('code name branchName')
    .lean();
}

/**
 * Creates a booking and converts the seats in one guarded sequence.
 *
 * Order matters: seats are claimed first, then the ticket document is inserted.
 * If the insert fails we delete the seat rows we just claimed, so a failed sale
 * can never leave a seat marked sold with no ticket behind it.
 */
export async function createBooking({
  tripId,
  seatNumbers,
  passenger,
  paymentMethod,
  channel = BOOKING_CHANNEL.ONLINE,
  sessionId = null,
  user = null,
  counterId = null,
}) {
  const settings = await getBookingSettings();
  const trip = await Trip.findById(tripId).populate(tripPopulate);
  if (!trip) throw ApiError.notFound('Trip not found');
  assertTripBookable(trip);

  const seats = seatNumbersFromRequest(seatNumbers);
  if (seats.length === 0) {
    throw ApiError.badRequest('Select at least one seat', [
      { field: 'seatNumbers', message: 'Select at least one seat' },
    ]);
  }
  if (seats.length > settings.maxSeatsPerBooking) {
    throw ApiError.badRequest(
      `You can book at most ${settings.maxSeatsPerBooking} seats at a time`,
      [{ field: 'seatNumbers', message: `Choose up to ${settings.maxSeatsPerBooking} seats` }],
    );
  }

  const { seats: layoutSeats } = buildSeatLayout(trip.busId);
  const labelByNumber = new Map(layoutSeats.map((seat) => [seat.number, seat.label]));
  const unknown = seats.filter((number) => !labelByNumber.has(number));
  if (unknown.length > 0) {
    throw ApiError.badRequest('Some of those seats do not exist on this bus', [
      { field: 'seatNumbers', message: `Unknown seat: ${unknown.join(', ')}` },
    ]);
  }

  const cleanPassenger = requirePassenger(passenger);
  const isCounter = channel === BOOKING_CHANNEL.COUNTER;

  if (paymentMethod === PAYMENT_METHOD.SSLCOMMERZ) {
    if (isCounter) {
      throw ApiError.badRequest('Counter sales are recorded as cash', [
        { field: 'paymentMethod', message: 'Counter sales must use cash' },
      ]);
    }
    if (!(await isOnlinePaymentAvailable())) {
      throw new ApiError(
        409,
        'Online payment is not available right now. Choose "pay at counter" to reserve the seats instead.',
        [{ field: 'paymentMethod', message: 'Online payment is not available' }],
      );
    }
  }

  if (!isCounter && !sessionId) {
    throw ApiError.conflict(
      'Your seat hold has expired. Please choose the seats again.',
    );
  }

  const now = new Date();
  const fare = Number(trip.fare);
  const totalAmount = fare * seats.length;
  const bookingId = new mongoose.Types.ObjectId();
  const paymentDeadlineAt =
    paymentMethod === PAYMENT_METHOD.SSLCOMMERZ
      ? new Date(now.getTime() + settings.paymentWindowMinutes * 60 * 1000)
      : null;

  let holdIds = [];

  if (!isCounter) {
    // --- Online: convert the holds this browser already owns ---------------
    const holds = await SeatHold.find({ tripId: trip._id, seatNumber: { $in: seats } }).lean();
    const bySeat = new Map(holds.map((hold) => [hold.seatNumber, hold]));

    const usable = seats.every((number) => {
      const hold = bySeat.get(number);
      return (
        hold &&
        hold.status === HOLD_STATUS.HELD &&
        hold.holderSessionId === sessionId &&
        hold.expiresAt &&
        hold.expiresAt > now
      );
    });

    if (!usable) {
      throw ApiError.conflict(
        'Your seat hold has expired. Please choose the seats again and continue quickly.',
      );
    }

    holdIds = seats.map((number) => bySeat.get(number)._id);

    const flipped = await SeatHold.updateMany(
      {
        _id: { $in: holdIds },
        holderSessionId: sessionId,
        status: HOLD_STATUS.HELD,
        expiresAt: { $gt: now },
      },
      {
        $set: { status: HOLD_STATUS.BOOKED, bookingId },
        $unset: { expiresAt: 1 },
      },
    );

    if (flipped.modifiedCount !== seats.length) {
      await releaseClaimedSeats(bookingId);
      throw ApiError.conflict(
        'Those seats were just taken. Please choose again.',
      );
    }
  } else {
    // --- Counter: no hold exists; claim the seats atomically ---------------
    const claimed = [];
    try {
      for (const number of seats) {
        const hold = await SeatHold.findOneAndUpdate(
          {
            tripId: trip._id,
            seatNumber: number,
            // Only a free seat or a dead hold may be overwritten. A live hold
            // (online passenger thinking) or a sold seat is left alone.
            $or: [
              { status: HOLD_STATUS.HELD, expiresAt: { $lte: now } },
              { status: HOLD_STATUS.HELD, expiresAt: null },
            ],
          },
          {
            $set: {
              seatLabel: labelByNumber.get(number),
              status: HOLD_STATUS.BOOKED,
              bookingId,
              holderSessionId: null,
              holderUserId: user?._id ?? null,
            },
            $unset: { expiresAt: 1 },
          },
          { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
        );
        claimed.push(hold._id);
      }
    } catch (error) {
      await releaseClaimedSeats(bookingId);
      await recountTripSeats(trip._id).catch(() => {});
      if (error?.code === 11000) {
        throw ApiError.conflict(
          'One or more of those seats is held or sold. Refresh the seat map and try again.',
        );
      }
      throw error;
    }
    holdIds = claimed;
  }

  const isPaidCash = isCounter;
  const bookingCode = await nextBookingCode();

  let booking;
  try {
    booking = await Booking.create({
      _id: bookingId,
      bookingCode,
      tripId: trip._id,
      passengerUserId:
        user?.role === ROLES.PASSENGER ? user._id : null,
      passenger: cleanPassenger,
      seats: seats.map((number) => ({
        seatNumber: number,
        seatLabel: labelByNumber.get(number),
      })),
      seatCount: seats.length,
      farePerSeat: fare,
      totalAmount,
      discount: 0,
      payableAmount: totalAmount,
      paymentMethod,
      paymentStatus: isPaidCash ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.UNPAID,
      status: isPaidCash ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING,
      channel,
      bookedBy: {
        userId: user?._id ?? null,
        role: user?.role ?? null,
        counterId: counterId ?? null,
      },
      holdIds,
      guestSessionId: isCounter ? null : sessionId,
      verificationCode: verificationCode(),
      paymentDeadlineAt,
    });
  } catch (error) {
    await releaseClaimedSeats(bookingId);
    await recountTripSeats(trip._id).catch(() => {});
    throw error;
  }

  if (isPaidCash) {
    await Payment.create({
      bookingId: booking._id,
      bookingCode: booking.bookingCode,
      provider: PAYMENT_PROVIDER.CASH,
      method: 'cash',
      amount: booking.payableAmount,
      currency: 'BDT',
      status: PAYMENT_RECORD_STATUS.SUCCESS,
      providerTranId: `CASH-${booking.bookingCode}`,
      initiatedAt: now,
      verifiedAt: now,
      receivedByUserId: user?._id ?? null,
      counterId: counterId ?? null,
    });
  }

  await recountTripSeats(trip._id);

  if (isPaidCash) {
    await notifyBookingConfirmed({ booking, trip });
  }

  return { booking, trip };
}

/** Removes only the seat rows this attempt claimed (identified by bookingId). */
async function releaseClaimedSeats(bookingId) {
  await SeatHold.deleteMany({
    bookingId,
    status: { $in: [HOLD_STATUS.BOOKED] },
  }).catch(() => {});
}

/**
 * The public ticket shape. `verificationCode` is only added for people allowed
 * to hold the ticket (the buyer, staff), never for a random visitor.
 */
export function toBookingView(booking, { includeVerification = false } = {}) {
  const trip = booking.tripId && booking.tripId._id ? toTripSummary(booking.tripId) : undefined;
  const due =
    booking.paymentStatus !== PAYMENT_STATUS.PAID &&
    booking.paymentStatus !== PAYMENT_STATUS.REFUNDED &&
    booking.status !== BOOKING_STATUS.CANCELLED &&
    booking.status !== BOOKING_STATUS.EXPIRED;

  return {
    id: String(booking._id),
    code: booking.bookingCode,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    paymentMethod: booking.paymentMethod,
    channel: booking.channel,
    passenger: {
      name: booking.passenger.name,
      phone: booking.passenger.phone,
      email: booking.passenger.email ?? null,
      gender: booking.passenger.gender ?? null,
      age: booking.passenger.age ?? null,
    },
    seats: booking.seats.map((seat) => ({
      number: seat.seatNumber,
      label: seat.seatLabel,
    })),
    seatCount: booking.seatCount,
    farePerSeat: booking.farePerSeat,
    totalAmount: booking.totalAmount,
    discount: booking.discount,
    payableAmount: booking.payableAmount,
    amountDue: due ? booking.payableAmount : 0,
    paid: booking.paymentStatus === PAYMENT_STATUS.PAID,
    canPayAtCounter: due && booking.status === BOOKING_STATUS.PENDING,
    paymentDeadlineAt: booking.paymentDeadlineAt ?? null,
    bookedAt: booking.createdAt,
    cancelledAt: booking.cancelledAt ?? null,
    cancelReason: booking.cancelReason ?? null,
    verificationCode: includeVerification ? booking.verificationCode : undefined,
    trip,
  };
}

/**
 * A booking stores a trip id, so the trip's route and bus are populated *inside*
 * that reference. (Spreading `tripPopulate` here would try to add `routeId` to
 * the Booking schema, which does not have one.)
 */
const bookingPopulate = [
  { path: 'tripId', populate: tripPopulate },
  { path: 'passengerUserId', select: 'name email phone' },
];

/** Reloads a booking with its trip and returns exactly what the API sends. */
export async function getBookingViewById(id, options = {}) {
  const booking = await Booking.findById(id).populate(bookingPopulate);
  if (!booking) throw ApiError.notFound('Booking not found');
  return toBookingView(booking, options);
}

async function findBookingByCode(code) {
  const booking = await Booking.findOne({ bookingCode: normaliseBookingCode(code) })
    .select('+guestSessionId')
    .populate(bookingPopulate);

  if (!booking) throw ApiError.notFound('No ticket found with that number');
  return booking;
}

const STAFF_ROLES = new Set([ROLES.ADMIN, ROLES.COUNTER]);

/** Who may open a ticket: its buyer, staff, or someone who knows the phone. */
export function canViewBooking(booking, { user, sessionId, phone } = {}) {
  if (!booking) return false;
  if (user && STAFF_ROLES.has(user.role)) return true;

  if (user && booking.passengerUserId) {
    const ownerId = booking.passengerUserId._id ?? booking.passengerUserId;
    if (String(ownerId) === String(user._id)) return true;
  }
  if (user?.phone && normalisePhone(user.phone) === booking.passenger.phone) return true;
  if (phone && normalisePhone(phone) === booking.passenger.phone) return true;
  if (sessionId && booking.guestSessionId && booking.guestSessionId === sessionId) {
    return true;
  }
  return false;
}

export async function getBookingForViewer({ code, user, sessionId, phone }) {
  const booking = await findBookingByCode(code);
  if (!canViewBooking(booking, { user, sessionId, phone })) {
    throw ApiError.forbidden(
      'This ticket belongs to another passenger. Enter the ticket number and the passenger phone to open it.',
    );
  }
  return toBookingView(booking, { includeVerification: true });
}

/**
 * Ticket lookup without an account: the ticket number AND the phone used at
 * booking. Both must match, and a miss is a 404 so a wrong guess learns nothing.
 */
export async function lookupBooking({ code, phone }) {
  const booking = await Booking.findOne({ bookingCode: normaliseBookingCode(code) })
    .populate(bookingPopulate);

  if (!booking || normalisePhone(phone) !== booking.passenger.phone) {
    throw ApiError.notFound('No ticket matches that number and phone');
  }
  const view = toBookingView(booking, { includeVerification: true });
  return view;
}

export async function listBookingsForPassenger(user) {
  const bookings = await Booking.find({
    $or: [{ passengerUserId: user._id }, { 'passenger.phone': normalisePhone(user.phone) }],
  })
    .populate(bookingPopulate)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return bookings.map((booking) => toBookingView(booking, { includeVerification: true }));
}

/** Counter search: ticket number, passenger phone, or passenger name. */
export async function searchBookings({ query, limit = 20 }) {
  const term = String(query ?? '').trim();
  if (!term) return [];

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'i');
  const digits = normalisePhone(term);

  const filters = [{ bookingCode: regex }, { 'passenger.name': regex }, { 'passenger.phone': regex }];
  if (digits.length >= 4) filters.push({ 'passenger.phone': new RegExp(`^${digits}`) });

  const bookings = await Booking.find({ $or: filters })
    .populate(bookingPopulate)
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 50))
    .lean();

  return bookings.map((booking) => toBookingView(booking, { includeVerification: true }));
}

/**
 * Staff takes cash for an unpaid reservation.
 * The conditional update is what makes a double click harmless: only one request
 * can move `unpaid → paid`.
 */
export async function collectCashPayment({ code, user, counterId = null }) {
  const booking = await findBookingByCode(code);

  if (booking.paymentStatus === PAYMENT_STATUS.PAID) {
    throw ApiError.conflict('This ticket is already paid');
  }
  if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED].includes(booking.status)) {
    throw ApiError.conflict(`This ticket is ${booking.status} and cannot be paid`);
  }

  const now = new Date();
  const updated = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      paymentStatus: { $in: [PAYMENT_STATUS.UNPAID, PAYMENT_STATUS.PENDING] },
      status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED] },
    },
    {
      $set: {
        paymentStatus: PAYMENT_STATUS.PAID,
        status: BOOKING_STATUS.CONFIRMED,
        paymentDeadlineAt: null,
      },
    },
    { new: true },
  );

  if (!updated) {
    throw ApiError.conflict('This ticket was just paid or cancelled. Reload it.');
  }

  await Payment.create({
    bookingId: updated._id,
    bookingCode: updated.bookingCode,
    provider: PAYMENT_PROVIDER.CASH,
    method: 'cash',
    amount: updated.payableAmount,
    currency: 'BDT',
    status: PAYMENT_RECORD_STATUS.SUCCESS,
    providerTranId: `CASH-${updated.bookingCode}`,
    initiatedAt: now,
    verifiedAt: now,
    receivedByUserId: user?._id ?? null,
    counterId,
  });

  const fresh = await Booking.findById(updated._id).populate(bookingPopulate).lean();
  const trip = await Trip.findById(updated.tripId)
    .populate({ path: 'routeId', select: 'name' })
    .lean();
  await notifyBookingConfirmed({ booking: fresh, trip });

  return toBookingView(fresh, { includeVerification: true });
}

/**
 * Called by the payment service after the gateway has verified the money.
 * Only a `pending` booking can be confirmed; a paid-through-after-expiry booking
 * is reported back to the caller instead of silently re-selling a released seat.
 */
export async function confirmBookingPayment(bookingId) {
  const booking = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED] },
      paymentStatus: { $ne: PAYMENT_STATUS.PAID },
    },
    {
      $set: {
        paymentStatus: PAYMENT_STATUS.PAID,
        status: BOOKING_STATUS.CONFIRMED,
        paymentDeadlineAt: null,
      },
    },
    { new: true },
  );

  return booking;
}

/** Holdings/tickets already paid are never expired. */
export async function expireStaleBookings(now = new Date()) {
  const stale = await Booking.find({
    status: BOOKING_STATUS.PENDING,
    paymentDeadlineAt: { $ne: null, $lte: now },
  })
    .select('_id tripId')
    .lean();

  if (stale.length === 0) return { expired: 0, trips: 0, released: 0 };

  let expired = 0;
  let released = 0;
  const tripIds = new Set();

  for (const booking of stale) {
    // eslint-disable-next-line no-await-in-loop
    const result = await Booking.updateOne(
      { _id: booking._id, status: BOOKING_STATUS.PENDING },
      { $set: { status: BOOKING_STATUS.EXPIRED } },
    );
    if (result.modifiedCount === 0) continue;

    expired += 1;
    tripIds.add(String(booking.tripId));

    // eslint-disable-next-line no-await-in-loop
    const seats = await SeatHold.deleteMany({
      bookingId: booking._id,
      status: HOLD_STATUS.BOOKED,
    });
    released += seats.deletedCount;

    // eslint-disable-next-line no-await-in-loop
    await Payment.updateMany(
      {
        bookingId: booking._id,
        status: { $in: [PAYMENT_RECORD_STATUS.INITIATED, PAYMENT_RECORD_STATUS.PENDING] },
      },
      {
        $set: {
          status: PAYMENT_RECORD_STATUS.FAILED,
          failureReason: 'Payment window expired',
        },
      },
    );
  }

  await Promise.all([...tripIds].map((tripId) => recountTripSeats(tripId)));

  return { expired, trips: tripIds.size, released };
}
