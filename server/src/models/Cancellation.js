import mongoose from 'mongoose';
import {
  REFUND_METHOD_VALUES,
  REFUND_STATUS,
  REFUND_STATUS_VALUES,
} from '../config/constants.js';

const { Schema } = mongoose;

/**
 * Cancellations — one document per cancelled ticket, and the refund ledger.
 *
 * The money is tracked, not invented: `refundAmount` is calculated from the
 * cancellation policy at the moment of cancellation and stays fixed even if the
 * policy is edited later. An admin then moves the refund from pending → approved
 * → processed (with the real transaction reference) or rejects it. **No gateway
 * refund is executed automatically.**
 *
 * If no money was ever collected, the refund is born `processed` with amount 0:
 * there is nothing for an admin to review, and pretending otherwise would create
 * noise.
 */
const policySchema = new Schema(
  {
    hoursBeforeDeparture: { type: Number, required: true, min: 0 },
    refundPercent: { type: Number, required: true, min: 0, max: 100 },
    /** `full_refund`, `partial_refund`, `no_refund` — stable machine labels. */
    ruleLabel: { type: String, required: true, trim: true, maxlength: 40 },
  },
  { _id: false },
);

const cancellationSchema = new Schema(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true,
    },
    bookingCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },

    cancelledByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledByRole: { type: String, default: null },

    reason: { type: String, required: true, trim: true, maxlength: 300 },

    policyApplied: { type: policySchema, required: true },
    refundAmount: { type: Number, required: true, min: 0, default: 0 },
    refundStatus: {
      type: String,
      enum: { values: REFUND_STATUS_VALUES, message: 'Invalid refund status' },
      default: REFUND_STATUS.PENDING,
      index: true,
    },
    refundMethod: {
      type: String,
      enum: { values: REFUND_METHOD_VALUES, message: 'Invalid refund method' },
      default: null,
    },
    refundTranId: { type: String, trim: true, maxlength: 120, default: null },

    processedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    processedAt: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 300, default: null },
  },
  { timestamps: true, versionKey: false },
);

cancellationSchema.index({ refundStatus: 1, createdAt: -1 });
cancellationSchema.index({ 'policyApplied.ruleLabel': 1, createdAt: -1 });

const Cancellation =
  mongoose.models.Cancellation ||
  mongoose.model('Cancellation', cancellationSchema);

export default Cancellation;
