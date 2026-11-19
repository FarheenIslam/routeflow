import Booking from '../models/Booking.js';
import Cancellation from '../models/Cancellation.js';
import Payment from '../models/Payment.js';
import SeatHold from '../models/SeatHold.js';
import SystemSetting from '../models/SystemSetting.js';
import Trip from '../models/Trip.js';
import {
  BOOKING_STATUS,
  HOLD_STATUS,
  PAYMENT_RECORD_STATUS,
  PAYMENT_STATUS,
  REFUND_METHOD,
  REFUND_STATUS,
  ROLES,
} from '../config/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { getBookingSettings, recountTripSeats } from './seat.service.js';
import {
  canViewBooking,
  getBookingViewById,
  normaliseBookingCode,
} from './booking.service.js';
import {
  notifyBookingCancelled,
  notifyRefundProcessed,
} from './notification.service.js';

/**
 * Cancellation policy and refund ledger.
 *
 * Money is only "refunded" on paper. Nothing calls the gateway's refund API,
 * because that requires merchant access this project does not have. The record
 * shows what is owed, who approved it, and the reference of the refund that was
 * actually made outside the system — that is honest tracking, not a fake refund.
 */

const POLICY_DEFAULTS = Object.freeze({
  freeCancelHours: 24,
  halfRefundHours: 2,
  halfRefundPercent: 50,
  noRefundPercent: 0,
});

const STAFF_ROLES = new Set([ROLES.ADMIN, ROLES.COUNTER]);

export async function getCancellationPolicy() {
  const document = await SystemSetting.findOne({ key: 'global' })
    .select('cancellationPolicy')
    .lean();
  return { ...POLICY_DEFAULTS, ...(document?.cancellationPolicy ?? {}) };
}

/**
 * Pure function, so the rule is unit-testable without a database.
 * `amountPaid` is 0 for an unpaid reservation — the percentage still applies to
 * what was actually collected, not to the ticket price.
 */
export function calculateRefund({
  amountPaid,
  tripDepartureAt,
  policy,
  now = new Date(),
}) {
  const departure = new Date(tripDepartureAt).getTime();
  const hoursBeforeDeparture = Number.isFinite(departure)
    ? Math.max(0, Math.round(((departure - now.getTime()) / 3_600_000) * 10) / 10)
    : 0;

  let refundPercent;
  let ruleLabel;

  if (hoursBeforeDeparture >= policy.freeCancelHours) {
    refundPercent = 100;
    ruleLabel = 'full_refund';
  } else if (hoursBeforeDeparture >= policy.halfRefundHours) {
    refundPercent = policy.halfRefundPercent;
    ruleLabel = 'partial_refund';
  } else {
    refundPercent = policy.noRefundPercent;
    ruleLabel = 'no_refund';
  }

  const refundAmount = Math.round((Number(amountPaid) || 0) * refundPercent) / 100;

  return { hoursBeforeDeparture, refundPercent, ruleLabel, refundAmount };
}

async function loadBooking(code) {
  const booking = await Booking.findOne({ bookingCode: normaliseBookingCode(code) })
    .select('+guestSessionId')
    .populate({
      path: 'tripId',
      select: 'tripCode departureAt status routeId busId',
      populate: [{ path: 'routeId', select: 'name origin destination' }],
    });

  if (!booking) throw ApiError.notFound('No ticket found with that number');
  return booking;
}

function assertCanView(booking, viewer) {
  if (!canViewBooking(booking, viewer)) {
    throw ApiError.forbidden('This ticket belongs to another passenger');
  }
}

function isStaff(user) {
  return Boolean(user && STAFF_ROLES.has(user.role));
}

export function cancellationSummary(cancellation) {
  if (!cancellation) return null;
  return {
    id: String(cancellation._id),
    reason: cancellation.reason,
    refundAmount: cancellation.refundAmount,
    refundStatus: cancellation.refundStatus,
    refundMethod: cancellation.refundMethod,
    refundTranId: cancellation.refundTranId,
    refundPercent: cancellation.policyApplied?.refundPercent ?? 0,
    ruleLabel: cancellation.policyApplied?.ruleLabel ?? null,
    processedAt: cancellation.processedAt,
    createdAt: cancellation.createdAt,
  };
}

/**
 * What the ticket page shows before the passenger presses Cancel: whether it is
 * allowed, and exactly what would be refunded under today's policy.
 */
