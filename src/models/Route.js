import mongoose from 'mongoose';
import { ROUTE_STATUS, ROUTE_STATUS_VALUES } from '../config/constants.js';

const { Schema } = mongoose;

const stopSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    lat: { type: Number, min: -90, max: 90, default: null },
    lng: { type: Number, min: -180, max: 180, default: null },
    order: { type: Number, required: true, min: 0 },
    offsetMinutesFromOrigin: { type: Number, default: 0, min: 0 },
    distanceFromOriginKm: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const placeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    city: { type: String, trim: true, maxlength: 80, default: '' },
    lat: { type: Number, min: -90, max: 90, default: null },
    lng: { type: Number, min: -180, max: 180, default: null },
  },
  { _id: false },
);

/**
 * Routes collection: origin → intermediate stops → destination.
 * Coordinates are optional but are what the Leaflet map (Phase 7) will draw.
 */
const routeSchema = new Schema(
  {
    code: {
      type: String,
      required: [true, 'Route code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: [20, 'Route code is too long'],
    },
    name: {
      type: String,
      required: [true, 'Route name is required'],
      trim: true,
      maxlength: [120, 'Route name is too long'],
    },
    origin: { type: placeSchema, required: true },
    destination: { type: placeSchema, required: true },
    stops: { type: [stopSchema], default: [] },
    totalDistanceKm: { type: Number, min: 0, max: 3000, default: 0 },
    estimatedDurationMinutes: { type: Number, min: 0, max: 4320, default: 0 },
    status: {
      type: String,
      enum: { values: ROUTE_STATUS_VALUES, message: 'Invalid route status' },
      default: ROUTE_STATUS.ACTIVE,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

routeSchema.index({ 'origin.city': 1, 'destination.city': 1 });
routeSchema.index({ status: 1 });
routeSchema.index({ name: 'text', 'origin.name': 'text', 'destination.name': 'text' });

routeSchema.pre('validate', function normaliseStops() {
  if (Array.isArray(this.stops) && this.stops.length > 0) {
    this.stops = this.stops
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((stop, index) => ({ ...(stop.toObject?.() ?? stop), order: index }));
  }
});

const Route = mongoose.models.Route || mongoose.model('Route', routeSchema);

export default Route;
