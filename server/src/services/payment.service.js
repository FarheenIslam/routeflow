import mongoose from 'mongoose';

import Booking from '../models/Booking.js';
import Payment from '../models/Payment.js';
import Trip from '../models/Trip.js';
import {
  BOOKING_STATUS,
  PAYMENT_METHOD,
  PAYMENT_PROVIDER,
  PAYMENT_RECORD_STATUS,
  PAYMENT_STATUS,
} from '../config/constants.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import {
  normaliseBookingCode,
  confirmBookingPayment,
  canViewBooking,
} from './booking.service.js';
import { notifyBookingConfirmed } from './notification.service.js';
import {
  callbackBase,
  createPaymentSession,
  isOnlinePaymentAvailable,
  isValidationSuccessful,
  sanitiseValidation,
  validatePayment,
} from './sslcommerz.service.js';

/**
 * Online payment lifecycle.
 *
 * `initiate` → gateway page → browser returns → `handleGatewayReturn` calls the
 * validator and only then confirms the ticket. The browser's `status=success`
 * query string is worth nothing on its own, and this file is where that rule is
 * enforced.
 */

const MAX_AMOUNT_DRIFT = 0.01;

function amountMatches(expected, received) {
  const left = Number(expected);
  const right = Number(received);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= MAX_AMOUNT_DRIFT;
}

/**
 * Creates (or reuses) a gateway session for a pending ticket.
 * Reusing the open Payment row matters: refreshing the payment page must not
 * leave a trail of abandoned transactions, and `tran_id` stays stable.
 */
export async function initiatePayment({ code, req, user, sessionId }) {
  if (!(await isOnlinePaymentAvailable())) {
    throw new ApiError(
      503,
      'Online payment is not configured yet. Reserve the ticket and pay at a counter instead.',
    );
  }

  const booking = await Booking.findOne({ bookingCode: normaliseBookingCode(code) })
    .select('+guestSessionId');

  if (!booking) throw ApiError.notFound('No ticket found with that number');
  if (!canViewBooking(booking, { user, sessionId })) {
    throw ApiError.forbidden('This ticket belongs to another passenger');
  }
  if (booking.paymentMethod !== PAYMENT_METHOD.SSLCOMMERZ) {
    throw ApiError.conflict('This ticket is set to pay at a counter');
  }
  if (booking.paymentStatus === PAYMENT_STATUS.PAID) {
    throw ApiError.conflict('This ticket is already paid');
  }
  if (booking.status !== BOOKING_STATUS.PENDING) {
    throw ApiError.conflict(`This ticket is ${booking.status} and cannot be paid`);
  }
  if (booking.paymentDeadlineAt && booking.paymentDeadlineAt <= new Date()) {
    throw ApiError.conflict(
      'The payment window for this ticket has ended. Please choose the seats again.',
    );
  }

  let payment = await Payment.findOne({
    bookingId: booking._id,
    provider: PAYMENT_PROVIDER.SSLCOMMERZ,
    status: { $in: [PAYMENT_RECORD_STATUS.INITIATED, PAYMENT_RECORD_STATUS.PENDING] },
  }).sort({ createdAt: -1 });

  if (!payment) {
    payment = new Payment({
      bookingId: booking._id,
      bookingCode: booking.bookingCode,
      provider: PAYMENT_PROVIDER.SSLCOMMERZ,
      amount: booking.payableAmount,
      currency: 'BDT',
      status: PAYMENT_RECORD_STATUS.INITIATED,
      /** The Payment document id becomes the gateway's `tran_id`. */
      providerTranId: String(new mongoose.Types.ObjectId()),
    });
  }

  const gatewayPageUrl = await createPaymentSession({
    payment,
    booking,
    base: callbackBase(req),
  });

  payment.gatewayPageUrl = gatewayPageUrl;
  payment.status = PAYMENT_RECORD_STATUS.PENDING;
  payment.initiatedAt = payment.initiatedAt ?? new Date();
  await payment.save();

  await Booking.updateOne(
    { _id: booking._id, status: BOOKING_STATUS.PENDING },
    { $set: { paymentStatus: PAYMENT_STATUS.PENDING } },
  );

  return {
    bookingCode: booking.bookingCode,
    gatewayPageUrl,
    sandbox: env.sslcommerz.sandbox,
    amount: booking.payableAmount,
  };
}

async function failPayment(payment, reason, status = PAYMENT_RECORD_STATUS.FAILED) {
  await Payment.updateOne(
    { _id: payment._id, status: { $in: [PAYMENT_RECORD_STATUS.INITIATED, PAYMENT_RECORD_STATUS.PENDING] } },
    { $set: { status, failureReason: reason } },
  );
}

