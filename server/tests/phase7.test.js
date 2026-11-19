import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import Booking from '../src/models/Booking.js';
import Cancellation from '../src/models/Cancellation.js';
import Notification from '../src/models/Notification.js';
import SeatHold from '../src/models/SeatHold.js';
import SystemSetting from '../src/models/SystemSetting.js';
import Trip from '../src/models/Trip.js';
import TripLocationUpdate from '../src/models/TripLocationUpdate.js';
import { calculateRefund } from '../src/services/cancellation.service.js';
import { dhakaToday } from '../src/utils/query.js';
import {
  adminClient,
  asAdmin,
  browser,
  createUser,
  loginCookie,
} from './helpers.js';

const app = createApp();
const PASSENGER_PHONE = '01712345678';

function guest() {
  const agent = request.agent(app);
  return {
    get: (url) => browser(agent.get(url)),
    post: (url, body) => browser(agent.post(url)).send(body ?? {}),
  };
}

function futureDate(offsetDays = 10) {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

const suffix = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function passenger(overrides = {}) {
  return {
    name: 'Cancellation Passenger',
    phone: PASSENGER_PHONE,
    email: 'cancel@example.com',
    ...overrides,
  };
}

async function setupFleet({
  api,
  driverId,
  departureDate = futureDate(10),
  departureTime = '08:00',
  fare = 900,
} = {}) {
  let admin = api;
  if (!admin) admin = (await asAdmin(app)).api;

  const bus = (
    await admin.post('/api/admin/buses', {
      busNumber: `BUS-${suffix()}`,
      operatorName: 'Test Operator',
      busType: 'AC',
      seatLayout: { rows: 5, columns: 4, aisleAfterColumn: 2, seatPrefix: 'A' },
    })
  ).body.data.bus;

  const route = (
    await admin.post('/api/admin/routes', {
      code: `R-${suffix()}`,
      name: 'Dhaka → Chattogram',
      origin: { name: 'Dhaka', city: 'Dhaka' },
      destination: { name: 'Chattogram', city: 'Chattogram' },
      stops: [
        { name: 'Cumilla', order: 0, offsetMinutesFromOrigin: 120, distanceFromOriginKm: 100 },
        { name: 'Feni', order: 1, offsetMinutesFromOrigin: 190, distanceFromOriginKm: 165 },
      ],
      totalDistanceKm: 264,
      estimatedDurationMinutes: 330,
    })
  ).body.data.route;

  let driver = driverId;
  if (!driver) {
    driver = (
      await admin.post('/api/admin/drivers', {
        name: 'Test Driver',
        phone: `018${String(Math.floor(10_000_000 + Math.random() * 89_000_000)).slice(0, 8)}`,
        licenseNumber: `DL-${suffix()}`,
      })
    ).body.data.driver._id;
  }

  const trip = (
    await admin.post('/api/admin/trips', {
      routeId: route._id,
      busId: bus._id,
      driverId: driver,
      departureDate,
      departureTime,
      fare,
    })
  ).body.data.trip;

  return { api: admin, trip, bus, route };
}

async function sellTicket(api, tripId, overrides = {}) {
  const response = await api.post('/api/counter/bookings', {
    tripId,
    seatNumbers: [1, 2],
    passenger: passenger(overrides),
  });
  expect(response.status).toBe(201);
  return response.body.data.booking;
}

describe('cancellation policy', () => {
  const policy = {
    freeCancelHours: 24,
    halfRefundHours: 2,
    halfRefundPercent: 50,
    noRefundPercent: 0,
  };

  it('gives a full refund outside the free window, half inside it, and none late', () => {
    const now = new Date('2026-05-10T00:00:00.000Z');
    const at = (hours) => new Date(now.getTime() + hours * 3_600_000);

    const full = calculateRefund({
      amountPaid: 1800,
      tripDepartureAt: at(48),
      policy,
      now,
    });
    expect(full.refundPercent).toBe(100);
    expect(full.refundAmount).toBe(1800);
    expect(full.ruleLabel).toBe('full_refund');

    const half = calculateRefund({
      amountPaid: 1800,
      tripDepartureAt: at(5),
      policy,
      now,
    });
    expect(half.refundPercent).toBe(50);
    expect(half.refundAmount).toBe(900);
    expect(half.ruleLabel).toBe('partial_refund');

    const none = calculateRefund({
      amountPaid: 1800,
      tripDepartureAt: at(1),
      policy,
      now,
    });
    expect(none.refundAmount).toBe(0);
    expect(none.ruleLabel).toBe('no_refund');

    // Nothing was paid, so nothing can be refunded even inside the window.
    const unpaid = calculateRefund({
      amountPaid: 0,
      tripDepartureAt: at(48),
      policy,
      now,
    });
    expect(unpaid.refundAmount).toBe(0);
  });
});

describe('cancelling a ticket', () => {
  it('cancels a paid counter sale, releases the seats and records the refund', async () => {
    const { api, trip } = await setupFleet();
    const booking = await sellTicket(api, trip._id);

    const response = await api.post(`/api/bookings/${booking.code}/cancel`, {
      reason: 'Passenger changed plans',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.booking.status).toBe('cancelled');
    expect(response.body.data.cancellation.refundStatus).toBe('pending');
    expect(response.body.data.cancellation.refundAmount).toBe(booking.payableAmount);
    expect(response.body.data.cancellation.refundPercent).toBe(100);

    const stored = await Booking.findById(booking.id).lean();
    expect(stored.status).toBe('cancelled');
    expect(stored.cancelReason).toBe('Passenger changed plans');
    expect(stored.cancellationId).toBeTruthy();
    expect(await SeatHold.countDocuments({ tripId: trip._id })).toBe(0);

    const storedTrip = await Trip.findById(trip._id).lean();
    expect(storedTrip.seatSummary.booked).toBe(0);

    const cancellation = await Cancellation.findOne({ bookingId: booking.id }).lean();
    expect(cancellation.policyApplied.ruleLabel).toBe('full_refund');
    expect(cancellation.refundAmount).toBe(1800);
  });

  it('creates no refund debt for an unpaid reservation', async () => {
    const { api, trip } = await setupFleet();
    const client = guest();
    await client.post('/api/holds', { tripId: trip._id, seatNumbers: [1] });
    const created = await client.post('/api/bookings', {
      tripId: trip._id,
      seatNumbers: [1],
      paymentMethod: 'cash',
      passenger: passenger(),
    });
    const booking = created.body.data.booking;

    const response = await api.post(`/api/bookings/${booking.code}/cancel`, {
      reason: 'No longer travelling',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.cancellation.refundAmount).toBe(0);
    expect(response.body.data.cancellation.refundStatus).toBe('processed');
    expect(await SeatHold.countDocuments({ tripId: trip._id })).toBe(0);
  });

  it('refuses passenger self-cancellation while the setting is off', async () => {
    const { api, trip } = await setupFleet();
    const booking = await sellTicket(api, trip._id);
    const user = await createUser({ phone: PASSENGER_PHONE });
    const cookie = await loginCookie(app, user);
    const client = adminClient(app, cookie);

    const preview = await client.get(
      `/api/bookings/${booking.code}/cancellation-preview`,
    );
    expect(preview.status).toBe(200);
    expect(preview.body.data.preview.allowed).toBe(false);
    expect(preview.body.data.preview.reason).toBe('self_cancel_disabled');

    const attempt = await client.post(`/api/bookings/${booking.code}/cancel`, {
      reason: 'I want to cancel',
    });
    expect(attempt.status).toBe(403);
    expect(attempt.body.message).toMatch(/contact a counter/i);
  });

  it('lets a passenger cancel their own ticket when the setting is on', async () => {
    await SystemSetting.create({
      key: 'global',
      booking: { passengerSelfCancel: true },
    });
    const { api, trip } = await setupFleet();
    const booking = await sellTicket(api, trip._id);
    const owner = await createUser({ phone: PASSENGER_PHONE });
    const ownerCookie = await loginCookie(app, owner);
    const ownerClient = adminClient(app, ownerCookie);

    const preview = await ownerClient.get(
      `/api/bookings/${booking.code}/cancellation-preview`,
    );
    expect(preview.body.data.preview.allowed).toBe(true);

    const attempt = await ownerClient.post(`/api/bookings/${booking.code}/cancel`, {
      reason: 'Personal reason',
    });
    expect(attempt.status).toBe(200);

    const stranger = await createUser();
    const strangerCookie = await loginCookie(app, stranger);
    const strangerClient = adminClient(app, strangerCookie);
    const other = await ownerClient.post(`/api/bookings/${booking.code}/cancel`, {
      reason: 'Again',
    });
    expect(other.status).toBe(409);
    expect((await strangerClient.get(`/api/bookings/${booking.code}`)).status).toBe(403);
  });

  it('cancels only once, even when two requests arrive together', async () => {
    const { api, trip } = await setupFleet();
    const booking = await sellTicket(api, trip._id);

    const [first, second] = await Promise.all([
      api.post(`/api/bookings/${booking.code}/cancel`, { reason: 'First request' }),
      api.post(`/api/bookings/${booking.code}/cancel`, { reason: 'Second request' }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(await Cancellation.countDocuments({ bookingId: booking.id })).toBe(1);
  });

  it('refuses to cancel a trip that has already departed', async () => {
    const { api, trip } = await setupFleet();
    const booking = await sellTicket(api, trip._id);
    await Trip.updateOne(
      { _id: trip._id },
      { $set: { departureAt: new Date(Date.now() - 60_000) } },
    );

    const response = await api.post(`/api/bookings/${booking.code}/cancel`, {
      reason: 'Too late',
    });
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/already departed/i);
  });

  it('keeps cancellation tools away from other roles', async () => {
    const { api, trip } = await setupFleet();
    const booking = await sellTicket(api, trip._id);
    const passengerUser = await createUser({ role: 'PASSENGER', phone: '01911111111' });
    const cookie = await loginCookie(app, passengerUser);

    const response = await request(app)
      .get('/api/admin/cancellations')
      .set('Cookie', cookie);
    expect(response.status).toBe(403);
    expect(booking.code).toMatch(/^BB-/);
  });
});

describe('refund tracking', () => {
  async function cancelForRefund(api, tripId) {
    const booking = await sellTicket(api, tripId);
    const cancelled = await api.post(`/api/bookings/${booking.code}/cancel`, {
      reason: 'Refund test',
    });
    return { booking, cancellation: cancelled.body.data.cancellation };
  }

  it('approves then processes a refund and updates the ticket', async () => {
    const { api, trip } = await setupFleet();
    const { booking, cancellation } = await cancelForRefund(api, trip._id);

    const list = await api.get('/api/admin/cancellations?refundStatus=pending');
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.counts.pending).toBe(1);

    const approved = await api.patch(`/api/admin/cancellations/${cancellation.id}/refund`, {
      action: 'approve',
      notes: 'Approved by admin',
    });
    expect(approved.status).toBe(200);
    expect(approved.body.data.refund.refundStatus).toBe('approved');

    const processed = await api.patch(`/api/admin/cancellations/${cancellation.id}/refund`, {
      action: 'process',
      refundMethod: 'cash',
      refundTranId: 'CASH-REF-001',
    });
    expect(processed.status).toBe(200);
    expect(processed.body.data.refund.refundStatus).toBe('processed');
    expect(processed.body.data.refund.refundTranId).toBe('CASH-REF-001');

    const updatedBooking = await Booking.findById(booking.id).lean();
    expect(updatedBooking.paymentStatus).toBe('refunded');

    const again = await api.patch(`/api/admin/cancellations/${cancellation.id}/refund`, {
      action: 'process',
    });
    expect(again.status).toBe(409);
  });

  it('can reject a refund request without changing the paid ticket', async () => {
    const { api, trip } = await setupFleet();
    const { booking, cancellation } = await cancelForRefund(api, trip._id);

    const rejected = await api.patch(`/api/admin/cancellations/${cancellation.id}/refund`, {
      action: 'reject',
      notes: 'Outside policy',
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.refund.refundStatus).toBe('rejected');

    const stored = await Booking.findById(booking.id).lean();
    expect(stored.paymentStatus).toBe('paid');
  });
});

describe('notification log', () => {
  it('never claims a message was sent in mock mode', async () => {
    const { api, trip } = await setupFleet();
    await sellTicket(api, trip._id);

    const notifications = await Notification.find({}).lean();
    expect(notifications.length).toBeGreaterThanOrEqual(2);
    expect(notifications.every((row) => row.status === 'skipped')).toBe(true);
    expect(notifications.every((row) => row.provider === 'mock')).toBe(true);
    // The email adapter is in mock mode; SMS is disabled by default.
    const emailRow = notifications.find((row) => row.channel === 'email');
    const smsRow = notifications.find((row) => row.channel === 'sms');
    expect(emailRow.error).toMatch(/mock mode/i);
    expect(smsRow.error).toMatch(/disabled/i);

    const channels = notifications.map((row) => row.channel).sort();
    expect(channels).toEqual(['email', 'sms']);
  });

  it('records a disabled channel as skipped, not sent', async () => {
    await SystemSetting.create({
      key: 'global',
      notifications: { emailEnabled: false, smsEnabled: false, mockMode: true },
    });
    const { api, trip } = await setupFleet();
    await sellTicket(api, trip._id);

    const notifications = await Notification.find({}).lean();
    expect(notifications).toHaveLength(2);
    expect(notifications.every((row) => row.status === 'skipped')).toBe(true);
    expect(notifications.every((row) => /disabled/i.test(row.error ?? ''))).toBe(true);
  });
});

async function setupDriver({ adminApi } = {}) {
  const api = adminApi ?? (await asAdmin(app)).api;
  const email = `driver-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const password = 'DriverPass123';
  const phone = `018${String(Math.floor(10_000_000 + Math.random() * 89_000_000)).slice(0, 8)}`;

  const created = await api.post('/api/admin/drivers', {
    name: 'Portal Driver',
    phone,
    licenseNumber: `DL-${suffix()}`,
    createLogin: true,
    loginEmail: email,
    loginPassword: password,
  });

  expect(created.status).toBe(201);
  const driver = created.body.data.driver;
  const cookie = await loginCookie(app, { email }, password);
  return { api, driver, cookie, client: adminClient(app, cookie) };
}

describe('driver console', () => {
  it('shows only the signed-in driver’s own trips', async () => {
    const { api, driver, client } = await setupDriver();
    const { trip } = await setupFleet({
      api,
      driverId: driver._id,
      departureDate: dhakaToday(),
      departureTime: '23:30',
    });

    const response = await client.get('/api/driver/trips');
    expect(response.status).toBe(200);
    expect(response.body.data.driver.name).toBe('Portal Driver');
    expect(response.body.data.trips.map((row) => row.id)).toContain(String(trip._id));
    expect(response.body.data.date).toBe(dhakaToday());

    const detail = await client.get(`/api/driver/trips/${trip._id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.trip.route.stops).toHaveLength(2);
    expect(detail.body.data.trip.lastLocation).toBeNull();
  });

  it('moves a trip through start, stop and completion once', async () => {
    const { api, driver, client } = await setupDriver();
    const { trip } = await setupFleet({
      api,
      driverId: driver._id,
      departureDate: dhakaToday(),
      departureTime: '23:30',
    });

    const started = await client.post(`/api/driver/trips/${trip._id}/status`, {
      status: 'started',
    });
    expect(started.status).toBe(200);
    expect(started.body.data.trip.status).toBe('started');
    expect(started.body.data.trip.startedAt).toBeTruthy();

    // Booking closes as soon as the bus leaves.
    const late = await guest().post('/api/holds', { tripId: trip._id, seatNumbers: [1] });
    expect(late.status).toBe(409);

    expect(
      (await client.post(`/api/driver/trips/${trip._id}/status`, { status: 'delayed' }))
        .status,
    ).toBe(409);

    const atStop = await client.post(`/api/driver/trips/${trip._id}/status`, {
      status: 'at_stop',
      note: 'Reached Cumilla',
    });
    expect(atStop.body.data.trip.status).toBe('at_stop');

    const completed = await client.post(`/api/driver/trips/${trip._id}/status`, {
      status: 'completed',
    });
    expect(completed.body.data.trip.status).toBe('completed');
    expect(completed.body.data.trip.completedAt).toBeTruthy();

    const reopen = await client.post(`/api/driver/trips/${trip._id}/status`, {
      status: 'started',
    });
    expect(reopen.status).toBe(409);

    const history = await client.get('/api/driver/history');
    expect(history.body.data.trips.map((row) => row.id)).toContain(String(trip._id));
  });

  it('stores a manual location report with the right stop names', async () => {
    const { api, driver, client } = await setupDriver();
    const { trip } = await setupFleet({
      api,
      driverId: driver._id,
      departureDate: dhakaToday(),
      departureTime: '23:30',
    });

    const tooEarly = await client.post(`/api/driver/trips/${trip._id}/location`, {
      lat: 23.8,
      lng: 90.4,
    });
    expect(tooEarly.status).toBe(409);

    await client.post(`/api/driver/trips/${trip._id}/status`, { status: 'started' });

    const reported = await client.post(`/api/driver/trips/${trip._id}/location`, {
      lat: 23.8103,
      lng: 90.4125,
      currentStopIndex: 0,
      atStop: true,
      note: 'Leaving Dhaka',
    });

    expect(reported.status).toBe(201);
    expect(reported.body.data.location.currentStopName).toBe('Cumilla');
    expect(reported.body.data.location.nextStopName).toBe('Feni');
    expect(reported.body.data.location.atStop).toBe(true);
    expect(reported.body.data.location.isManual).toBe(true);

    const stored = await TripLocationUpdate.findOne({ tripId: trip._id }).lean();
    expect(stored.location.lat).toBe(23.8103);
    expect(stored.driverId.toString()).toBe(String(driver._id));

    const badCoords = await client.post(`/api/driver/trips/${trip._id}/location`, {
      lat: 200,
      lng: 90,
    });
    expect(badCoords.status).toBe(400);

    const detail = await client.get(`/api/driver/trips/${trip._id}`);
    expect(detail.body.data.trip.lastLocation.currentStopName).toBe('Cumilla');
  });

  it('keeps other drivers and roles out', async () => {
    const first = await setupDriver();
    const second = await setupDriver({ adminApi: first.api });
    const { trip } = await setupFleet({
      api: first.api,
      driverId: first.driver._id,
      departureDate: dhakaToday(),
      departureTime: '23:30',
    });

    const strangerStart = await second.client.post(
      `/api/driver/trips/${trip._id}/status`,
      { status: 'started' },
    );
    expect(strangerStart.status).toBe(403);

    const passengerUser = await createUser({ role: 'PASSENGER' });
    const passengerCookie = await loginCookie(app, passengerUser);
    const forbidden = await request(app)
      .get('/api/driver/trips')
      .set('Cookie', passengerCookie);
    expect(forbidden.status).toBe(403);

    const unlinked = await createUser({ role: 'DRIVER' });
    const unlinkedCookie = await loginCookie(app, unlinked);
    const noProfile = await request(app)
      .get('/api/driver/trips')
      .set('Cookie', unlinkedCookie);
    expect(noProfile.status).toBe(404);
    expect(noProfile.body.message).toMatch(/no driver profile/i);
  });
});
