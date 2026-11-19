import { z } from 'zod';
import { BUS_TYPE_VALUES } from '../config/constants.js';

/**
 * Validation for the public passenger site.
 * The server never trusts a query string, even a read-only one: a date like
 * "hello" would otherwise reach the database as an Invalid Date.
 */

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'That identifier is not valid');

export const tripSearchQuerySchema = z.object({
  origin: z.string().trim().min(2, 'Enter a departure city').max(80),
  destination: z.string().trim().min(2, 'Enter a destination city').max(80),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must look like 2026-12-31')
    .optional(),
  busType: z.enum(BUS_TYPE_VALUES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const tripParamsSchema = z.object({
  id: objectId,
});

export const holdCreateSchema = z.object({
  tripId: objectId,
  seatNumbers: z
    .array(z.coerce.number().int().min(1).max(200))
    .min(1, 'Select at least one seat')
    .max(20, 'Too many seats in one request'),
});

export const holdParamsSchema = z.object({
  id: objectId,
});

export const holdReleaseQuerySchema = z.object({
  tripId: objectId,
});
