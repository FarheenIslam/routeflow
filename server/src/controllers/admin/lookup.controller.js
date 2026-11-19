import Bus from '../../models/Bus.js';
import Driver from '../../models/Driver.js';
import Route from '../../models/Route.js';
import Counter from '../../models/Counter.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { BUS_STATUS, DRIVER_STATUS, ROUTE_STATUS, COUNTER_STATUS } from '../../config/constants.js';

/**
 * Small lists for <select> inputs. Separate from the main list endpoints so the
 * admin forms never download full records just to show names.
 */
export const getLookups = asyncHandler(async (_req, res) => {
  const [buses, drivers, routes, counters] = await Promise.all([
    Bus.find({ status: BUS_STATUS.ACTIVE })
      .select('busNumber operatorName busType totalSeats')
      .sort({ busNumber: 1 })
      .lean(),
    Driver.find({ status: DRIVER_STATUS.ACTIVE })
      .select('name phone assignedBusId')
      .sort({ name: 1 })
      .lean(),
    Route.find({ status: ROUTE_STATUS.ACTIVE })
      .select('code name origin.name destination.name estimatedDurationMinutes')
      .sort({ code: 1 })
      .lean(),
    Counter.find({ status: COUNTER_STATUS.ACTIVE })
      .select('code name branchName')
      .sort({ name: 1 })
      .lean(),
  ]);

  res.json({
    success: true,
    message: 'Lookup lists',
    data: { buses, drivers, routes, counters },
  });
});
