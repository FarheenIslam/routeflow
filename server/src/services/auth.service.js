import crypto from 'node:crypto';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { ROLES, USER_STATUS } from '../config/constants.js';
import { sendPasswordResetEmail } from '../integrations/mailer.js';

/** Shape returned to the browser — never a hash, never a reset token. */
export function toPublicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    counterId: user.counterId ? String(user.counterId) : null,
    driverId: user.driverId ? String(user.driverId) : null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Passenger self-registration.
 * Staff accounts (COUNTER / DRIVER / ADMIN) are created by an administrator
 * from Phase 4 onward — letting anyone pick their own role would be a takeover.
 */
export async function registerPassenger({ name, email, phone, password }) {
  const normalizedEmail = email.toLowerCase();

  const existing = await User.findOne({
    $or: [{ email: normalizedEmail }, { phone }],
  })
    .select('email phone')
    .lean();

  if (existing) {
    if (existing.email === normalizedEmail) {
      throw new ApiError(409, 'An account with this email already exists', [
        { field: 'email', message: 'This email is already registered' },
      ]);
    }
    throw new ApiError(409, 'An account with this phone number already exists', [
      { field: 'phone', message: 'This phone number is already registered' },
    ]);
  }

  return User.create({
    name,
    email: normalizedEmail,
    phone,
    passwordHash: await User.hashPassword(password),
    role: ROLES.PASSENGER,
    status: USER_STATUS.ACTIVE,
  });
}

/**
 * Sign-in with either email or phone number.
 *
 * Deliberate choices:
 * - The same "invalid credentials" message for unknown accounts and wrong
 *   passwords, so the endpoint cannot be used to discover who has an account.
 * - The account status is only revealed AFTER a correct password.
 */
export async function loginUser({ identifier, password }) {
  const isEmail = identifier.includes('@');
  const query = isEmail
    ? { email: identifier.toLowerCase() }
    : { phone: identifier };

  const user = await User.findOne(query).select('+passwordHash');
  if (!user) {
    throw ApiError.unauthorized('Invalid email/phone or password');
  }

  const passwordIsCorrect = await user.verifyPassword(password);
  if (!passwordIsCorrect) {
    throw ApiError.unauthorized('Invalid email/phone or password');
  }

  if (user.status === USER_STATUS.SUSPENDED) {
    throw ApiError.forbidden(
      'This account has been suspended. Please contact the counter for help.',
    );
  }
  if (user.status === USER_STATUS.PENDING) {
    throw ApiError.forbidden('This account is not active yet. Please contact the counter.');
  }

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

  return user;
}

/**
 * Password reset request.
 * Always resolves without revealing whether the email exists.
 */
export async function requestPasswordReset(email) {
  const result = { requested: true, devResetUrl: null };

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || user.status !== USER_STATUS.ACTIVE) return result;

  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordResetTokenHash: hashResetToken(rawToken),
        passwordResetExpiresAt: expiresAt,
      },
    },
  );

  const resetUrl = `${env.clientUrl}/reset-password/${rawToken}`;
  const delivery = await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl,
  });

  // Development convenience only: with no email provider configured there is no
  // other way to reach the link. Never exposed in production.
  if (delivery.mode === 'mock' && !env.isProduction) {
    result.devResetUrl = resetUrl;
  }

  return result;
}

/** Completes a reset and invalidates every existing session for that user. */
export async function resetPassword(rawToken, newPassword) {
  const user = await User.findOne({
    passwordResetTokenHash: hashResetToken(rawToken),
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpiresAt');

  if (!user) {
    throw ApiError.badRequest(
      'This reset link is invalid or has expired. Please request a new one.',
    );
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash: await User.hashPassword(newPassword),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        tokenVersion: (user.tokenVersion ?? 0) + 1,
      },
    },
  );

  return user;
}

/** Change password while signed in. Requires the current password. */
export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('This account no longer exists');

  const matches = await user.verifyPassword(currentPassword);
  if (!matches) {
    throw new ApiError(400, 'Your current password is incorrect', [
      { field: 'currentPassword', message: 'Incorrect password' },
    ]);
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash: await User.hashPassword(newPassword),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        tokenVersion: (user.tokenVersion ?? 0) + 1,
      },
    },
  );

  return User.findById(userId);
}
