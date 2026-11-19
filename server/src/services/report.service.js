import Booking from '../models/Booking.js';
import Cancellation from '../models/Cancellation.js';
import { BOOKING_STATUS, PAYMENT_STATUS } from '../config/constants.js';
import { dhakaDateTime, dhakaToday } from '../utils/query.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Sales reports.
 *
 * Every figure is derived from stored bookings, payments and cancellations.
 * Nothing is estimated, projected or padded. Refunds count only when an admin
 * has actually marked them processed — a pending request is reported separately.
 */

const PAID_STATUSES = [
  PAYMENT_STATUS.PAID,
  PAYMENT_STATUS.REFUNDED,
  PAYMENT_STATUS.PARTIALLY_REFUNDED,
];

const SOLD_STATUSES = [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Inclusive Dhaka date range (`to` is treated as the whole day). */
export function parseReportRange({ from, to } = {}) {
  const today = dhakaToday();
  const startDate = from || shiftDate(today, -29);
  const endDate = to || today;

  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
    throw ApiError.badRequest('Use dates in YYYY-MM-DD format');
  }
  if (startDate > endDate) {
    throw ApiError.badRequest('The start date must be on or before the end date');
  }

  return {
    from: startDate,
    to: endDate,
    start: dhakaDateTime(startDate, '00:00'),
    /** Exclusive: midnight at the start of the day after `to`. */
    end: dhakaDateTime(shiftDate(endDate, 1), '00:00'),
  };
}

function money(value) {
  return Math.round((value ?? 0) * 100) / 100;
}

export async function getReportSummary(query) {
  const range = parseReportRange(query);
  const baseMatch = { createdAt: { $gte: range.start, $lt: range.end } };

  const [
    totals,
    byChannel,
    byRoute,
    byCounter,
    daily,
    refunds,
    refundsByStatus,
  ] = await Promise.all([
    Booking.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          bookingsCreated: { $sum: 1 },
          activeTickets: {
            $sum: { $cond: [{ $in: ['$status', SOLD_STATUSES] }, 1, 0] },
          },
          passengers: {
            $sum: { $cond: [{ $in: ['$status', SOLD_STATUSES] }, '$seatCount', 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ['$status', BOOKING_STATUS.CANCELLED] }, 1, 0] },
          },
          collected: {
            $sum: {
              $cond: [{ $in: ['$paymentStatus', PAID_STATUSES] }, '$payableAmount', 0],
            },
          },
          outstanding: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', SOLD_STATUSES] },
                    { $eq: ['$paymentStatus', PAYMENT_STATUS.UNPAID] },
                  ],
                },
                '$payableAmount',
                0,
              ],
            },
          },
        },
      },
    ]),
    Booking.aggregate([
      {
        $match: {
          ...baseMatch,
          status: { $in: SOLD_STATUSES },
        },
      },
      {
        $group: {
          _id: { channel: '$channel', method: '$paymentMethod' },
          count: { $sum: 1 },
          seats: { $sum: '$seatCount' },
          amount: {
            $sum: {
              $cond: [{ $in: ['$paymentStatus', PAID_STATUSES] }, '$payableAmount', 0],
            },
          },
        },
      },
      { $sort: { amount: -1 } },
    ]),
    Booking.aggregate([
      { $match: { ...baseMatch, status: { $in: SOLD_STATUSES } } },
      {
        $group: {
          _id: '$tripId',
          bookings: { $sum: 1 },
          seats: { $sum: '$seatCount' },
          collected: {
            $sum: {
              $cond: [{ $in: ['$paymentStatus', PAID_STATUSES] }, '$payableAmount', 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: 'trips',
          localField: '_id',
          foreignField: '_id',
          as: 'trip',
        },
      },
      { $unwind: '$trip' },
      {
        $lookup: {
          from: 'routes',
          localField: 'trip.routeId',
          foreignField: '_id',
          as: 'route',
        },
      },
      { $unwind: { path: '$route', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            routeId: '$route._id',
            route: { $ifNull: ['$route.name', 'Unknown route'] },
          },
          bookings: { $sum: '$bookings' },
          seats: { $sum: '$seats' },
          collected: { $sum: '$collected' },
        },
      },
      { $sort: { collected: -1, bookings: -1 } },
    ]),
    Booking.aggregate([
      {
        $match: {
          ...baseMatch,
          channel: 'counter',
          status: { $in: SOLD_STATUSES },
        },
      },
      {
        $group: {
          _id: '$bookedBy.counterId',
          bookings: { $sum: 1 },
          seats: { $sum: '$seatCount' },
          collected: {
            $sum: {
              $cond: [{ $in: ['$paymentStatus', PAID_STATUSES] }, '$payableAmount', 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: 'counters',
          localField: '_id',
          foreignField: '_id',
          as: 'counter',
        },
      },
      { $unwind: { path: '$counter', preserveNullAndEmptyArrays: true } },
      { $sort: { collected: -1 } },
    ]),
    Booking.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
              timezone: 'Asia/Dhaka',
            },
          },
          bookings: { $sum: 1 },
          seats: {
            $sum: { $cond: [{ $in: ['$status', SOLD_STATUSES] }, '$seatCount', 0] },
          },
          collected: {
            $sum: {
              $cond: [{ $in: ['$paymentStatus', PAID_STATUSES] }, '$payableAmount', 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Cancellation.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          processedAmount: {
            $sum: {
              $cond: [{ $eq: ['$refundStatus', 'processed'] }, '$refundAmount', 0],
            },
          },
          pendingAmount: {
            $sum: {
              $cond: [{ $in: ['$refundStatus', ['pending', 'approved']] }, '$refundAmount', 0],
            },
          },
        },
      },
    ]),
    Cancellation.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$refundStatus',
          count: { $sum: 1 },
          amount: { $sum: '$refundAmount' },
        },
      },
    ]),
  ]);

  const total = totals[0] ?? {
    bookingsCreated: 0,
    activeTickets: 0,
    passengers: 0,
    cancelled: 0,
    collected: 0,
    outstanding: 0,
  };
  const refundTotals = refunds[0] ?? { processedAmount: 0, pendingAmount: 0 };
  const refundsByStatusView = {
    pending: { count: 0, amount: 0 },
    approved: { count: 0, amount: 0 },
    processed: { count: 0, amount: 0 },
    rejected: { count: 0, amount: 0 },
  };
  for (const row of refundsByStatus) {
    if (refundsByStatusView[row._id]) {
      refundsByStatusView[row._id] = { count: row.count, amount: money(row.amount) };
    }
  }

  return {
    range: { from: range.from, to: range.to },
    summary: {
      bookingsCreated: total.bookingsCreated,
      activeTickets: total.activeTickets,
      passengers: total.passengers,
      cancelled: total.cancelled,
      collected: money(total.collected),
      refunded: money(refundTotals.processedAmount),
      net: money(total.collected - refundTotals.processedAmount),
      outstanding: money(total.outstanding),
      refundsPendingAmount: money(refundTotals.pendingAmount),
    },
    refunds: refundsByStatusView,
    paymentMix: byChannel.map((row) => ({
      channel: row._id.channel,
      method: row._id.method,
      count: row.count,
      seats: row.seats,
      amount: money(row.amount),
    })),
    routes: byRoute.map((row) => ({
      routeId: row._id.routeId ? String(row._id.routeId) : null,
      route: row._id.route,
      bookings: row.bookings,
      seats: row.seats,
      collected: money(row.collected),
    })),
    counters: byCounter.map((row) => ({
      counterId: row._id ? String(row._id) : null,
      counter: row.counter?.name ?? 'Not linked to a counter',
      code: row.counter?.code ?? null,
      bookings: row.bookings,
      seats: row.seats,
      collected: money(row.collected),
    })),
    daily: daily.map((row) => ({
      date: row._id,
      bookings: row.bookings,
      seats: row.seats,
      collected: money(row.collected),
    })),
    generatedAt: new Date().toISOString(),
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values) {
  return values.map(csvCell).join(',');
}

