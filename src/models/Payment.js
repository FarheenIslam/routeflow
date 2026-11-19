import mongoose from 'mongoose';
import {
  PAYMENT_INSTRUMENT_VALUES,
  PAYMENT_METHOD,
  PAYMENT_PROVIDER,
  PAYMENT_PROVIDER_VALUES,
  PAYMENT_RECORD_STATUS,
  PAYMENT_RECORD_STATUS_VALUES,
} from '../config/constants.js';

const { Schema } = mongoose;

/**
 * Payments — one document per money attempt.
 *
 * For SSLCommerz this row is created before the passenger leaves our site, and
 * its `_id` is sent to the gateway as `tran_id`. That id is the idempotency key:
 * a duplicated IPN or a page refresh can never confirm a different booking,
 * because we look the payment up by the id we gave the gateway.
 *
 * `rawValidation` stores the gateway's answer with card data removed. We keep it
 * because a disputed payment needs evidence, but we never store a card number.
 */
const paymentSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    bookingCode: { type: String, trim: true, uppercase: true, required: true, index: true },

    provider: {
      type: String,
      enum: { values: PAYMENT_PROVIDER_VALUES, message: 'Invalid payment provider' },
      required: true,
    },
    /** Card, bKash, Nagad… as reported by the gateway. `cash` for counter money. */
    method: {
      type: String,
      enum: { values: PAYMENT_INSTRUMENT_VALUES, message: 'Invalid payment method' },
      default: PAYMENT_METHOD.CASH,
    },

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'BDT', uppercase: true, maxlength: 3 },

    status: {
      type: String,
      enum: { values: PAYMENT_RECORD_STATUS_VALUES, message: 'Invalid payment status' },
      default: PAYMENT_RECORD_STATUS.INITIATED,
      index: true,
    },

    /**
     * Our idempotency key. For SSLCommerz it is this document's `_id`; unique so
     * a retried insert can never create a second row for one gateway transaction.
     */
    providerTranId: { type: String, required: true, unique: true, trim: true },
    gatewayPageUrl: { type: String, default: null },

    /** Gateway cross-references, copied from the validation response. */
    valId: { type: String, default: null },
    bankTranId: { type: String, default: null },
    cardType: { type: String, default: null },
    cardBrand: { type: String, default: null },
    storeAmount: { type: Number, default: null },

    /** Sanitised copy of the validator response (no card numbers, no passwords). */
    rawValidation: { type: Schema.Types.Mixed, default: null },

    initiatedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    failureReason: { type: String, trim: true, maxlength: 300, default: null },

    /** Who took the cash (null for gateway payments). */
    receivedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    counterId: { type: Schema.Types.ObjectId, ref: 'Counter', default: null },
  },
  { timestamps: true, versionKey: false },
);

paymentSchema.index({ status: 1, createdAt: 1 });
paymentSchema.index({ bookingId: 1, createdAt: -1 });

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

export default Payment;
