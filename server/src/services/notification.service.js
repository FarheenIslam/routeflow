import Notification from '../models/Notification.js';
import SystemSetting from '../models/SystemSetting.js';
import {
  NOTIFICATION_CHANNEL,
  NOTIFICATION_STATUS,
  NOTIFICATION_TEMPLATE,
  REFUND_STATUS,
} from '../config/constants.js';
import { logger } from '../config/logger.js';
import { sendEmail } from '../integrations/mailer.js';
import { sendSms } from '../integrations/sms.js';

/**
 * Notification log and delivery.
 *
 * Every message is recorded before anything is attempted. In mock mode (the
 * default) the row is `skipped` with a reason, so the database never claims an
 * email or SMS was delivered when it was not. Turning mock mode off still
 * requires a provider key; without one the row becomes `failed`, not `sent`.
 */

const DEFAULTS = Object.freeze({
  emailEnabled: true,
  smsEnabled: false,
  mockMode: true,
});

export async function getNotificationSettings() {
  const document = await SystemSetting.findOne({ key: 'global' })
    .select('notifications')
    .lean();
  return { ...DEFAULTS, ...(document?.notifications ?? {}) };
}

function money(amount) {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

function when(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function routeName(trip) {
  return trip?.routeId?.name ?? 'your journey';
}

/**
 * Writes the audit row, then attempts delivery according to settings.
 * Never throws: a notification failure must not break a booking or a refund.
 */
export async function queueNotification({
  channel,
  template,
  to,
  subject = null,
  body = null,
  userId = null,
  bookingId = null,
  meta = null,
}) {
  if (!to) return null;

  const settings = await getNotificationSettings();
  const record = await Notification.create({
    channel,
    template,
    to,
    subject,
    body,
    userId,
    bookingId,
    status: NOTIFICATION_STATUS.QUEUED,
    provider: 'mock',
    meta,
  });

  let outcome;
  const enabled =
    channel === NOTIFICATION_CHANNEL.EMAIL
      ? settings.emailEnabled
      : channel === NOTIFICATION_CHANNEL.SMS
        ? settings.smsEnabled
        : true;

  if (!enabled) {
    outcome = {
      status: NOTIFICATION_STATUS.SKIPPED,
      provider: 'mock',
      error: `${channel} notifications are disabled in settings`,
    };
  } else if (settings.mockMode) {
    outcome = {
      status: NOTIFICATION_STATUS.SKIPPED,
      provider: 'mock',
      error: 'Mock mode: nothing was sent',
    };
  } else if (channel === NOTIFICATION_CHANNEL.EMAIL) {
    const delivery = await sendEmail({ to, subject, text: body, html: body });
    outcome = delivery.delivered
      ? {
          status: NOTIFICATION_STATUS.SENT,
          provider: delivery.mode,
          providerMessageId: delivery.id ?? null,
          error: null,
        }
      : {
          status:
            delivery.mode === 'mock'
              ? NOTIFICATION_STATUS.SKIPPED
              : NOTIFICATION_STATUS.FAILED,
          provider: delivery.mode,
          error:
            delivery.mode === 'mock'
              ? 'No email provider configured'
              : 'The email provider rejected the message',
        };
  } else if (channel === NOTIFICATION_CHANNEL.SMS) {
    const delivery = await sendSms({ to, text: body });
    outcome = delivery.delivered
      ? {
          status: NOTIFICATION_STATUS.SENT,
          provider: delivery.mode,
          providerMessageId: delivery.id ?? null,
          error: null,
        }
      : {
          status:
            delivery.mode === 'mock'
              ? NOTIFICATION_STATUS.SKIPPED
              : NOTIFICATION_STATUS.FAILED,
          provider: delivery.mode,
          error:
            delivery.mode === 'mock'
              ? 'No SMS provider configured'
              : 'The SMS provider rejected the message',
        };
  } else {
    outcome = { status: NOTIFICATION_STATUS.SENT, provider: 'in_app', error: null };
  }

  await Notification.updateOne(
    { _id: record._id },
    {
      $set: {
        status: outcome.status,
        provider: outcome.provider,
        providerMessageId: outcome.providerMessageId ?? null,
        error: outcome.error ?? null,
      },
    },
  );

  return record._id;
}

async function sendBoth({ booking, trip, subject, body, template }) {
  const common = {
    template,
    subject,
    body,
    userId: booking.passengerUserId ?? null,
    bookingId: booking._id,
  };

  const work = [];
  if (booking.passenger?.email) {
    work.push(
      queueNotification({ ...common, channel: NOTIFICATION_CHANNEL.EMAIL, to: booking.passenger.email }),
    );
  }
  if (booking.passenger?.phone) {
    work.push(
      queueNotification({ ...common, channel: NOTIFICATION_CHANNEL.SMS, to: booking.passenger.phone }),
    );
  }
  if (work.length === 0) return [];

  try {
    return await Promise.all(work);
  } catch (error) {
    logger.error(`Notification queue failed for ${booking.bookingCode}: ${error.message}`);
    return [];
  }
}

function bookingLines(booking, trip) {
  return [
    `Ticket: ${booking.bookingCode}`,
    `Journey: ${routeName(trip)} — ${when(trip?.departureAt)}`,
    `Seats: ${booking.seats.map((seat) => seat.seatLabel).join(', ')}`,
    `Passenger: ${booking.passenger.name}`,
    `Total: ${money(booking.payableAmount)}`,
  ];
}

export async function notifyBookingConfirmed({ booking, trip }) {
  try {
    const lines = [
      ...bookingLines(booking, trip),
      '',
      'Your seat is confirmed. Show the ticket number and verification code at boarding.',
    ];
    return await sendBoth({
      booking,
      trip,
      template: NOTIFICATION_TEMPLATE.BOOKING_CONFIRMED,
      subject: `BusBook ticket ${booking.bookingCode} confirmed`,
      body: lines.join('\n'),
    });
  } catch (error) {
    logger.error(`Ticket notification failed: ${error.message}`);
    return [];
  }
}

export async function notifyBookingCancelled({ booking, trip, cancellation }) {
  try {
    const lines = [
      ...bookingLines(booking, trip),
      '',
      `Cancellation reason: ${cancellation.reason}`,
    ];

    if (cancellation.refundAmount > 0) {
      lines.push(
        `Refund due: ${money(cancellation.refundAmount)} (${cancellation.refundStatus}). No automatic gateway refund is issued; a counter or admin will process it.`,
      );
    } else {
      lines.push('No refund is due under the cancellation policy for this booking.');
    }

    return await sendBoth({
      booking,
      trip,
      template: NOTIFICATION_TEMPLATE.BOOKING_CANCELLED,
      subject: `BusBook ticket ${booking.bookingCode} cancelled`,
      body: lines.join('\n'),
    });
  } catch (error) {
    logger.error(`Cancellation notification failed: ${error.message}`);
    return [];
  }
}

export async function notifyRefundProcessed({ booking, trip, cancellation }) {
  try {
    const lines = [
      `Ticket: ${booking.bookingCode}`,
      `Refund processed: ${money(cancellation.refundAmount)}`,
      cancellation.refundTranId ? `Reference: ${cancellation.refundTranId}` : '',
      cancellation.refundMethod ? `Method: ${cancellation.refundMethod}` : '',
      '',
      `Status: ${cancellation.refundStatus.toUpperCase()}`,
    ].filter(Boolean);

    return await sendBoth({
      booking,
      trip,
      template: NOTIFICATION_TEMPLATE.REFUND_PROCESSED,
      subject: `BusBook refund for ${booking.bookingCode}`,
      body:
        cancellation.refundStatus === REFUND_STATUS.REJECTED
          ? `${lines.join('\n')}\nThe refund request was rejected. Please contact the counter for details.`
          : lines.join('\n'),
    });
  } catch (error) {
    logger.error(`Refund notification failed: ${error.message}`);
    return [];
  }
}
