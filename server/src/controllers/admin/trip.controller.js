import Trip from '../../models/Trip.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { containsRegex, dhakaDateTime, paginated, parsePagination } from '../../utils/query.js';
import {
  cancelTrip,
  createTrip,
  setTripStatus,
  tripPopulate,
  updateTrip,
} from '../../services/trip.service.js';

export const listTrips = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.routeId) filter.routeId = req.query.routeId;
  if (req.query.busId) filter.busId = req.query.busId;
  if (req.query.driverId) filter.driverId = req.query.driverId;
  if (req.query.search) filter.tripCode = containsRegex(req.query.search);

  if (req.query.from) {
    filter.departureAt = { ...(filter.departureAt || {}), $gte: dhakaDateTime(req.query.from, '00:00') };
  }
  if (req.query.to) {
    filter.departureAt = { ...(filter.departureAt || {}), $lte: dhakaDateTime(req.query.to, '23:59') };
  }

  const [items, total] = await Promise.all([
    Trip.find(filter)
      .populate(tripPopulate)
      .sort({ departureAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Trip.countDocuments(filter),
  ]);

  res.json({ success: true, message: 'Trips', data: paginated(items, total, page, limit) });
});

export const getTrip = asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.id).populate(tripPopulate).lean();
  if (!trip) throw ApiError.notFound('Trip not found');
  res.json({ success: true, message: 'Trip', data: { trip } });
});

export const postTrip = asyncHandler(async (req, res) => {
  const trip = await createTrip(req.body, req.userId);
  await trip.populate(tripPopulate);
  res.status(201).json({ success: true, message: 'Trip scheduled', data: { trip } });
});

export const patchTrip = asyncHandler(async (req, res) => {
  const trip = await updateTrip(req.params.id, req.body);
  await trip.populate(tripPopulate);
  res.json({ success: true, message: 'Trip updated', data: { trip } });
});

export const patchTripStatus = asyncHandler(async (req, res) => {
  const trip = await setTripStatus(req.params.id, req.body.status);
  res.json({ success: true, message: 'Trip status updated', data: { trip } });
});

export const postTripCancel = asyncHandler(async (req, res) => {
  const trip = await cancelTrip(req.params.id, req.body.reason);
  res.json({ success: true, message: 'Trip cancelled', data: { trip } });
});
