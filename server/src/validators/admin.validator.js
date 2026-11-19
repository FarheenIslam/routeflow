import { z } from 'zod';
import {
  BUS_STATUS_VALUES,
  BUS_TYPE_VALUES,
  COUNTER_STATUS_VALUES,
  DRIVER_STATUS_VALUES,
  REFUND_METHOD_VALUES,
  REFUND_STATUS_VALUES,
  ROLE_VALUES,
  ROUTE_STATUS_VALUES,
  TRIP_EDITABLE_STATUS_VALUES,
  USER_STATUS_VALUES,
} from '../config/constants.js';

/**
 * Validation for the admin panel. Same rules style as Phase 3: the server is the
 * authority, and every message is field-scoped so the React forms can place it.
 */

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'That identifier is not valid');

const optionalObjectId = z
  .union([objectId, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

const phone = z
  .string()
  .trim()
  .regex(/^01[3-9]\d{8}$/, 'Phone must be a valid Bangladeshi number');

const optionalEmail = z
  .union([z.string().trim().toLowerCase().email('Enter a valid email'), z.literal('')])
  .optional()
  .transform((value) => (value ? value : null));

const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Cannot be longer than ${max} characters`)
    .optional()
    .transform((value) => value ?? '');

const coordinate = (min, max) =>
  z
    .union([z.number().min(min).max(max), z.literal(''), z.null()])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value));

// --- Buses -----------------------------------------------------------------

const seatLayout = z.object({
  rows: z.coerce.number().int().min(1).max(20),
  columns: z.coerce.number().int().min(1).max(6),
  aisleAfterColumn: z.coerce.number().int().min(1).max(5).default(2),
  seatPrefix: z.string().trim().max(2).default('A'),
  disabledSeats: z.array(z.coerce.number().int().min(1).max(120)).default([]),
});

export const busCreateSchema = z.object({
  busNumber: z.string().trim().min(3, 'Bus number is required').max(24),
  operatorName: z.string().trim().min(2, 'Operator name is required').max(80),
  busType: z.enum(BUS_TYPE_VALUES),
  seatLayout,
  amenities: z.array(z.string().trim().max(40)).default([]),
  status: z.enum(BUS_STATUS_VALUES).default('active'),
});

export const busUpdateSchema = busCreateSchema.partial();
export const busStatusSchema = z.object({ status: z.enum(BUS_STATUS_VALUES) });

// --- Drivers ---------------------------------------------------------------

const driverBase = {
  name: z.string().trim().min(2, 'Driver name is required').max(80),
  phone,
  email: optionalEmail,
  licenseNumber: z.string().trim().min(3, 'License number is required').max(40),
  licenseExpiry: z
    .union([z.string().trim(), z.null()])
    .optional()
    .transform((value) => (value ? new Date(value) : null)),
  assignedBusId: optionalObjectId,
  address: optionalText(200),
  status: z.enum(DRIVER_STATUS_VALUES).default('active'),
};

export const driverCreateSchema = z.object({
  ...driverBase,
  /** Optional: also create a DRIVER login so the driver can use the portal. */
  createLogin: z.boolean().default(false),
  loginEmail: optionalEmail,
  loginPassword: z
    .union([z.string().min(8, 'Password must be at least 8 characters').max(72), z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
});

export const driverUpdateSchema = z.object(driverBase).partial();

// --- Routes ----------------------------------------------------------------

const place = z.object({
  name: z.string().trim().min(2, 'Place name is required').max(80),
  city: z.string().trim().max(80).default(''),
  lat: coordinate(-90, 90),
  lng: coordinate(-180, 180),
});

const stop = z.object({
  name: z.string().trim().min(2, 'Stop name is required').max(80),
  lat: coordinate(-90, 90),
  lng: coordinate(-180, 180),
  order: z.coerce.number().int().min(0).default(0),
  offsetMinutesFromOrigin: z.coerce.number().int().min(0).default(0),
  distanceFromOriginKm: z.coerce.number().min(0).default(0),
});

export const routeCreateSchema = z.object({
  code: z.string().trim().min(2, 'Route code is required').max(20),
  name: z.string().trim().min(3, 'Route name is required').max(120),
  origin: place,
  destination: place,
  stops: z.array(stop).default([]),
  totalDistanceKm: z.coerce.number().min(0).max(3000).default(0),
  estimatedDurationMinutes: z.coerce.number().int().min(0).max(4320).default(0),
  status: z.enum(ROUTE_STATUS_VALUES).default('active'),
});

export const routeUpdateSchema = routeCreateSchema.partial();

// --- Trips -----------------------------------------------------------------

export const tripCreateSchema = z.object({
  routeId: objectId,
  busId: objectId,
  driverId: objectId,
  departureDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Departure date must look like 2026-12-31'),
  departureTime: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Departure time must look like 14:30'),
  fare: z.coerce.number().min(0, 'Fare cannot be negative').max(100000),
  boardingPoints: z.array(z.string().trim().max(60)).default([]),
  droppingPoints: z.array(z.string().trim().max(60)).default([]),
  status: z.enum(TRIP_EDITABLE_STATUS_VALUES).default('scheduled'),
});

export const tripUpdateSchema = tripCreateSchema.partial();
export const tripStatusSchema = z.object({ status: z.enum(TRIP_EDITABLE_STATUS_VALUES) });
export const tripCancelSchema = z.object({
  reason: z.string().trim().min(3, 'Please give a reason').max(300),
});

// --- Counters --------------------------------------------------------------

export const counterCreateSchema = z.object({
  code: z.string().trim().min(2, 'Counter code is required').max(20),
  name: z.string().trim().min(3, 'Counter name is required').max(100),
  branchName: z.string().trim().max(100).default(''),
  address: z
    .object({
      street: z.string().trim().max(200).default(''),
      city: z.string().trim().max(80).default(''),
      division: z.string().trim().max(80).default(''),
      lat: coordinate(-90, 90),
      lng: coordinate(-180, 180),
    })
    .default({}),
  phone: z
    .union([phone, z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
  email: optionalEmail,
  commissionPercent: z.coerce.number().min(0).max(100).default(0),
  status: z.enum(COUNTER_STATUS_VALUES).default('active'),
});

export const counterUpdateSchema = counterCreateSchema.partial();

// --- Users -----------------------------------------------------------------

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot be longer than 72 characters')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/\d/, 'Password must contain at least one number'),
  role: z.enum(ROLE_VALUES),
  counterId: optionalObjectId,
});

export const userStatusSchema = z.object({ status: z.enum(USER_STATUS_VALUES) });

export const userRoleSchema = z.object({
  role: z.enum(ROLE_VALUES),
  counterId: optionalObjectId,
});

// --- Settings --------------------------------------------------------------

export const settingsUpdateSchema = z.object({
  cancellationPolicy: z
    .object({
      freeCancelHours: z.coerce.number().min(0).max(168),
      halfRefundHours: z.coerce.number().min(0).max(168),
      halfRefundPercent: z.coerce.number().min(0).max(100),
      noRefundPercent: z.coerce.number().min(0).max(100),
    })
    .partial()
    .optional(),
  booking: z
    .object({
      holdMinutes: z.coerce.number().int().min(1).max(15),
      maxSeatsPerBooking: z.coerce.number().int().min(1).max(20),
      advanceBookingDays: z.coerce.number().int().min(1).max(365),
      passengerSelfCancel: z.boolean(),
    })
    .partial()
    .optional(),
  notifications: z
    .object({
      emailEnabled: z.boolean(),
      smsEnabled: z.boolean(),
      mockMode: z.boolean(),
    })
    .partial()
    .optional(),
  payments: z
    .object({
      onlineEnabled: z.boolean(),
      sandbox: z.boolean(),
    })
    .partial()
    .optional(),
  localization: z
    .object({
      defaultLanguage: z.enum(['bn', 'en']),
      ticketLanguages: z.array(z.enum(['bn', 'en'])).min(1),
    })
    .partial()
    .optional(),
  ticket: z
    .object({
      headerText: z.string().trim().max(120),
      footerText: z.string().trim().max(200),
      termsEn: z.string().trim().max(500),
      termsBn: z.string().trim().max(500),
    })
    .partial()
    .optional(),
});

/** Admin refund workflow: approve, reject, or mark the money as actually sent. */
export const refundReviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'process'], {
    error: 'Choose approve, reject or process',
  }),
  refundMethod: z.enum(REFUND_METHOD_VALUES).optional(),
  refundTranId: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(300).optional(),
});

export const cancellationQuerySchema = z.object({
  refundStatus: z.enum(REFUND_STATUS_VALUES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * Reports are read-only but still bounded: a date must look like a date, and the
 * export filter only accepts values the schema actually stores.
 */
export const reportQuerySchema = z.object({
  from: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-01')
    .optional(),
  to: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-30')
    .optional(),
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled', 'expired']).optional(),
  channel: z.enum(['online', 'counter']).optional(),
});
