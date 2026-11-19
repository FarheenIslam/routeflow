/**
 * Shared enums.
 * Keeping them in one file means the model, the validators and the role checks
 * can never drift apart. If you rename a value here, every layer follows.
 */

export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  COUNTER: 'COUNTER',
  DRIVER: 'DRIVER',
  PASSENGER: 'PASSENGER',
});

export const ROLE_VALUES = Object.freeze(Object.values(ROLES));

export const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  PENDING: 'pending',
});

export const USER_STATUS_VALUES = Object.freeze(Object.values(USER_STATUS));

/** bcrypt cost factor. 12 is a good balance of safety and login speed in 2026. */
export const BCRYPT_ROUNDS = 12;

/** Bangladesh mobile number: 11 digits starting 013–019. */
export const BD_PHONE_PATTERN = /^01[3-9]\d{8}$/;

// --- Fleet & operations ----------------------------------------------------

export const BUS_TYPES = Object.freeze({
  AC: 'AC',
  NON_AC: 'NON_AC',
  AC_SLEEPER: 'AC_SLEEPER',
  DOUBLE_DECKER: 'DOUBLE_DECKER',
  HIACE: 'HIACE',
});

export const BUS_TYPE_VALUES = Object.freeze(Object.values(BUS_TYPES));

export const BUS_STATUS = Object.freeze({
  ACTIVE: 'active',
  MAINTENANCE: 'maintenance',
  INACTIVE: 'inactive',
});

export const BUS_STATUS_VALUES = Object.freeze(Object.values(BUS_STATUS));

export const DRIVER_STATUS = Object.freeze({
  ACTIVE: 'active',
  ON_LEAVE: 'on_leave',
  INACTIVE: 'inactive',
});

export const DRIVER_STATUS_VALUES = Object.freeze(Object.values(DRIVER_STATUS));

export const ROUTE_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

export const ROUTE_STATUS_VALUES = Object.freeze(Object.values(ROUTE_STATUS));

export const COUNTER_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

export const COUNTER_STATUS_VALUES = Object.freeze(Object.values(COUNTER_STATUS));

export const TRIP_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  STARTED: 'started',
  AT_STOP: 'at_stop',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DELAYED: 'delayed',
});

export const TRIP_STATUS_VALUES = Object.freeze(Object.values(TRIP_STATUS));

/** Statuses a passenger can search and book. A started or completed trip is not bookable. */
export const BOOKABLE_TRIP_STATUS_VALUES = Object.freeze([
  TRIP_STATUS.SCHEDULED,
  TRIP_STATUS.DELAYED,
]);

// --- Seats -----------------------------------------------------------------

/**
 * One document per seat per trip.
 * `held` is temporary (expiresAt), `booked` is permanent until cancelled, and
 * `blocked` is a seat the operator keeps out of sale (driver rest, damage).
 */
export const HOLD_STATUS = Object.freeze({
  HELD: 'held',
  BOOKED: 'booked',
  BLOCKED: 'blocked',
});

export const HOLD_STATUS_VALUES = Object.freeze(Object.values(HOLD_STATUS));

/** Statuses a trip can be moved to from the admin panel. */
export const TRIP_EDITABLE_STATUS_VALUES = Object.freeze([
  TRIP_STATUS.SCHEDULED,
  TRIP_STATUS.DELAYED,
  TRIP_STATUS.STARTED,
  TRIP_STATUS.COMPLETED,
]);

// --- Bookings & payments ---------------------------------------------------

/**
 * A booking is the ticket.
 * `pending`  → seats are locked in the passenger's name, but money is not in yet
 *              (online gateway waiting, or "pay at counter" reservation).
 * `confirmed`→ paid (or explicitly accepted) and the seat is sold.
 * `expired`  → an unpaid online payment ran out of time; seats were released.
 */
export const BOOKING_STATUS = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

export const BOOKING_STATUS_VALUES = Object.freeze(Object.values(BOOKING_STATUS));

/** Where the sale happened. Counter sales are cash-first and staff-operated. */
export const BOOKING_CHANNEL = Object.freeze({
  ONLINE: 'online',
  COUNTER: 'counter',
});

export const BOOKING_CHANNEL_VALUES = Object.freeze(Object.values(BOOKING_CHANNEL));

export const PAYMENT_METHOD = Object.freeze({
  CASH: 'cash',
  SSLCOMMERZ: 'sslcommerz',
});

export const PAYMENT_METHOD_VALUES = Object.freeze(Object.values(PAYMENT_METHOD));

/**
 * The money state of a booking.
 * `unpaid` is honest for a pay-at-counter reservation: the seat is reserved,
 * the ticket exists, and the ticket itself says the money is still due.
 */
export const PAYMENT_STATUS = Object.freeze({
  UNPAID: 'unpaid',
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
});

export const PAYMENT_STATUS_VALUES = Object.freeze(Object.values(PAYMENT_STATUS));

/** One payment attempt record. `cash` rows are written when staff take money. */
export const PAYMENT_PROVIDER = Object.freeze({
  SSLCOMMERZ: 'sslcommerz',
  CASH: 'cash',
});

export const PAYMENT_PROVIDER_VALUES = Object.freeze(Object.values(PAYMENT_PROVIDER));

export const PAYMENT_RECORD_STATUS = Object.freeze({
  INITIATED: 'initiated',
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
});

export const PAYMENT_RECORD_STATUS_VALUES = Object.freeze(
  Object.values(PAYMENT_RECORD_STATUS),
);

/** Card/bkash/nagad… reported by the gateway; `cash` for counter money. */
export const PAYMENT_INSTRUMENT_VALUES = Object.freeze([
  'card',
  'bkash',
  'nagad',
  'rocket',
  'bank',
  'cash',
  'other',
]);

// --- Phase 7: cancellations, refunds, notifications ------------------------

/**
 * A refund is tracked, never silently performed: the gateway does not expose an
 * automatic refund to us, so an admin approves and then marks it processed with
 * whatever reference the real refund produced.
 */
export const REFUND_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  PROCESSED: 'processed',
  REJECTED: 'rejected',
});

export const REFUND_STATUS_VALUES = Object.freeze(Object.values(REFUND_STATUS));

export const REFUND_METHOD = Object.freeze({
  CASH: 'cash',
  SSLCOMMERZ: 'sslcommerz',
  BANK: 'bank',
  OTHER: 'other',
});

export const REFUND_METHOD_VALUES = Object.freeze(Object.values(REFUND_METHOD));

export const NOTIFICATION_CHANNEL = Object.freeze({
  EMAIL: 'email',
  SMS: 'sms',
  IN_APP: 'in_app',
});

export const NOTIFICATION_CHANNEL_VALUES = Object.freeze(
  Object.values(NOTIFICATION_CHANNEL),
);

/** `skipped` is the honest state for mock mode: nothing was delivered. */
export const NOTIFICATION_STATUS = Object.freeze({
  QUEUED: 'queued',
  SENT: 'sent',
  FAILED: 'failed',
  SKIPPED: 'skipped',
});

export const NOTIFICATION_STATUS_VALUES = Object.freeze(
  Object.values(NOTIFICATION_STATUS),
);

export const NOTIFICATION_TEMPLATE = Object.freeze({
  BOOKING_CONFIRMED: 'booking_confirmed',
  BOOKING_CANCELLED: 'booking_cancelled',
  REFUND_PROCESSED: 'refund_processed',
});

export const NOTIFICATION_TEMPLATE_VALUES = Object.freeze(
  Object.values(NOTIFICATION_TEMPLATE),
);
