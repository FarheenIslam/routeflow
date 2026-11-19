import { z } from 'zod';

/** Same rule as the server: a Bangladeshi mobile number, digits only. */
export const BD_PHONE_PATTERN = /^01[3-9]\d{8}$/;

const optionalText = (schema) =>
  z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional());

/**
 * Passenger details, shared by the online checkout and the counter sale.
 * Messages come from i18n so validation is readable in Bangla too.
 */
export function createPassengerSchema(t) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(2, t('passenger.errors.name'))
      .max(80, t('passenger.errors.nameLong')),
    phone: z.string().trim().regex(BD_PHONE_PATTERN, t('passenger.errors.phone')),
    email: optionalText(z.string().trim().email(t('passenger.errors.email'))),
    gender: optionalText(z.enum(['male', 'female', 'other'])),
    age: z.preprocess(
      (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
      z
        .coerce.number()
        .int(t('passenger.errors.age'))
        .min(0, t('passenger.errors.age'))
        .max(120, t('passenger.errors.age'))
        .optional(),
    ),
  });
}

/** Ticket lookup needs both halves: the number alone is not enough. */
export function createLookupSchema(t) {
  return z.object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^BB-[A-Z0-9]{6}$/, t('lookup.errors.code')),
    phone: z.string().trim().regex(BD_PHONE_PATTERN, t('passenger.errors.phone')),
  });
}