export async function previewCancellation({ code, user, sessionId, phone }) {
  const booking = await loadBooking(code);
  assertCanView(booking, { user, sessionId, phone });

  const [policy, bookingSettings, existing] = await Promise.all([
    getCancellationPolicy(),
    getBookingSettings(),
    Cancellation.findOne({ bookingId: booking._id }).lean(),
  ]);

  const staff = isStaff(user);
  const cancellableStatus = [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED].includes(
    booking.status,
  );
  const departure = booking.tripId?.departureAt;
  const notDeparted = Boolean(departure) && new Date(departure) > new Date();
  const selfCancelAllowed = staff || bookingSettings.passengerSelfCancel;

  let reason = 'allowed';
  if (existing) reason = 'already_cancelled';
  else if (!cancellableStatus) reason = 'not_cancellable';
  else if (!notDeparted) reason = 'departed';
  else if (!selfCancelAllowed) reason = 'self_cancel_disabled';

  const amountPaid =
    booking.paymentStatus === PAYMENT_STATUS.PAID ? booking.payableAmount : 0;
  const refund = calculateRefund({
    amountPaid,
    tripDepartureAt: departure,
    policy,
  });

  return {
    allowed: reason === 'allowed',
    reason,
    paid: amountPaid > 0,
    refund,
    policy,
    existing: cancellationSummary(existing),
  };
}

/**
 * Cancels a booking once, releases its seats, and records the refund that is due.
 * The conditional status update is the concurrency guard: two clicks cannot both
 * succeed, and the unique cancellation index is the second line of defence.
 */
export async function cancelBooking({ code, reason, user, sessionId, phone }) {
  const booking = await loadBooking(code);
  assertCanView(booking, { user, sessionId, phone });

  const staff = isStaff(user);
  const bookingSettings = await getBookingSettings();

  if (!staff && !bookingSettings.passengerSelfCancel) {
    throw ApiError.forbidden(
      'Passenger self-cancellation is turned off. Please contact a counter to cancel this ticket.',
    );
  }
  if (![BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED].includes(booking.status)) {
    throw ApiError.conflict(`This ticket is ${booking.status} and cannot be cancelled`);
  }

  const departure = booking.tripId?.departureAt;
  if (!departure || new Date(departure) <= new Date()) {
    throw ApiError.conflict('This trip has already departed and cannot be cancelled');
  }

  const policy = await getCancellationPolicy();
  const amountPaid =
    booking.paymentStatus === PAYMENT_STATUS.PAID ? booking.payableAmount : 0;
  const refund = calculateRefund({ amountPaid, tripDepartureAt: departure, policy });

  let cancellation;
  try {
    cancellation = await Cancellation.create({
      bookingId: booking._id,
      bookingCode: booking.bookingCode,
      tripId: booking.tripId._id ?? booking.tripId,
      cancelledByUserId: user?._id ?? null,
      cancelledByRole: user?.role ?? 'GUEST',
      reason: String(reason).trim(),
      policyApplied: {
        hoursBeforeDeparture: refund.hoursBeforeDeparture,
        refundPercent: refund.refundPercent,
        ruleLabel: refund.ruleLabel,
      },
      refundAmount: refund.refundAmount,
      // Nothing was collected → nothing to approve.
      refundStatus:
        refund.refundAmount > 0 ? REFUND_STATUS.PENDING : REFUND_STATUS.PROCESSED,
      processedAt: refund.refundAmount > 0 ? null : new Date(),
      notes:
        refund.refundAmount > 0
          ? 'Refund pending admin review'
          : 'No money was collected for this booking',
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw ApiError.conflict('This ticket has already been cancelled');
    }
    throw error;
  }

  const updated = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED] },
    },
    {
      $set: {
        status: BOOKING_STATUS.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: cancellation.reason,
        cancellationId: cancellation._id,
        paymentDeadlineAt: null,
      },
    },
    { new: true },
  );

  if (!updated) {
    await Cancellation.deleteOne({ _id: cancellation._id });
    throw ApiError.conflict('This ticket was just cancelled or paid. Reload it.');
  }

  await SeatHold.deleteMany({
    bookingId: booking._id,
    status: HOLD_STATUS.BOOKED,
  });

  // An open gateway attempt must not be able to pay a cancelled ticket later.
  await Payment.updateMany(
    {
      bookingId: booking._id,
      status: { $in: [PAYMENT_RECORD_STATUS.INITIATED, PAYMENT_RECORD_STATUS.PENDING] },
    },
    {
      $set: {
        status: PAYMENT_RECORD_STATUS.CANCELLED,
        failureReason: 'Booking cancelled before payment completed',
      },
    },
  );

  await recountTripSeats(booking.tripId._id ?? booking.tripId);

  await notifyBookingCancelled({
    booking: updated,
    trip: booking.tripId,
    cancellation,
  });

  return {
    cancellation: cancellationSummary(cancellation),
    booking: await getBookingViewById(updated._id, { includeVerification: true }),
  };
}

