import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { holdCreateSchema, holdParamsSchema, holdReleaseQuerySchema } from '../validators/public.validator.js';
import { seatHoldLimiter } from '../middleware/rateLimit.js';
import {
  deleteHold,
  deleteSessionHolds,
  postHold,
} from '../controllers/hold.controller.js';

const router = Router();

/**
 * Seat holds are public (a passenger may choose seats before signing up), but
 * they are rate limited because each hold writes to the database and briefly
 * removes a seat from sale.
 */
router.post('/', seatHoldLimiter, validate({ body: holdCreateSchema }), postHold);
router.delete('/', validate({ query: holdReleaseQuerySchema }), deleteSessionHolds);
router.delete('/:id', validate({ params: holdParamsSchema }), deleteHold);

export default router;
