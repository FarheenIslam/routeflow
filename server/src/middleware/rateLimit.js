import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Login, registration and password reset are the endpoints attackers hammer.
 * These limits are per IP and are skipped during tests so the suite stays fast
 * and deterministic.
 */
const skip = () => env.isTest;

function limiter(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    skip,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message },
  });
}

export const loginLimiter = limiter(
  15 * 60 * 1000,
  10,
  'Too many sign-in attempts. Please wait 15 minutes and try again.',
);

export const registerLimiter = limiter(
  60 * 60 * 1000,
  8,
  'Too many accounts created from this network. Please try again later.',
);

export const passwordResetLimiter = limiter(
  15 * 60 * 1000,
  6,
  'Too many password reset requests. Please wait 15 minutes and try again.',
);

/**
 * A seat hold writes to the database and takes a seat off sale, so one client
 * should not be able to create hundreds of them. Generating a search is cheap
 * and unlimited; holding seats is not.
 */
export const seatHoldLimiter = limiter(
  10 * 60 * 1000,
  40,
  'Too many seat requests. Please wait a few minutes and try again.',
);

/** Creating a ticket is heavier than holding a seat: it writes a sale. */
export const bookingCreateLimiter = limiter(
  15 * 60 * 1000,
  20,
  'Too many booking attempts. Please wait a few minutes and try again.',
);

/** Ticket lookup is public, so it must not be usable to guess ticket numbers. */
export const bookingLookupLimiter = limiter(
  15 * 60 * 1000,
  20,
  'Too many ticket lookups. Please wait a few minutes and try again.',
);