const TRANSITIONS = {
  approve: { from: [REFUND_STATUS.PENDING], to: REFUND_STATUS.APPROVED },
  reject: {
    from: [REFUND_STATUS.PENDING, REFUND_STATUS.APPROVED],
    to: REFUND_STATUS.REJECTED,
  },
  process: { from: [REFUND_STATUS.APPROVED], to: REFUND_STATUS.PROCESSED },
};

/**
 * Admin refund workflow. A refund is approved, then processed with the reference
 * of the transfer that was actually made. Rejecting is final.
 */
export async function reviewRefund({
  cancellationId,
  action,
  user,
  refundMethod = null,
  refundTranId = null,
  notes = null,
}) {
  const transition = TRANSITIONS[action];
  if (!transition) throw ApiError.badRequest('Unknown refund action');

  const cancellation = await Cancellation.findOneAndUpdate(
    { _id: cancellationId, refundStatus: { $in: transition.from } },
    {
      $set: {
        refundStatus: transition.to,
        refundMethod:
          refundMethod ??
          (action === 'process' ? REFUND_METHOD.CASH : null) ??
          null,
        refundTranId: refundTranId ?? null,
        processedBy: user?._id ?? null,
        processedAt: new Date(),
        notes: notes ?? null,
      },
    },
    { new: true },
  );

  if (!cancellation) {
    const existing = await Cancellation.findById(cancellationId).lean();
    if (!existing) throw ApiError.notFound('Cancellation not found');
    throw ApiError.conflict(
      `This refund is ${existing.refundStatus} and cannot be moved to ${transition.to}`,
    );
  }

  if (action === 'process' && cancellation.refundAmount > 0) {
    const current = await Booking.findById(cancellation.bookingId);
    const booking = current
      ? await Booking.findByIdAndUpdate(
          cancellation.bookingId,
          {
            $set: {
              paymentStatus:
                cancellation.refundAmount >= current.payableAmount
                  ? PAYMENT_STATUS.REFUNDED
                  : PAYMENT_STATUS.PARTIALLY_REFUNDED,
            },
          },
          { new: true },
        )
      : null;

    if (booking) {
      const trip = await Trip.findById(cancellation.tripId)
        .populate({ path: 'routeId', select: 'name' })
        .lean();
      await notifyRefundProcessed({ booking, trip, cancellation });
    }
  }

  if (action === 'reject') {
    const booking = await Booking.findById(cancellation.bookingId);
    if (booking) {
      const trip = await Trip.findById(cancellation.tripId)
        .populate({ path: 'routeId', select: 'name' })
        .lean();
      await notifyRefundProcessed({ booking, trip, cancellation });
    }
  }

  return cancellationSummary(cancellation);
}

/** Admin list with counts per refund status. */
export async function listCancellations({ page, limit, skip, refundStatus }) {
  const filter = refundStatus ? { refundStatus } : {};

  const [items, total, grouped] = await Promise.all([
    Cancellation.find(filter)
      .populate(
        'bookingId',
        'bookingCode passenger payableAmount paymentStatus seats status',
      )
      .populate('cancelledByUserId', 'name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Cancellation.countDocuments(filter),
    Cancellation.aggregate([{ $group: { _id: '$refundStatus', count: { $sum: 1 } } }]),
  ]);

  const counts = Object.fromEntries(
    Object.values(REFUND_STATUS).map((status) => [status, 0]),
  );
  for (const row of grouped) counts[row._id] = row.count;

  return {
    items: items.map((cancellation) => ({
      ...cancellation,
      cancellationId: String(cancellation._id),
      passenger: cancellation.bookingId?.passenger ?? null,
      bookingCode: cancellation.bookingCode ?? cancellation.bookingId?.bookingCode,
    })),
    counts,
    total,
  };
}

/** Used by the ticket page when the ticket is already cancelled. */
export async function getCancellationForBooking(bookingId) {
  const cancellation = await Cancellation.findOne({ bookingId }).lean();
  return cancellationSummary(cancellation);
}
