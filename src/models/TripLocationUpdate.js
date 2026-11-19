import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * TripLocationUpdates — manual position reports from the driver console.
 *
 * This is deliberately manual (`isManual: true`): there is no GPS device in the
 * system, so the driver taps a stop and optionally sends coordinates. The TTL
 * index keeps 90 days of history, which is enough for a dispute and small enough
 * for a free Atlas tier.
 */
const tripLocationUpdateSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    driverId: { type: Schema.Types.ObjectId, ref: 'Driver', required: true, index: true },

    tripStatusAtReport: { type: String, required: true, trim: true },
    currentStopIndex: { type: Number, min: 0, default: null },
    currentStopName: { type: String, trim: true, maxlength: 120, default: null },
    nextStopName: { type: String, trim: true, maxlength: 120, default: null },
    /** True when the driver reports being at a stop rather than between stops. */
    atStop: { type: Boolean, default: false },
    betweenStops: { type: Boolean, default: false },

    location: {
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 },
    },
    note: { type: String, trim: true, maxlength: 200, default: null },
    isManual: { type: Boolean, default: true },
    reportedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false },
);

tripLocationUpdateSchema.index({ tripId: 1, reportedAt: -1 });
/** History is disposable after 90 days. */
tripLocationUpdateSchema.index({ reportedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const TripLocationUpdate =
  mongoose.models.TripLocationUpdate ||
  mongoose.model('TripLocationUpdate', tripLocationUpdateSchema);

export default TripLocationUpdate;