/**
 * Handles the gateway's browser redirect AND its IPN.
 *
 * Returns `{ ok, bookingCode, reason, already }` — the controller decides
 * whether to redirect or answer JSON. It never throws for a gateway problem,
 * because a broken redirect must still land the passenger on a readable page.
 */
export async function handleGatewayReturn({ outcome, payload = {} }) {
  const tranId = payload.tran_id ? String(payload.tran_id) : '';
  const payment = tranId ? await Payment.findOne({ providerTranId: tranId }) : null;

  if (!payment) {
    logger.warn(`Gateway callback for unknown transaction: ${tranId || '(missing)'}`);
    return { ok: false, bookingCode: null, reason: 'unknown_transaction' };
  }

  if (payment.status === PAYMENT_RECORD_STATUS.SUCCESS) {
    return { ok: true, bookingCode: payment.bookingCode, already: true };
  }

  if (outcome === 'cancel') {
    await failPayment(payment, 'Payment cancelled by the passenger', PAYMENT_RECORD_STATUS.CANCELLED);
    return { ok: false, bookingCode: payment.bookingCode, reason: 'cancelled' };
  }

  if (outcome === 'fail') {
    await failPayment(payment, payload.error || 'Payment failed at the gateway');
    return { ok: false, bookingCode: payment.bookingCode, reason: 'failed' };
  }

  // Success (or IPN): nothing counts until the validator says so.
  let validation;
  try {
    validation = await validatePayment(payload.val_id);
  } catch (error) {
    logger.error(`Payment validation failed for ${payment.bookingCode}: ${error.message}`);
    return { ok: false, bookingCode: payment.bookingCode, reason: 'validation_unavailable' };
  }

  const clean = sanitiseValidation(validation);
  const validStatus = isValidationSuccessful(validation);
  const sameTransaction = String(validation?.tran_id ?? '') === payment.providerTranId;
  const sameAmount = amountMatches(payment.amount, validation?.amount);
  const sameCurrency = String(validation?.currency ?? 'BDT').toUpperCase() === 'BDT';

  if (!validStatus || !sameTransaction || !sameAmount || !sameCurrency) {
    const reason = !validStatus
      ? `Gateway status: ${validation?.status ?? 'unknown'}`
      : !sameTransaction
        ? 'Transaction id mismatch'
        : !sameAmount
          ? 'Amount mismatch'
          : 'Currency mismatch';

    logger.warn(`Rejected payment for ${payment.bookingCode}: ${reason}`);
    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: PAYMENT_RECORD_STATUS.FAILED,
          failureReason: reason.slice(0, 300),
          rawValidation: clean,
        },
      },
    );
    return { ok: false, bookingCode: payment.bookingCode, reason: 'invalid' };
  }

  await Payment.updateOne(
    { _id: payment._id },
    {
      $set: {
        status: PAYMENT_RECORD_STATUS.SUCCESS,
        verifiedAt: new Date(),
        valId: validation.val_id ?? null,
        bankTranId: validation.bank_tran_id ?? null,
        cardType: validation.card_type ?? null,
        cardBrand: validation.card_brand ?? null,
        storeAmount: validation.store_amount ? Number(validation.store_amount) : null,
        rawValidation: clean,
        failureReason: null,
      },
    },
  );

  const confirmed = await confirmBookingPayment(payment.bookingId);

  if (!confirmed) {
    const booking = await Booking.findById(payment.bookingId).lean();
    logger.warn(
      `Payment ${payment.providerTranId} succeeded but booking ${payment.bookingCode} is ${booking?.status ?? 'missing'}; refund needs review.`,
    );
    return {
      ok: false,
      bookingCode: payment.bookingCode,
      reason: 'booking_not_pending',
      needsRefund: true,
    };
  }

  const trip = await Trip.findById(confirmed.tripId)
    .populate({ path: 'routeId', select: 'name' })
    .lean();
  await notifyBookingConfirmed({ booking: confirmed, trip });

  return { ok: true, bookingCode: payment.bookingCode };
}

export function clientBaseUrl() {
  return env.clientUrl || 'http://localhost:3000';
}

/** The safe client redirect target after a gateway return. */
export function clientTicketUrl(bookingCode, status) {
  const query = status ? `?payment=${encodeURIComponent(status)}` : '';
  return `${clientBaseUrl()}/booking/${encodeURIComponent(bookingCode)}${query}`;
}
