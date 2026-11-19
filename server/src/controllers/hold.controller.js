import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { guestSessionId, readGuestSessionId } from '../middleware/session.js';
import {
  acquireHolds,
  releaseHold,
  releaseSessionSeats,
} from '../services/seat.service.js';

/**
 * POST /api/holds — lock seats for this browser.
 * No login required: the httpOnly `bb_sid` cookie identifies the guest session,
 * and the seats are the only thing being reserved.
 */
export const postHold = asyncHandler(async (req, res) => {
  const sessionId = guestSessionId(req, res);

  const hold = await acquireHolds({
    tripId: req.body.tripId,
    seatNumbers: req.body.seatNumbers,
    sessionId,
  });

  res.status(201).json({ success: true, message: 'Seats held', data: { hold } });
});

/** DELETE /api/holds/:id — release one seat the caller is holding. */
export const deleteHold = asyncHandler(async (req, res) => {
  const sessionId = readGuestSessionId(req);
  if (!sessionId) throw ApiError.notFound('Seat hold not found');

  const result = await releaseHold({ holdId: req.params.id, sessionId });
  res.json({ success: true, message: 'Seat released', data: result });
});

/**
 * DELETE /api/holds?tripId=… — release every seat this browser holds on a trip.
 * Used when a passenger leaves the seat map, and after a page refresh where the
 * individual hold ids are no longer in memory.
 */
export const deleteSessionHolds = asyncHandler(async (req, res) => {
  const sessionId = readGuestSessionId(req);
  if (!sessionId) {
    return res.json({
      success: true,
      message: 'No seat holds',
      data: { released: 0 },
    });
  }

  const result = await releaseSessionSeats({
    tripId: req.validatedQuery.tripId,
    sessionId,
  });

  return res.json({ success: true, message: 'Seat holds released', data: result });
});
