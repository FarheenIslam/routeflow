import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * SystemSettings — exactly ONE document, keyed "global".
 *
 * Why one document instead of key/value rows? These settings are always read
 * together (cancellation policy, booking limits, notifications, language) and
 * are tiny, so one document means one fast query and no joins.
 */
const systemSettingSchema = new Schema(
  {
    key: {
      type: String,
      default: 'global',
      unique: true,
      immutable: true,
    },

    cancellationPolicy: {
      freeCancelHours: { type: Number, default: 24, min: 0 },
      halfRefundHours: { type: Number, default: 2, min: 0 },
      halfRefundPercent: { type: Number, default: 50, min: 0, max: 100 },
      noRefundPercent: { type: Number, default: 0, min: 0, max: 100 },
    },

    booking: {
      holdMinutes: { type: Number, default: 2, min: 1, max: 15 },
      maxSeatsPerBooking: { type: Number, default: 6, min: 1, max: 20 },
      advanceBookingDays: { type: Number, default: 60, min: 1, max: 365 },
      passengerSelfCancel: { type: Boolean, default: false },
      /** How long an unpaid online-gateway booking keeps its seats. */
      paymentWindowMinutes: { type: Number, default: 15, min: 5, max: 120 },
    },

    notifications: {
      emailEnabled: { type: Boolean, default: true },
      smsEnabled: { type: Boolean, default: false },
      /** When true, messages are logged instead of sent. Nothing pretends to deliver. */
      mockMode: { type: Boolean, default: true },
    },

    payments: {
      onlineEnabled: { type: Boolean, default: false },
      sandbox: { type: Boolean, default: true },
    },

    localization: {
      defaultLanguage: {
        type: String,
        enum: ['bn', 'en'],
        default: 'bn',
      },
      ticketLanguages: {
        type: [{ type: String, enum: ['bn', 'en'] }],
        default: ['bn', 'en'],
      },
    },

    ticket: {
      headerText: { type: String, default: 'BusBook — Bus Ticket' },
      footerText: { type: String, default: 'Thank you for travelling with us.' },
      termsEn: {
        type: String,
        default:
          'Please arrive 15 minutes before departure. Tickets are non-transferable.',
      },
      termsBn: {
        type: String,
        default:
          'যাত্রার ১৫ মিনিট আগে উপস্থিত থাকুন। টিকিট হস্তান্তরযোগ্য নয়।',
      },
    },

    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

const SystemSetting =
  mongoose.models.SystemSetting ||
  mongoose.model('SystemSetting', systemSettingSchema);

export default SystemSetting;
