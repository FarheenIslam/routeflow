import { sweepExpiredHolds } from '../services/seat.service.js';
import { expireStaleBookings } from '../services/booking.service.js';
import { logger } from '../config/logger.js';

/**
 * Expired seat holds are already invisible to every availability query, so this
 * job is about keeping the data honest: delete dead rows and recount the trip
 * counters they belonged to.
 *
 * 30 seconds is a compromise: a seat is never locked longer than it should be,
 * and the sweep is one indexed query on a tiny collection.
 */
export function startHoldSweeper(intervalMs = 30_000) {
  const timer = setInterval(async () => {
    try {
      const result = await sweepExpiredHolds();
      if (result.removed > 0) {
        logger.info(
          `Hold sweeper removed ${result.removed} expired hold(s) on ${result.trips} trip(s).`,
        );
      }

      // Unpaid gateway bookings keep their seats only until their payment
      // window ends. Cash reservations are exempt: staff collect those.
      const bookings = await expireStaleBookings();
      if (bookings.expired > 0) {
        logger.info(
          `Booking sweeper expired ${bookings.expired} unpaid ticket(s) and released ${bookings.released} seat(s).`,
        );
      }
    } catch (error) {
      logger.error(`Hold sweeper failed: ${error.message}`);
    }
  }, intervalMs);

  // Never keep the process alive just for the sweeper (tests, scripts).
  timer.unref?.();
  return timer;
}