/** Booking-level export for spreadsheets. Capped so one request cannot exhaust memory. */
export async function getBookingsCsv(query) {
  const range = parseReportRange(query);
  const match = { createdAt: { $gte: range.start, $lt: range.end } };

  if (query.status) match.status = query.status;
  if (query.channel) match.channel = query.channel;

  const bookings = await Booking.find(match)
    .sort({ createdAt: -1 })
    .limit(5000)
    .populate({ path: 'tripId', select: 'tripCode departureAt routeId', populate: { path: 'routeId', select: 'name' } })
    .populate('bookedBy.counterId', 'code name')
    .populate('cancellationId', 'refundAmount refundStatus refundMethod')
    .lean();

  const header = [
    'Booking code',
    'Booked at (Dhaka)',
    'Passenger',
    'Phone',
    'Trip code',
    'Route',
    'Departure (Dhaka)',
    'Seats',
    'Seat count',
    'Fare per seat',
    'Payable',
    'Payment method',
    'Payment status',
    'Booking status',
    'Channel',
    'Counter',
    'Refund amount',
    'Refund status',
  ];

  const rows = bookings.map((booking) =>
    csvRow([
      booking.bookingCode,
      new Date(booking.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }),
      booking.passenger?.name,
      booking.passenger?.phone,
      booking.tripId?.tripCode,
      booking.tripId?.routeId?.name,
      booking.tripId?.departureAt
        ? new Date(booking.tripId.departureAt).toLocaleString('en-GB', {
            timeZone: 'Asia/Dhaka',
          })
        : '',
      booking.seats?.map((seat) => seat.seatLabel).join(' '),
      booking.seatCount,
      booking.farePerSeat,
      booking.payableAmount,
      booking.paymentMethod,
      booking.paymentStatus,
      booking.status,
      booking.channel,
      booking.bookedBy?.counterId?.code ?? '',
      booking.cancellationId?.refundAmount ?? '',
      booking.cancellationId?.refundStatus ?? '',
    ]),
  );

  return {
    filename: `busbook-bookings-${range.from}-to-${range.to}.csv`,
    content: `\uFEFF${[csvRow(header), ...rows].join('\r\n')}\r\n`,
    count: bookings.length,
  };
}
