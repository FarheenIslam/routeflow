import { z } from 'zod';
import { BD_PHONE_PATTERN, PAYMENT_METHOD_VALUES } from '../config/constants.js';

/**
 * Validation for booking, payment and counter endpoints.
 * The server recomputes every price from the trip, so no amount field exists
 * here on purpose: a client cannot send what it wants to pay.
 */

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'That identifier is not valid');

export const bookingCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^BB-[A-Z0-9]{6}$/, 'Ticket number must look like BB-7K2M9Q');

/** An empty optional text field arrives as "" from a form, not undefined. */
const optionalText = (schema) =>
  z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional());

export const passengerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter the passenger name')
    .max(80, 'Passenger name is too long'),
  phone: z
    .string()
    .trim()
    .regex(BD_PHONE_PATTERN, 'Enter a valid Bangladeshi mobile number (e.g. 01712345678)'),
  email: optionalText(z.string().trim().toLowerCase().email('Enter a valid email address')),
  gender: optionalText(z.enum(['male', 'female', 'other'])),
  age: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().min(0, 'Age cannot be negative').max(120, 'Enter a real age').optional(),
  ),
  nid: optionalText(z.string().trim().max(30, 'NID is too long')),
});

export const createBookingSchema = z.object({
  tripId: objectId,
  seatNumbers: z
    .array(z.coerce.number().int().min(1).max(200))
    .min(1, 'Select at least one seat')
    .max(20, 'Too many seats in one request'),
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES, {
    error: 'Choose how you want to pay',
  }),
  passenger: passengerSchema,
});

export const counterBookingSchema = z.object({
  tripId: objectId,
  seatNumbers: z
    .array(z.coerce.number().int().min(1).max(200))
    .min(1, 'Select at least one seat')
    .max(20, 'Too many seats in one request'),
  passenger: passengerSchema,
});

export const bookingCodeParamSchema = z.object({
  code: bookingCodeSchema,
});

export const bookingLookupQuerySchema = z.object({
  code: bookingCodeSchema,
  phone: z
    .string()
    .trim()
    .regex(BD_PHONE_PATTERN, 'Enter the mobile number used at booking'),
});

export const ticketQuerySchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(BD_PHONE_PATTERN, 'Enter the mobile number used at booking')
    .optional(),
});

export const initiatePaymentSchema = z.object({
  bookingCode: bookingCodeSchema,
});

export const cancelBookingSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Tell us briefly why this ticket is being cancelled')
    .max(300, 'Reason is too long'),
});

export const counterSearchQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(''),
});

export const counterCollectParamsSchema = z.object({
  code: bookingCodeSchema,
});
