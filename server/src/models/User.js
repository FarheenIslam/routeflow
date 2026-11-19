import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import {
  ROLE_VALUES,
  ROLES,
  USER_STATUS_VALUES,
  USER_STATUS,
  BCRYPT_ROUNDS,
  BD_PHONE_PATTERN,
} from '../config/constants.js';

const { Schema } = mongoose;

/**
 * Users collection — one row for every human who can sign in.
 * Passengers, counter staff, drivers and admins all live here and are separated
 * by `role`. That keeps login logic in one place instead of four tables.
 */
const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name cannot be longer than 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Please provide a valid email address'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      match: [BD_PHONE_PATTERN, 'Phone must be a valid Bangladeshi number (e.g. 01712345678)'],
    },
    /**
     * bcrypt hash — never the raw password.
     * select:false keeps it out of normal queries, so a forgotten .select() in a
     * controller cannot leak a hash into an API response.
     */
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ROLE_VALUES,
        message: 'Role must be one of: ADMIN, COUNTER, DRIVER, PASSENGER',
      },
      default: ROLES.PASSENGER,
    },
    status: {
      type: String,
      enum: {
        values: USER_STATUS_VALUES,
        message: 'Status must be active, suspended or pending',
      },
      default: USER_STATUS.ACTIVE,
    },
    /** Set for COUNTER users — which branch they sell from. */
    counterId: {
      type: Schema.Types.ObjectId,
      ref: 'Counter',
      default: null,
    },
    /** Set for DRIVER users — links the login to the driver profile. */
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    /** Reset token is stored hashed; the raw token exists only in the email. */
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null, select: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /**
     * Bumped on every password change/reset. Tokens carry the value they were
     * issued with, so changing a password instantly invalidates old sessions.
     */
    tokenVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpiresAt;
        return ret;
      },
    },
  },
);

// --- Indexes ---------------------------------------------------------------
// email and phone already get unique indexes from `unique: true`.
// These support the admin user list and future per-branch filtering.
userSchema.index({ role: 1, status: 1 });
userSchema.index({ counterId: 1 });
userSchema.index(
  { name: 'text', email: 'text', phone: 'text' },
  { name: 'user_text_search' },
);

// --- Helpers ---------------------------------------------------------------
userSchema.statics.hashPassword = (plainPassword) =>
  bcrypt.hash(plainPassword, BCRYPT_ROUNDS);

userSchema.methods.verifyPassword = function verifyPassword(plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.virtual('isActive').get(function isActive() {
  return this.status === USER_STATUS.ACTIVE;
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
