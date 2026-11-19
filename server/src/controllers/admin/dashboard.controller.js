import Bus from '../../models/Bus.js';
import Driver from '../../models/Driver.js';
import Route from '../../models/Route.js';
import Trip from '../../models/Trip.js';
import Counter from '../../models/Counter.js';
import User from '../../models/User.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { dhakaDateTime } from '../../utils/query.js';
import { BUS_STATUS, DRIVER_STATUS, ROLES, TRIP_STATUS, USER_STATUS } from '../../config/constants.js';

/**
 * Dashboard payload in one request, so the admin home makes a single API call.
 *
 * Honest scope note: booking, revenue and cancellation figures need the Booking
 * and Payment collections from Phase 6. Rather than showing invented numbers,
 * this endpoint reports `revenueAvailable: false` and the UI labels those cards
 * accordingly.
 */
export const getDashboard = asyncHandler(async (_req, res) => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const startOfToday = dhakaDateTime(today, '00:00');
  const endOfToday = dhakaDateTime(today, '23:59');
  const weekAhead = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    totalBuses,
    activeBuses,
    totalDrivers,
    activeDrivers,
    totalRoutes,
    totalCounters,
    totalTrips,
    todayTrips,
    upcomingTrips,
    totalPassengers,
    activeStaff,
    tripsByStatus,
    fleetByType,
    upcomingWeek,
    nextTrips,
  ] = await Promise.all([
    Bus.countDocuments(),
    Bus.countDocuments({ status: BUS_STATUS.ACTIVE }),
    Driver.countDocuments(),
    Driver.countDocuments({ status: DRIVER_STATUS.ACTIVE }),
    Route.countDocuments(),
    Counter.countDocuments(),
    Trip.countDocuments(),
    Trip.countDocuments({ departureAt: { $gte: startOfToday, $lte: endOfToday } }),
    Trip.countDocuments({
      departureAt: { $gte: now },
      status: { $nin: [TRIP_STATUS.CANCELLED, TRIP_STATUS.COMPLETED] },
    }),
    User.countDocuments({ role: ROLES.PASSENGER }),
    User.countDocuments({ role: { $in: [ROLES.COUNTER, ROLES.DRIVER] }, status: USER_STATUS.ACTIVE }),
    Trip.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Bus.aggregate([
      { $group: { _id: '$busType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Trip.aggregate([
      {
        $match: {
          departureAt: { $gte: startOfToday, $lte: weekAhead },
          status: { $ne: TRIP_STATUS.CANCELLED },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$departureAt',
              timezone: 'Asia/Dhaka',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Trip.find({ departureAt: { $gte: startOfToday } })
      .sort({ departureAt: 1 })
      .limit(6)
      .populate('routeId', 'code name origin.name destination.name')
      .populate('busId', 'busNumber')
      .populate('driverId', 'name')
      .lean(),
  ]);

  res.json({
    success: true,
    message: 'Dashboard overview',
    data: {
      counts: {
        totalBuses,
        activeBuses,
        totalDrivers,
        activeDrivers,
        totalRoutes,
        totalCounters,
        totalTrips,
        todayTrips,
        upcomingTrips,
        totalPassengers,
        activeStaff,
      },
      tripsByStatus: tripsByStatus.map((row) => ({ status: row._id, count: row.count })),
      fleetByType: fleetByType.map((row) => ({ busType: row._id, count: row.count })),
      upcomingWeek: upcomingWeek.map((row) => ({ date: row._id, count: row.count })),
      nextTrips,
      revenueAvailable: false,
      generatedAt: new Date().toISOString(),
    },
  });
});
