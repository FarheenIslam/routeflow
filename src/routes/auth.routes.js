import { Router } from 'express';
import {
  forgotPassword,
  login,
  logout,
  me,
  register,
  resetPasswordWithToken,
  updatePassword,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  loginLimiter,
  passwordResetLimiter,
  registerLimiter,
} from '../middleware/rateLimit.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  resetTokenParamsSchema,
} from '../validators/auth.validator.js';

const router = Router();

router.post('/register', registerLimiter, validate({ body: registerSchema }), register);
router.post('/login', loginLimiter, validate({ body: loginSchema }), login);
router.post('/logout', logout);

router.get('/me', authenticate, me);
router.patch(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  updatePassword,
);

router.post(
  '/forgot-password',
  passwordResetLimiter,
  validate({ body: forgotPasswordSchema }),
  forgotPassword,
);
router.post(
  '/reset-password/:token',
  passwordResetLimiter,
  validate({ params: resetTokenParamsSchema, body: resetPasswordSchema }),
  resetPasswordWithToken,
);

export default router;
