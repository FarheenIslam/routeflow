import Route from '../../models/Route.js';
import Trip from '../../models/Trip.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { containsRegex, paginated, parsePagination } from '../../utils/query.js';

export const listRoutes = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    filter.$or = [
      { code: containsRegex(req.query.search) },
      { name: containsRegex(req.query.search) },
      { 'origin.name': containsRegex(req.query.search) },
      { 'destination.name': containsRegex(req.query.search) },
    ];
  }

  const [items, total] = await Promise.all([
    Route.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Route.countDocuments(filter),
  ]);

  res.json({ success: true, message: 'Routes', data: paginated(items, total, page, limit) });
});

export const getRoute = asyncHandler(async (req, res) => {
  const route = await Route.findById(req.params.id).lean();
  if (!route) throw ApiError.notFound('Route not found');
  res.json({ success: true, message: 'Route', data: { route } });
});

export const createRoute = asyncHandler(async (req, res) => {
  const route = await Route.create({ ...req.body, createdBy: req.userId });
  res.status(201).json({ success: true, message: 'Route created', data: { route } });
});

export const updateRoute = asyncHandler(async (req, res) => {
  const route = await Route.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!route) throw ApiError.notFound('Route not found');
  res.json({ success: true, message: 'Route updated', data: { route } });
});

export const deleteRoute = asyncHandler(async (req, res) => {
  const trips = await Trip.countDocuments({ routeId: req.params.id });
  if (trips > 0) {
    throw new ApiError(
      409,
      `This route is used by ${trips} trip(s). Set it to "inactive" instead of deleting it.`,
    );
  }

  const deleted = await Route.findByIdAndDelete(req.params.id);
  if (!deleted) throw ApiError.notFound('Route not found');
  res.json({ success: true, message: 'Route deleted', data: null });
});
