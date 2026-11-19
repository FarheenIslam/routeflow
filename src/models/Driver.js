import mongoose from 'mongoose';
import {
  BD_PHONE_PATTERN,
  DRIVER_STATUS,
  DRIVER_STATUS_VALUES,
} from '../config/constants.js';

const { Schema } = mongoose;

/**
 * Drivers collection.
 *
 * A driver profile can exist without a login (`userId` empty) — useful for
 * legacy staff — but the driver portal in Phase 7 needs one, so the admin form
 * offers to create it at the same time.
 */
const driverSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    name: {
      type: String,
      required: [true, 'Driver name is required'],
      trim: true,
      maxlength: [80, 'Driver name is too long'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
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
    licenseNumber: {
      type: String,
      required: [true, 'License number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: [40, 'License number is too long'],
    },
    licenseExpiry: { type: Date, default: null },
    assignedBusId: { type: Schema.Types.ObjectId, ref: 'Bus', default: null },
    address: { type: String, trim: true, maxlength: [200, 'Address is too long'] },
    photoUrl: { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: { values: DRIVER_STATUS_VALUES, message: 'Invalid driver status' },
      default: DRIVER_STATUS.ACTIVE,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

driverSchema.index({ status: 1 });
driverSchema.index({ assignedBusId: 1 });

const Driver = mongoose.models.Driver || mongoose.model('Driver', driverSchema);

export default Driver;
