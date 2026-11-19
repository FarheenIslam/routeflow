import { z } from 'zod';

/**
 * Client-side rules for the admin forms. They mirror server/src/validators/
 * admin.validator.js closely enough to catch mistakes early, but the server stays
 * the authority: any rule it enforces extra is still reported on the field.
 *
 * Each factory takes the admin namespace translator, so messages follow the
 * Bangla/English switch like the rest of the UI.
 */

const BUS_TYPES = ['AC', 'NON_AC', 'AC_SLEEPER', 'DOUBLE_DECKER', 'HIACE'];
const BUS_STATUSES = ['active', 'maintenance', 'inactive'];
const DRIVER_STATUSES = ['active', 'on_leave', 'inactive'];
const TRIP_STATUSES = ['scheduled', 'started', 'at_stop', 'completed', 'cancelled', 'delayed'];

const phone = (t) =>
  z
    .string()
    .trim()
    .regex(/^01[3-9]\d{8}$/, t('validation.phone'));

const optionalEmail = (t) =>
  z
    .string()
    .trim()
    .refine((value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value), {
      message: t('validation.email'),
    });

const number = (t, min = 0, max = 1_000_000) =>
  z.coerce
    .number({ message: t('validation.number') })
    .min(min, t('validation.min', { min }))
    .max(max, t('validation.max', { max }));

export const createBusFormSchema = (t) =>
  z.object({
    busNumber: z.string().trim().min(3, t('validation.min', { min: 3 })).max(24, t('validation.max', { max: 24 })),
    operatorName: z.string().trim().min(2, t('validation.min', { min: 2 })).max(80),
    busType: z.enum(BUS_TYPES),
    status: z.enum(BUS_STATUSES),
    rows: number(t, 1, 20),
    columns: number(t, 1, 6),
    aisleAfterColumn: number(t, 1, 5),
    seatPrefix: z.string().trim().max(2, t('validation.max', { max: 2 })),
    disabledSeats: z.string().trim(),
  });

export const createDriverFormSchema = (t) =>
  z
    .object({
      name: z.string().trim().min(2, t('validation.min', { min: 2 })).max(80),
      phone: phone(t),
      email: optionalEmail(t),
      licenseNumber: z.string().trim().min(3, t('validation.min', { min: 3 })).max(40),
      licenseExpiry: z.string().trim(),
      assignedBusId: z.string(),
      address: z.string().trim().max(200),
      status: z.enum(DRIVER_STATUSES),
      createLogin: z.boolean(),
      loginEmail: optionalEmail(t),
      loginPassword: z.string(),
    })
    .superRefine((values, context) => {
      if (!values.createLogin) return;
      if (!values.loginEmail) {
        context.addIssue({
          code: 'custom',
          path: ['loginEmail'],
          message: t('validation.required'),
        });
      }
      if (values.loginPassword.length < 8) {
        context.addIssue({
          code: 'custom',
          path: ['loginPassword'],
          message: t('validation.passwordMin'),
        });
      }
    });

export const createRouteFormSchema = (t) =>
  z.object({
    code: z.string().trim().min(2, t('validation.min', { min: 2 })).max(20),
    name: z.string().trim().min(3, t('validation.min', { min: 3 })).max(120),
    originName: z.string().trim().min(2, t('validation.min', { min: 2 })).max(80),
    originCity: z.string().trim().max(80),
    destinationName: z.string().trim().min(2, t('validation.min', { min: 2 })).max(80),
    destinationCity: z.string().trim().max(80),
    totalDistanceKm: number(t, 0, 3000),
    estimatedDurationMinutes: number(t, 0, 4320),
    stopsText: z.string().trim(),
    status: z.enum(['active', 'inactive']),
  });

export const createTripFormSchema = (t) =>
  z.object({
    routeId: z.string().min(1, t('validation.select')),
    busId: z.string().min(1, t('validation.select')),
    driverId: z.string().min(1, t('validation.select')),
    departureDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, t('validation.date')),
    departureTime: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, t('validation.time')),
    fare: number(t, 0, 100_000),
    boardingPoints: z.string().trim(),
    droppingPoints: z.string().trim(),
    status: z.enum(TRIP_STATUSES),
  });

