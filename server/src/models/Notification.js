import mongoose from 'mongoose';
import {
  NOTIFICATION_CHANNEL_VALUES,
  NOTIFICATION_STATUS,
  NOTIFICATION_STATUS_VALUES,
  NOTIFICATION_TEMPLATE_VALUES,
} from '../config/constants.js';

const { Schema } = mongoose;

/**
 * Notifications — an audit log of every message we tried to send.
 *
 * The rule that makes this honest: a row is written **before** delivery, and in
 * mock mode it is marked `skipped` with the reason. So "we emailed the ticket"
 * can always be checked against this collection, and a skipped row can never be
 * mistaken for a delivered one.
 */
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', default: null, index: true },

    channel: {
      type: String,
      enum: { values: NOTIFICATION_CHANNEL_VALUES, message: 'Invalid channel' },
      required: true,
    },
    template: {
      type: String,
      enum: { values: NOTIFICATION_TEMPLATE_VALUES, message: 'Invalid template' },
      required: true,
    },

    to: { type: String, required: true, trim: true, maxlength: 200 },
    subject: { type: String, trim: true, maxlength: 200, default: null },
    body: { type: String, trim: true, maxlength: 4000, default: null },

    status: {
      type: String,
      enum: { values: NOTIFICATION_STATUS_VALUES, message: 'Invalid status' },
      default: NOTIFICATION_STATUS.QUEUED,
      index: true,
    },
    provider: { type: String, trim: true, maxlength: 40, default: 'mock' },
    providerMessageId: { type: String, trim: true, maxlength: 120, default: null },
    error: { type: String, trim: true, maxlength: 300, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true, versionKey: false },
);

notificationSchema.index({ status: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

export default Notification;
