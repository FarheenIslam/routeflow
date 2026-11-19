import mongoose from 'mongoose';
import { BUS_STATUS, BUS_STATUS_VALUES, BUS_TYPE_VALUES } from '../config/constants.js';

const { Schema } = mongoose;

/**
 * Buses collection.
 *
 * The seat layout is data, not code: rows × columns defines the grid, and
 * `aisleAfterColumn` tells the seat map where the walking aisle sits. Total
 * seats are derived from the layout so the two can never disagree.
 */
const busSchema = new Schema(
  {
    busNumber: {
      type: String,
      required: [true, 'Bus number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: [24, 'Bus number is too long'],
    },
    operatorName: {
      type: String,
      required: [true, 'Operator name is required'],
      trim: true,
      maxlength: [80, 'Operator name is too long'],
    },
    busType: {
      type: String,
      enum: { values: BUS_TYPE_VALUES, message: 'Invalid bus type' },
      default: 'AC',
    },
    seatLayout: {
      rows: { type: Number, default: 10, min: 1, max: 20 },
      columns: { type: Number, default: 4, min: 1, max: 6 },
      aisleAfterColumn: { type: Number, default: 2, min: 1, max: 5 },
      seatPrefix: { type: String, default: 'A', trim: true, uppercase: true, maxlength: 2 },
      /** Flat 1-based indexes (row-major) of seats that do not exist, e.g. door space. */
      disabledSeats: { type: [Number], default: [] },
    },
    /** Derived: rows × columns − disabled seats. Read-only for clients. */
    totalSeats: { type: Number, min: 1, max: 120 },
    amenities: { type: [String], default: [] },
    status: {
      type: String,
      enum: { values: BUS_STATUS_VALUES, message: 'Invalid bus status' },
      default: BUS_STATUS.ACTIVE,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

busSchema.index({ status: 1, busType: 1 });
busSchema.index({ operatorName: 1 });

busSchema.pre('validate', function deriveTotalSeats() {
  const layout = this.seatLayout;
  // Missing rows/columns are reported by the schema's own required validators.
  if (!layout || !layout.rows || !layout.columns) return;

  const capacity = layout.rows * layout.columns;
  const disabled = new Set((layout.disabledSeats || []).map(Number));

  // Drop labels that fall outside the grid, then derive the real seat count.
  layout.disabledSeats = [...disabled].filter((seat) => seat >= 1 && seat <= capacity);
  this.totalSeats = capacity - layout.disabledSeats.length;

  if (this.totalSeats < 1) {
    this.invalidate('seatLayout.rows', 'A bus must have at least one seat');
  }
});

const Bus = mongoose.models.Bus || mongoose.model('Bus', busSchema);

export default Bus;