export const createCancelTripSchema = (t) =>
  z.object({
    reason: z.string().trim().min(3, t('validation.min', { min: 3 })).max(300),
  });

export const createCounterFormSchema = (t) =>
  z.object({
    code: z.string().trim().min(2, t('validation.min', { min: 2 })).max(20),
    name: z.string().trim().min(3, t('validation.min', { min: 3 })).max(100),
    branchName: z.string().trim().max(100),
    street: z.string().trim().max(200),
    city: z.string().trim().max(80),
    division: z.string().trim().max(80),
    phone: z
      .string()
      .trim()
      .refine((value) => value === '' || /^01[3-9]\d{8}$/.test(value), {
        message: t('validation.phone'),
      }),
    email: optionalEmail(t),
    commissionPercent: number(t, 0, 100),
    status: z.enum(['active', 'inactive']),
  });

export const createStaffFormSchema = (t) =>
  z
    .object({
      name: z.string().trim().min(2, t('validation.min', { min: 2 })).max(80),
      email: z.string().trim().min(1, t('validation.required')).email(t('validation.email')),
      phone: phone(t),
      password: z
        .string()
        .min(8, t('validation.passwordMin'))
        .regex(/[A-Za-z]/, t('validation.passwordLetter'))
        .regex(/\d/, t('validation.passwordNumber')),
      role: z.enum(['ADMIN', 'COUNTER']),
      counterId: z.string(),
    })
    .superRefine((values, context) => {
      if (values.role === 'COUNTER' && !values.counterId) {
        context.addIssue({
          code: 'custom',
          path: ['counterId'],
          message: t('validation.select'),
        });
      }
    });

export const createSettingsFormSchema = (t) =>
  z
    .object({
      cancellationPolicy: z.object({
        freeCancelHours: number(t, 0, 168),
        halfRefundHours: number(t, 0, 168),
        halfRefundPercent: number(t, 0, 100),
        noRefundPercent: number(t, 0, 100),
      }),
      booking: z.object({
        holdMinutes: number(t, 1, 15),
        maxSeatsPerBooking: number(t, 1, 20),
        advanceBookingDays: number(t, 1, 365),
        passengerSelfCancel: z.boolean(),
      }),
      notifications: z.object({
        emailEnabled: z.boolean(),
        smsEnabled: z.boolean(),
        mockMode: z.boolean(),
      }),
      payments: z.object({
        onlineEnabled: z.boolean(),
        sandbox: z.boolean(),
      }),
      localization: z.object({
        defaultLanguage: z.enum(['bn', 'en']),
        ticketLanguages: z.array(z.enum(['bn', 'en'])).min(1, t('validation.atLeastOne')),
      }),
      ticket: z.object({
        headerText: z.string().trim().max(120),
        footerText: z.string().trim().max(200),
        termsEn: z.string().trim().max(500),
        termsBn: z.string().trim().max(500),
      }),
    })
    .superRefine((values, context) => {
      if (values.cancellationPolicy.freeCancelHours <= values.cancellationPolicy.halfRefundHours) {
        context.addIssue({
          code: 'custom',
          path: ['cancellationPolicy', 'freeCancelHours'],
          message: t('settings.policyOrderError'),
        });
      }
    });

/** "Cumilla, 120, 100" per line → route stops with a stable order. */
export function parseStops(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [name, offsetMinutes = 0, distanceKm = 0] = line.split(',').map((part) => part.trim());
      return {
        name,
        order: index,
        offsetMinutesFromOrigin: Number(offsetMinutes) || 0,
        distanceFromOriginKm: Number(distanceKm) || 0,
      };
    })
    .filter((stop) => stop.name.length > 0);
}

export function stopsToText(stops = []) {
  return stops
    .map(
      (stop) =>
        `${stop.name}, ${stop.offsetMinutesFromOrigin ?? 0}, ${stop.distanceFromOriginKm ?? 0}`,
    )
    .join('\n');
}

export function splitPoints(text) {
  return text
    .split(',')
    .map((point) => point.trim())
    .filter(Boolean);
}
