import crypto from 'node:crypto';
import Driver from '../../models/Driver.js';
import User from '../../models/User.js';
import Trip from '../../models/Trip.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { containsRegex, paginated, parsePagination } from '../../utils/query.js';
import { ROLES, USER_STATUS } from '../../config/constants.js';

export const listDrivers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.assignedBusId) filter.assignedBusId = req.query.assignedBusId;
  if (req.query.search) {
    filter.$or = [
      { name: containsRegex(req.query.search) },
      { phone: containsRegex(req.query.search) },
      { licenseNumber: containsRegex(req.query.search) },
    ];
  }

  const [items, total] = await Promise.all([
    Driver.find(filter)
      .populate('assignedBusId', 'busNumber operatorName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Driver.countDocuments(filter),
  ]);

  res.json({ success: true, message: 'Drivers', data: paginated(items, total, page, limit) });
});

export const getDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.params.id)
    .populate('assignedBusId', 'busNumber operatorName')
    .lean();
  if (!driver) throw ApiError.notFound('Driver not found');
  res.json({ success: true, message: 'Driver', data: { driver } });
});

/**
 * Creates the driver profile, and optionally a DRIVER login so the person can
 * use the driver portal. If the login cannot be created, the profile is rolled
 * back — no half-linked records.
 */
export const createDriver = asyncHandler(async (req, res) => {
  const { createLogin, loginEmail, loginPassword, ...driverData } = req.body;

  if (createLogin) {
    if (!loginEmail) {
      throw new ApiError(400, 'A login email is required', [
        { field: 'loginEmail', message: 'Enter an email for the driver login' },
      ]);
    }
    if (!loginPassword) {
      throw new ApiError(400, 'A starting password is required', [
        { field: 'loginPassword', message: 'Set a starting password (min 8 characters)' },
      ]);
    }
    const taken = await User.findOne({ email: loginEmail.toLowerCase() }).lean();
    if (taken) {
      throw new ApiError(409, 'That email already has an account', [
        { field: 'loginEmail', message: 'This email is already registered' },
      ]);
    }
  }

  const driver = await Driver.create({
    ...driverData,
    email: driverData.email ?? (createLogin ? loginEmail.toLowerCase() : null),
    createdBy: req.userId,
  });

  if (!createLogin) {
    return res.status(201).json({
      success: true,
      message: 'Driver added',
      data: { driver, loginCreated: false },
    });
  }

  try {
    const user = await User.create({
      name: driver.name,
      email: loginEmail.toLowerCase(),
      phone: driver.phone,
      passwordHash: await User.hashPassword(loginPassword),
      role: ROLES.DRIVER,
      status: USER_STATUS.ACTIVE,
      driverId: driver._id,
      createdBy: req.userId,
    });

    driver.userId = user._id;
    await driver.save();

    return res.status(201).json({
      success: true,
      message: 'Driver added with a portal login',
      data: { driver, loginCreated: true },
    });
  } catch (error) {
    await Driver.deleteOne({ _id: driver._id });
    if (error.code === 11000) {
      throw new ApiError(409, 'That phone number already has an account');
    }
    throw error;
  }
});

export const updateDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!driver) throw ApiError.notFound('Driver not found');

  // Keep the linked login in step with the profile name.
  if (driver.userId && req.body.name) {
    await User.updateOne({ _id: driver.userId }, { $set: { name: driver.name } });
  }

  res.json({ success: true, message: 'Driver updated', data: { driver } });
});

export const deleteDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.params.id);
  if (!driver) throw ApiError.notFound('Driver not found');

  const trips = await Trip.countDocuments({ driverId: driver._id });
  if (trips > 0) {
    throw new ApiError(
      409,
      `This driver is assigned to ${trips} trip(s). Set the status to "inactive" instead of deleting.`,
    );
  }

  if (driver.userId) {
    // Remove the login too, otherwise a deleted driver could still sign in.
    await User.deleteOne({ _id: driver.userId });
  }
  await driver.deleteOne();

  res.json({ success: true, message: 'Driver deleted', data: null });
});

/** Generates a starter password for a driver login (returned once). */
export function generatePassword() {
  return `Bb-${crypto.randomBytes(4).toString('base64url')}`;
}
