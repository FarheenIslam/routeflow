import mongoose from 'mongoose';
import {
  BD_PHONE_PATTERN,
  COUNTER_STATUS,
  COUNTER_STATUS_VALUES,
} from '../config/constants.js';

const { Schema } = mongoose;

const counterSchema = new Schema(
  {
    code: {
      type: String,
      required: [true, 'Counter code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: [20, 'Counter code is too long'],
    },
    name: {
      type: String,
      required: [true, 'Counter name is required'],
      trim: true,
      maxlength: [100, 'Counter name is too long'],
    },
    branchName: { type: String, trim: true, maxlength: 100, default: '' },
    address: {
      street: { type: String, trim: true, maxlength: 200, default: '' },
      city: { type: String, trim: true, maxlength: 80, default: '' },
      division: { type: String, trim: true, maxlength: 80, default: '' },
      lat: { type: Number, min: -90, max: 90, default: null },
      lng: { type: Number, min: -180, max: 180, default: null },
    },
    phone: {
      type: String,
      trim: true,
      default: null,
      match: [BD_PHONE_PATTERN, 'Phone must be a valid Bangladeshi number'],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Please provide a valid email address'],
    },
    managerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Counter staff logins assigned to this branch. */
    staffUserIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    commissionPercent: { type: Number, min: 0, max: 100, default: 0 },
    status: {
      type: String,
      enum: { values: COUNTER_STATUS_VALUES, message: 'Invalid counter status' },
      default: COUNTER_STATUS.ACTIVE,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

counterSchema.index({ branchName: 1 });
counterSchema.index({ status: 1 });
counterSchema.index({ staffUserIds: 1 });

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

export default Counter;
