import mongoose from 'mongoose';
import { HOLD_STATUS, HOLD_STATUS_VALUES } from '../config/constants.js';

const { Schema } = mongoose;

/**
 * SeatHolds — one document per seat per trip. This is the seat lock ledger.
 *
 * Why a separate collection instead of a list of seats on the Trip?
 *   1. A unique index on (tripId, seatNumber) makes double-selling impossible,
 *      even when two people tap the same seat in the same millisecond.
 *   2. A hold expires on its own (`expiresAt`), so an abandoned checkout frees
 *      the seat without any user action.
 *   3. The booking service (Phase 6) flips `held` → `booked` in one atomic
 *      update, and a cancellation flips it back.
 *
 * There is deliberately NO MongoDB TTL index here. A TTL index would delete the
 * document behind our back and leave `trip.seatSummary.held` inflated. Expiry is
 * owned by the sweeper job and the queries themselves (`expiresAt > now`), so
 * the counters always match what a passenger sees.
 */
const seatHoldSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    seatNumber: { type: Number, required: true, min: 1 },
    /** Human label such as "A12"; stored so tickets and reports can print it. */
    seatLabel: { type: String, trim: true, default: '' },

    status: {
      type: String,
      enum: { values: HOLD_STATUS_VALUES, message: 'Invalid seat hold status' },
      default: HOLD_STATUS.HELD,
      index: true,
    },

    /** Random browser id from the httpOnly `bb_sid` cookie. Never a user id. */
    holderSessionId: { type: String, default: null, index: true },
    holderUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Set in Phase 6 when a hold becomes a real booking. */
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', default: null },

    /** When the hold stops being valid. Null for booked/blocked seats. */
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

/**
 * The rule that prevents double-selling a seat. Every hold/booking for a seat
 * is one document, so "only one of them can exist" is all the database needs.
 */
seatHoldSchema.index(
  { tripId: 1, seatNumber: 1 },
  { unique: true, name: 'uniq_trip_seat' },
);

/** Seat map lookup: every live hold of one trip. */
seatHoldSchema.index({ tripId: 1, status: 1, expiresAt: 1 }, { name: 'trip_live_holds' });

const SeatHold = mongoose.models.SeatHold || mongoose.model('SeatHold', seatHoldSchema);

export default SeatHold;
