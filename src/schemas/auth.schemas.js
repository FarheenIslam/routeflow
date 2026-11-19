import { z } from 'zod';

/**
 * Client-side validation mirrors the server rules exactly (server/src/validators/
 * auth.validator.js). The server is still the authority — this only saves a
 * round-trip and shows messages next to the right field.
 *
 * Each factory takes `t` so messages are translated into the active language.
 */

const email = (t) =>
  z
    .string()
    .trim()
    .min(1, t('validation.required'))
    .email(t('validation.email'));

const phone = (t) =>
  z
    .string()
    .trim()
    .min(1, t('validation.required'))
    .regex(/^01[3-9]\d{8}$/, t('validation.phone'));

const strongPassword = (t) =>
  z
    .string()
    .min(8, t('validation.passwordMin'))
    .max(72, t('validation.passwordMax'))
    .regex(/[A-Za-z]/, t('validation.passwordLetter'))
    .regex(/\d/, t('validation.passwordNumber'));

export const createLoginSchema = (t) =>
  z.object({
    identifier: z.string().trim().min(5, t('validation.identifier')),
    password: z.string().min(1, t('validation.passwordRequired')),
  });

export const createRegisterSchema = (t) =>
  z
    .object({
      name: z.string().trim().min(2, t('validation.nameMin')).max(80, t('validation.nameMax')),
      email: email(t),
      phone: phone(t),
      password: strongPassword(t),
      confirmPassword: z.string().min(1, t('validation.required')),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('validation.passwordMatch'),
      path: ['confirmPassword'],
    });

export const createForgotPasswordSchema = (t) =>
  z.object({
    email: email(t),
  });

export const createResetPasswordSchema = (t) =>
  z
    .object({
      password: strongPassword(t),
      confirmPassword: z.string().min(1, t('validation.required')),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('validation.passwordMatch'),
      path: ['confirmPassword'],
    });

export const createChangePasswordSchema = (t) =>
  z
    .object({
      currentPassword: z.string().min(1, t('validation.passwordRequired')),
      newPassword: strongPassword(t),
      confirmPassword: z.string().min(1, t('validation.required')),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t('validation.passwordMatch'),
      path: ['confirmPassword'],
    });
