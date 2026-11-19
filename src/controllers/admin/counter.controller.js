import Counter from '../../models/Counter.js';
import User from '../../models/User.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { containsRegex, paginated, parsePagination } from '../../utils/query.js';

export const listCounters = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    filter.$or = [
      { code: containsRegex(req.query.search) },
      { name: containsRegex(req.query.search) },
      { branchName: containsRegex(req.query.search) },
      { 'address.city': containsRegex(req.query.search) },
    ];
  }

  const [items, total] = await Promise.all([
    Counter.find(filter)
      .populate('staffUserIds', 'name email role status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Counter.countDocuments(filter),
  ]);

  res.json({ success: true, message: 'Counters', data: paginated(items, total, page, limit) });
});

export const getCounter = asyncHandler(async (req, res) => {
  const counter = await Counter.findById(req.params.id)
    .populate('staffUserIds', 'name email role status')
    .lean();
  if (!counter) throw ApiError.notFound('Counter not found');
  res.json({ success: true, message: 'Counter', data: { counter } });
});

export const createCounter = asyncHandler(async (req, res) => {
  const counter = await Counter.create({ ...req.body, createdBy: req.userId });
  res.status(201).json({ success: true, message: 'Counter created', data: { counter } });
});

export const updateCounter = asyncHandler(async (req, res) => {
  const counter = await Counter.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!counter) throw ApiError.notFound('Counter not found');
  res.json({ success: true, message: 'Counter updated', data: { counter } });
});

/**
 * Assigned staff are released before the counter is removed, so nobody keeps a
 * counterId that no longer exists.
 */
export const deleteCounter = asyncHandler(async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!counter) throw ApiError.notFound('Counter not found');

  if (counter.staffUserIds.length > 0) {
    throw new ApiError(
      409,
      `This counter still has ${counter.staffUserIds.length} staff member(s). Reassign or suspend them first.`,
    );
  }

  await User.updateMany({ counterId: counter._id }, { $set: { counterId: null } });
  await counter.deleteOne();

  res.json({ success: true, message: 'Counter deleted', data: null });
});
