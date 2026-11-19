import mongoose from 'mongoose';
import {
  BD_PHONE_PATTERN,
  BOOKING_CHANNEL,
  BOOKING_CHANNEL_VALUES,
  BOOKING_STATUS,
  BOOKING_STATUS_VALUES,
  PAYMENT_METHOD,
  PAYMENT_METHOD_VALUES,
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
} from '../config/constants.js';

const { Schema } = mongoose;

/**
 * Bookings = tickets.
 *
 * One document is one sale: who travels, on which trip, in which seats, how it
 * was paid for. The seats themselves stay in SeatHolds (one row per seat) so the
 * unique index there remains the only thing that decides who owns a seat.
 *
 * `bookingCode` is the ticket number a passenger reads aloud at the counter.
 * It is short on purpose (BB-7K2M9Q): staff type it, phones read it, and the
 * gateway never sees it (payments get their own database id as `tran_id`).
 */
const passengerSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Passenger name is required'],
      trim: true,
      maxlength: [80, 'Passenger name is too long'],
    },
    phone: {
      type: String,
      required: [true, 'Passenger phone is required'],
      trim: true,
      match: [BD_PHONE_PATTERN, 'Phone must be a valid Bangladeshi number'],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Please provide a valid email address'],
    },
    gender: {
      type: String,
      enum: { values: ['male', 'female', 'other'], message: 'Invalid gender' },
      default: null,
    },
    age: { type: Number, min: 0, max: 120, default: null },
    nid: { type: String, trim: true, maxlength: 30, default: null },
  },
  { _id: false },
);

const bookedSeatSchema = new Schema(
  {
    seatNumber: { type: Number, required: true, min: 1 },
    seatLabel: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    /** The printed ticket number: BB-XXXXXX. Unique across all time. */
    bookingCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^BB-[A-Z0-9]{6}$/, 'Booking code must look like BB-7K2M9Q'],
    },

    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    /** Null for a walk-in counter sale: that passenger has no account. */
    passengerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    passenger: { type: passengerSchema, required: true },

    seats: {
      type: [bookedSeatSchema],
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: 'A booking needs at least one seat',
      },
    },
    seatCount: { type: Number, required: true, min: 1 },

    /** Money is always computed on the server from the trip fare. */
    farePerSeat: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    payableAmount: { type: Number, required: true, min: 0 },

    paymentMethod: {
      type: String,
      enum: { values: PAYMENT_METHOD_VALUES, message: 'Invalid payment method' },
      default: PAYMENT_METHOD.CASH,
    },
    paymentStatus: {
      type: String,
      enum: { values: PAYMENT_STATUS_VALUES, message: 'Invalid payment status' },
      default: PAYMENT_STATUS.UNPAID,
    },

    status: {
      type: String,
      enum: { values: BOOKING_STATUS_VALUES, message: 'Invalid booking status' },
      default: BOOKING_STATUS.PENDING,
      index: true,
    },
    channel: {
      type: String,
      enum: { values: BOOKING_CHANNEL_VALUES, message: 'Invalid booking channel' },
      default: BOOKING_CHANNEL.ONLINE,
    },

    /** Who created it. A guest online sale has only the guest session id. */
    bookedBy: {
      userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      role: { type: String, default: null },
      counterId: { type: Schema.Types.ObjectId, ref: 'Counter', default: null },
    },

    /** The SeatHold rows this booking converted. Kept for a clean cancellation. */
    holdIds: { type: [Schema.Types.ObjectId], ref: 'SeatHold', default: [] },

    /**
     * The guest cookie that created the booking. It lets the same browser open
     * its ticket right after paying, without forcing an account. It is never
     * returned by the API.
     */
    guestSessionId: { type: String, default: null, select: false },

    /** Six digits a conductor can check against the printed ticket. */
    verificationCode: { type: String, required: true, match: /^\d{6}$/ },

    /**
     * When an online gateway payment stops being worth waiting for. Null for
     * cash bookings, which stay reserved until staff collect or cancel them.
     */
    paymentDeadlineAt: { type: Date, default: null },

    cancellationId: { type: Schema.Types.ObjectId, ref: 'Cancellation', default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, maxlength: 300, default: null },
  },
  { timestamps: true, versionKey: false },
);

/** Counter search and "my tickets" both read these. */
bookingSchema.index({ 'passenger.phone': 1, createdAt: -1 });
bookingSchema.index({ passengerUserId: 1, createdAt: -1 });
bookingSchema.index({ tripId: 1, status: 1 });
bookingSchema.index({ paymentStatus: 1, createdAt: -1 });
bookingSchema.index({ 'bookedBy.counterId': 1, createdAt: -1 });
bookingSchema.index({ status: 1, paymentDeadlineAt: 1 });

const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);

export default Booking;
