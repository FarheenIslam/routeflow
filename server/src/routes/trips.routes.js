import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  getTrip,
  getTripSeats,
  searchTrips,
} from '../controllers/trip.public.controller.js';
import { tripParamsSchema, tripSearchQuerySchema } from '../validators/public.validator.js';

const router = Router();

/** Public timetable. No session is required to look. */
router.get('/search', validate({ query: tripSearchQuerySchema }), searchTrips);
router.get('/:id/seats', validate({ params: tripParamsSchema }), getTripSeats);
router.get('/:id', validate({ params: tripParamsSchema }), getTrip);

export default router;
