import { z } from 'zod';

/**
 * Driver console validation.
 * Manual positions are checked here so a malformed coordinate cannot reach the
 * location history — there is no device to blame for bad data.
 */

export const driverTripStatusSchema = z.object({
  status: z.enum(['started', 'at_stop', 'completed', 'delayed'], {
    error: 'Choose a valid trip status',
  }),
  note: z.string().trim().max(200).optional(),
});

export const driverLocationSchema = z.object({
  lat: z.coerce.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  lng: z.coerce.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  note: z.string().trim().max(200).optional(),
  currentStopIndex: z.coerce.number().int().min(0).max(50).optional(),
  atStop: z.coerce.boolean().optional(),
});

export const driverTripParamsSchema = z.object({
  id: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'That trip identifier is not valid'),
});
