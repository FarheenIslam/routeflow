import Bus from '../../models/Bus.js';
import Trip from '../../models/Trip.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { containsRegex, paginated, parsePagination } from '../../utils/query.js';

export const listBuses = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.busType) filter.busType = req.query.busType;
  if (req.query.search) {
    filter.$or = [
      { busNumber: containsRegex(req.query.search) },
      { operatorName: containsRegex(req.query.search) },
    ];
  }

  const [items, total] = await Promise.all([
    Bus.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Bus.countDocuments(filter),
  ]);

  res.json({ success: true, message: 'Buses', data: paginated(items, total, page, limit) });
});

export const getBus = asyncHandler(async (req, res) => {
  const bus = await Bus.findById(req.params.id).lean();
  if (!bus) throw ApiError.notFound('Bus not found');
  res.json({ success: true, message: 'Bus', data: { bus } });
});

export const createBus = asyncHandler(async (req, res) => {
  const bus = await Bus.create({ ...req.body, createdBy: req.userId });
  res.status(201).json({ success: true, message: 'Bus added', data: { bus } });
});

export const updateBus = asyncHandler(async (req, res) => {
  const bus = await Bus.findById(req.params.id);
  if (!bus) throw ApiError.notFound('Bus not found');

  // A document save (not findByIdAndUpdate) is deliberate: only document
  // middleware runs the pre-validate hook that recomputes totalSeats, so a
  // changed seat layout would otherwise leave the seat count stale.
  const { seatLayout, ...rest } = req.body;
  bus.set(rest);
  if (seatLayout) {
    bus.set('seatLayout', { ...(bus.seatLayout?.toObject() ?? {}), ...seatLayout });
  }

  await bus.save();
  res.json({ success: true, message: 'Bus updated', data: { bus } });
});

export const updateBusStatus = asyncHandler(async (req, res) => {
  const bus = await Bus.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { new: true },
  );
  if (!bus) throw ApiError.notFound('Bus not found');
  res.json({ success: true, message: 'Bus status updated', data: { bus } });
});

/**
 * Buses referenced by trips are never deleted — that would orphan the trip
 * history. Deactivating keeps records intact.
 */
export const deleteBus = asyncHandler(async (req, res) => {
  const trips = await Trip.countDocuments({ busId: req.params.id });
  if (trips > 0) {
    throw new ApiError(
      409,
      `This bus is used by ${trips} trip(s). Set its status to "inactive" instead of deleting it.`,
    );
  }

  const deleted = await Bus.findByIdAndDelete(req.params.id);
  if (!deleted) throw ApiError.notFound('Bus not found');
  res.json({ success: true, message: 'Bus deleted', data: null });
});
