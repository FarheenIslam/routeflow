import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getDriverTrip,
  listDriverHistory,
  listDriverLocations,
  listDriverTrips,
  reportDriverLocation,
  updateTripStatus,
} from '../services/driver.service.js';

/** GET /api/driver/trips?date=YYYY-MM-DD — today's assigned trips. */
export const getDriverTrips = asyncHandler(async (req, res) => {
  const data = await listDriverTrips(req.user, { date: req.query.date });
  res.json({ success: true, message: 'Your trips', data });
});

/** GET /api/driver/trips/:id — one trip with its passenger manifest. */
export const getDriverTripDetail = asyncHandler(async (req, res) => {
  const trip = await getDriverTrip(req.user, req.params.id);
  res.json({ success: true, message: 'Trip', data: { trip } });
});

/** POST /api/driver/trips/:id/status — start / at stop / complete. */
export const postDriverTripStatus = asyncHandler(async (req, res) => {
  const trip = await updateTripStatus({
    user: req.user,
    tripId: req.params.id,
    status: req.body.status,
    note: req.body.note ?? null,
  });

  res.json({ success: true, message: 'Trip status updated', data: { trip } });
});

/** POST /api/driver/trips/:id/location — a manual position report. */
export const postDriverLocation = asyncHandler(async (req, res) => {
  const location = await reportDriverLocation({
    user: req.user,
    tripId: req.params.id,
    lat: req.body.lat,
    lng: req.body.lng,
    note: req.body.note ?? null,
    currentStopIndex: req.body.currentStopIndex ?? null,
    atStop: req.body.atStop ?? false,
  });

  res.status(201).json({
    success: true,
    message: 'Location reported',
    data: { location },
  });
});

/** GET /api/driver/trips/:id/locations — recent reports for this trip. */
export const getDriverLocations = asyncHandler(async (req, res) => {
  const locations = await listDriverLocations(req.user, req.params.id);
  res.json({ success: true, message: 'Location history', data: { locations } });
});

/** GET /api/driver/history — recent completed trips. */
export const getDriverHistory = asyncHandler(async (req, res) => {
  const trips = await listDriverHistory(req.user);
  res.json({ success: true, message: 'Trip history', data: { trips } });
});
