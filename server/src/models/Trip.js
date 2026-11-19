import mongoose from 'mongoose';
import { TRIP_STATUS, TRIP_STATUS_VALUES } from '../config/constants.js';

const { Schema } = mongoose;

/**
 * Trips collection: one scheduled departure of a bus on a route with a driver.
 *
 * `departureAt` is the single indexed instant every query uses (search, "today",
 * reports). `departureDate` and `departureTime` are kept for display and editing,
 * but availability logic never trusts them.
 */
const tripSchema = new Schema(
  {
    tripCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    routeId: { type: Schema.Types.ObjectId, ref: 'Route', required: true, index: true },
    busId: { type: Schema.Types.ObjectId, ref: 'Bus', required: true, index: true },
    driverId: { type: Schema.Types.ObjectId, ref: 'Driver', required: true, index: true },

    departureDate: { type: Date, required: true },
    departureTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Departure time must look like 14:30'],
    },
    departureAt: { type: Date, required: true },
    arrivalEstimateAt: { type: Date, default: null },

    fare: { type: Number, required: true, min: [0, 'Fare cannot be negative'] },
    boardingPoints: { type: [String], default: [] },
    droppingPoints: { type: [String], default: [] },

    status: {
      type: String,
      enum: { values: TRIP_STATUS_VALUES, message: 'Invalid trip status' },
      default: TRIP_STATUS.SCHEDULED,
    },
    /** Denormalised seat counters, maintained by the booking service later. */
    seatSummary: {
      total: { type: Number, default: 0, min: 0 },
      booked: { type: Number, default: 0, min: 0 },
      held: { type: Number, default: 0, min: 0 },
    },
    cancelReason: { type: String, trim: true, maxlength: 300, default: null },
    /** Filled by the driver console when the trip actually begins / ends. */
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

tripSchema.index({ departureAt: 1 });
tripSchema.index({ routeId: 1, departureAt: 1 });
tripSchema.index({ status: 1, departureAt: 1 });

/**
 * A bus or a driver cannot be on two live trips that start at the same moment.
 *
 * The unique indexes are partial: cancelled trips are excluded, so cancelling a
 * departure frees its slot for a replacement trip. The service-level conflict
 * check uses the same rule (`status: { $ne: 'cancelled' }`), and these indexes
 * are what actually prevents two simultaneous creates from both succeeding.
 */
const LIVE_TRIP_STATUSES = TRIP_STATUS_VALUES.filter(
  (status) => status !== TRIP_STATUS.CANCELLED,
);
const liveTripPartial = { status: { $in: LIVE_TRIP_STATUSES } };

tripSchema.index(
  { busId: 1, departureAt: 1 },
  { unique: true, name: 'uniq_bus_live_departure', partialFilterExpression: liveTripPartial },
);
tripSchema.index(
  { driverId: 1, departureAt: 1 },
  { unique: true, name: 'uniq_driver_live_departure', partialFilterExpression: liveTripPartial },
);

const Trip = mongoose.models.Trip || mongoose.model('Trip', tripSchema);

export default Trip;
