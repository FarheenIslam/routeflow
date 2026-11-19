import User from '../../models/User.js';
import Counter from '../../models/Counter.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { containsRegex, paginated, parsePagination } from '../../utils/query.js';
import { ROLES, USER_STATUS } from '../../config/constants.js';

const SAFE_FIELDS = 'name email phone role status counterId createdAt lastLoginAt';

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    filter.$or = [
      { name: containsRegex(req.query.search) },
      { email: containsRegex(req.query.search) },
      { phone: containsRegex(req.query.search) },
    ];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select(SAFE_FIELDS)
      .populate('counterId', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  res.json({ success: true, message: 'Users', data: paginated(items, total, page, limit) });
});

/**
 * Staff accounts only. Passengers register themselves, and driver logins are
 * created from the Drivers page so the profile and the login stay linked.
 */
export const createStaffUser = asyncHandler(async (req, res) => {
  const { name, email, phone, password, role, counterId } = req.body;

  if (role === ROLES.PASSENGER) {
    throw new ApiError(400, 'Passengers create their own accounts', [
      { field: 'role', message: 'Choose ADMIN or COUNTER for a staff account' },
    ]);
  }
  if (role === ROLES.DRIVER) {
    throw new ApiError(400, 'Create driver logins from the Drivers page', [
      { field: 'role', message: 'Drivers are added with their profile and license' },
    ]);
  }

  if (role === ROLES.COUNTER && counterId) {
    const counter = await Counter.findById(counterId).lean();
    if (!counter) {
      throw new ApiError(400, 'That counter does not exist', [
        { field: 'counterId', message: 'Select an existing counter' },
      ]);
    }
  }

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    phone,
    passwordHash: await User.hashPassword(password),
    role,
    status: USER_STATUS.ACTIVE,
    counterId: role === ROLES.COUNTER ? counterId : null,
    createdBy: req.userId,
  });

  if (role === ROLES.COUNTER && counterId) {
    await Counter.updateOne({ _id: counterId }, { $addToSet: { staffUserIds: user._id } });
  }

  res.status(201).json({
    success: true,
    message: 'Staff account created',
    data: { user: user.toJSON() },
  });
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  if (String(user._id) === String(req.userId) && status !== USER_STATUS.ACTIVE) {
    throw ApiError.badRequest('You cannot suspend your own account');
  }

  if (user.role === ROLES.ADMIN && status !== USER_STATUS.ACTIVE) {
    const otherActiveAdmins = await User.countDocuments({
      role: ROLES.ADMIN,
      status: USER_STATUS.ACTIVE,
      _id: { $ne: user._id },
    });
    if (otherActiveAdmins === 0) {
      throw ApiError.conflict('At least one active admin must remain');
    }
  }

  await User.updateOne({ _id: user._id }, { $set: { status } });
  const updated = await User.findById(user._id).select(SAFE_FIELDS).lean();

  res.json({ success: true, message: 'User status updated', data: { user: updated } });
});

export const updateUserRole = asyncHandler(async (req, res) => {
  const { role, counterId = null } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  if (String(user._id) === String(req.userId)) {
    throw ApiError.badRequest('You cannot change your own role');
  }
  if (role === ROLES.DRIVER) {
    throw new ApiError(400, 'Driver logins are managed from the Drivers page', [
      { field: 'role', message: 'Add drivers from the Drivers page' },
    ]);
  }
  if (user.role === ROLES.ADMIN && role !== ROLES.ADMIN) {
    const otherActiveAdmins = await User.countDocuments({
      role: ROLES.ADMIN,
      status: USER_STATUS.ACTIVE,
      _id: { $ne: user._id },
    });
    if (otherActiveAdmins === 0) {
      throw ApiError.conflict('At least one admin must remain');
    }
  }
  if (role === ROLES.COUNTER && counterId) {
    const counter = await Counter.findById(counterId).lean();
    if (!counter) {
      throw new ApiError(400, 'That counter does not exist', [
        { field: 'counterId', message: 'Select an existing counter' },
      ]);
    }
  }

  // Leaving COUNTER frees the person from any counter staff list.
  await Counter.updateMany({ staffUserIds: user._id }, { $pull: { staffUserIds: user._id } });

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        role,
        counterId: role === ROLES.COUNTER ? counterId : null,
        tokenVersion: (user.tokenVersion ?? 0) + 1,
      },
    },
  );

  if (role === ROLES.COUNTER && counterId) {
    await Counter.updateOne({ _id: counterId }, { $addToSet: { staffUserIds: user._id } });
  }

  const updated = await User.findById(user._id).select(SAFE_FIELDS).lean();
  res.json({ success: true, message: 'User role updated', data: { user: updated } });
});
