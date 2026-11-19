import { z } from 'zod';

/**
 * Server-side validation. The React forms use the same rules, but the server
 * never trusts the browser — this file is the authority.
 */

const email = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .min(5, 'Email is too short')
  .max(120, 'Email is too long')
  .email('Please provide a valid email address');

const phone = z
  .string({ required_error: 'Phone number is required' })
  .trim()
  .regex(
    /^01[3-9]\d{8}$/,
    'Phone must be a valid Bangladeshi number (e.g. 01712345678)',
  );

/**
 * bcrypt silently ignores anything past 72 bytes, so we cap the length here
 * instead of letting a user believe a longer password is being used.
 */
const password = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password cannot be longer than 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/\d/, 'Password must contain at least one number');

export const registerSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(80, 'Name cannot be longer than 80 characters'),
  email,
  phone,
  password,
});

export const loginSchema = z.object({
  identifier: z
    .string({ required_error: 'Email or phone number is required' })
    .trim()
    .min(5, 'Enter your email or phone number')
    .max(120, 'That value is too long'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
    .max(72, 'Password cannot be longer than 72 characters'),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ password });

export const resetTokenParamsSchema = z.object({
  token: z
    .string({ required_error: 'Reset token is missing' })
    .min(20, 'This reset link is not valid')
    .max(200, 'This reset link is not valid'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'Current password is required' })
      .min(1, 'Current password is required'),
    newPassword: password,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });
