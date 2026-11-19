import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import Counter from '../src/models/Counter.js';
import { adminClient, asAdmin, browser, createUser, loginCookie, sessionCookie } from './helpers.js';

const app = createApp();

const busPayload = (overrides = {}) => ({
  busNumber: `BUS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  operatorName: 'Test Operator',
  busType: 'AC',
  seatLayout: { rows: 10, columns: 4, aisleAfterColumn: 2, seatPrefix: 'A', disabledSeats: [] },
  ...overrides,
});

const routePayload = (overrides = {}) => ({
  code: `R-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
  name: 'Dhaka → Chattogram',
  origin: { name: 'Dhaka', city: 'Dhaka' },
  destination: { name: 'Chattogram', city: 'Chattogram' },
  stops: [],
  totalDistanceKm: 264,
  estimatedDurationMinutes: 330,
  ...overrides,
});

const driverPayload = (overrides = {}) => ({
  name: 'Test Driver',
  phone: `018${String(Math.floor(10_000_000 + Math.random() * 89_000_000)).slice(0, 8)}`,
  licenseNumber: `DL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  ...overrides,
});

async function makeFleet(api) {
  const bus = (await api.post('/api/admin/buses', busPayload())).body.data.bus;
  const route = (await api.post('/api/admin/routes', routePayload())).body.data.route;
  const driver = (await api.post('/api/admin/drivers', driverPayload())).body.data.driver;
  return { bus, route, driver };
}

async function makeTrip(api, fleet, overrides = {}) {
  const response = await api.post('/api/admin/trips', {
    routeId: fleet.route._id,
    busId: fleet.bus._id,
    driverId: fleet.driver._id,
    departureDate: '2026-12-20',
    departureTime: '08:00',
    fare: 1200,
    ...overrides,
  });
  return response;
}

describe('admin guard', () => {
  it('rejects anonymous requests with 401', async () => {
    const response = await request(app).get('/api/admin/buses');
    expect(response.status).toBe(401);
  });

  it('rejects a passenger session with 403', async () => {
    const passenger = await createUser();
    const cookie = await loginCookie(app, passenger);
    const response = await request(app).get('/api/admin/buses').set('Cookie', cookie);
    expect(response.status).toBe(403);
  });

  it('allows an admin session', async () => {
    const { api } = await asAdmin(app);
    const response = await api.get('/api/admin/buses');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data.items)).toBe(true);
  });
});

describe('bus management', () => {
  it('derives totalSeats from the seat layout', async () => {
    const { api } = await asAdmin(app);
    const response = await api.post(
      '/api/admin/buses',
      busPayload({
        seatLayout: { rows: 10, columns: 4, aisleAfterColumn: 2, seatPrefix: 'A', disabledSeats: [1, 2] },
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body.data.bus.totalSeats).toBe(38);
  });

  it('rejects a duplicate bus number', async () => {
    const { api } = await asAdmin(app);
    const busNumber = 'DHAKA-METRO-BA-99-0001';
    await api.post('/api/admin/buses', busPayload({ busNumber }));
    const duplicate = await api.post('/api/admin/buses', busPayload({ busNumber }));

    expect(duplicate.status).toBe(409);
  });

  it('recomputes totalSeats when the seat layout is edited', async () => {
    const { api } = await asAdmin(app);
    const bus = (await api.post('/api/admin/buses', busPayload())).body.data.bus;
    expect(bus.totalSeats).toBe(40);

    const updated = await api.patch(`/api/admin/buses/${bus._id}`, {
      seatLayout: { rows: 12, columns: 3, aisleAfterColumn: 1, seatPrefix: 'C', disabledSeats: [1] },
    });

    expect(updated.status).toBe(200);
    expect(updated.body.data.bus.totalSeats).toBe(35);
  });

  it('validates the seat layout', async () => {
    const { api } = await asAdmin(app);
    const response = await api.post(
      '/api/admin/buses',
      busPayload({
        seatLayout: { rows: 0, columns: 4, aisleAfterColumn: 2, seatPrefix: 'A', disabledSeats: [] },
      }),
    );
    expect(response.status).toBe(400);
  });

  it('updates bus status and refuses to delete a bus used by a trip', async () => {
    const { api } = await asAdmin(app);
    const fleet = await makeFleet(api);
    await makeTrip(api, fleet);

    const status = await api.patch(`/api/admin/buses/${fleet.bus._id}/status`, {
      status: 'maintenance',
    });
    expect(status.status).toBe(200);
    expect(status.body.data.bus.status).toBe('maintenance');

    const removed = await api.del(`/api/admin/buses/${fleet.bus._id}`);
    expect(removed.status).toBe(409);
    expect(removed.body.message).toMatch(/inactive/i);
  });
});

describe('route management', () => {
  it('orders stops by their order field', async () => {
    const { api } = await asAdmin(app);
    const response = await api.post(
      '/api/admin/routes',
      routePayload({
        stops: [
          { name: 'Feni', order: 5, offsetMinutesFromOrigin: 190 },
          { name: 'Cumilla', order: 2, offsetMinutesFromOrigin: 120 },
        ],
      }),
    );

    expect(response.status).toBe(201);
    const names = response.body.data.route.stops.map((stop) => stop.name);
    expect(names).toEqual(['Cumilla', 'Feni']);
    expect(response.body.data.route.stops.map((stop) => stop.order)).toEqual([0, 1]);
  });
});

describe('trip scheduling', () => {
  it('computes departureAt in Dhaka time and fills the seat summary', async () => {
    const { api } = await asAdmin(app);
    const fleet = await makeFleet(api);
    const response = await makeTrip(api, fleet);

    expect(response.status).toBe(201);
    const trip = response.body.data.trip;
    // 08:00 in Dhaka (UTC+6) is 02:00 UTC.
    expect(new Date(trip.departureAt).toISOString()).toBe('2026-12-20T02:00:00.000Z');
    expect(trip.seatSummary.total).toBe(fleet.bus.totalSeats);
    expect(trip.tripCode).toMatch(/^TRP-\d{6}-[0-9A-F]{4}$/);
    expect(new Date(trip.arrivalEstimateAt).toISOString()).toBe('2026-12-20T07:30:00.000Z');
  });

  it('refuses a second trip for the same bus at the same time', async () => {
    const { api } = await asAdmin(app);
    const fleet = await makeFleet(api);
    await makeTrip(api, fleet);

    const secondDriver = (await api.post('/api/admin/drivers', driverPayload())).body.data.driver;
    const clash = await makeTrip(api, { ...fleet, driver: secondDriver });

    expect(clash.status).toBe(409);
    expect(clash.body.message).toMatch(/bus/i);
  });

  it('refuses a second trip for the same driver at the same time', async () => {
    const { api } = await asAdmin(app);
    const fleet = await makeFleet(api);
    await makeTrip(api, fleet);

    const secondBus = (await api.post('/api/admin/buses', busPayload())).body.data.bus;
    const clash = await makeTrip(api, { ...fleet, bus: secondBus });

    expect(clash.status).toBe(409);
    expect(clash.body.message).toMatch(/driver/i);
  });

  it('cancels a trip with a reason and then refuses further edits', async () => {
    const { api } = await asAdmin(app);
    const fleet = await makeFleet(api);
    const trip = (await makeTrip(api, fleet)).body.data.trip;

    const cancelled = await api.post(`/api/admin/trips/${trip._id}/cancel`, {
      reason: 'Road closure',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.trip.status).toBe('cancelled');
    expect(cancelled.body.data.trip.cancelReason).toBe('Road closure');

    const edit = await api.patch(`/api/admin/trips/${trip._id}`, { fare: 999 });
    expect(edit.status).toBe(409);
  });

  it('a cancelled trip frees the slot for a new one', async () => {
    const { api } = await asAdmin(app);
    const fleet = await makeFleet(api);
    const trip = (await makeTrip(api, fleet)).body.data.trip;
    await api.post(`/api/admin/trips/${trip._id}/cancel`, { reason: 'Bus breakdown' });

    const replacement = await makeTrip(api, fleet);
    expect(replacement.status).toBe(201);
  });
});

describe('dashboard', () => {
  it('reports fleet and trip counts, and flags revenue as unavailable', async () => {
    const { api } = await asAdmin(app);
    const fleet = await makeFleet(api);
    await makeTrip(api, fleet);

    const response = await api.get('/api/admin/dashboard');
    expect(response.status).toBe(200);

    const { counts, tripsByStatus, revenueAvailable } = response.body.data;
    expect(counts.totalBuses).toBe(1);
    expect(counts.totalDrivers).toBe(1);
    expect(counts.totalTrips).toBe(1);
    expect(counts.totalRoutes).toBe(1);
    expect(tripsByStatus.find((row) => row.status === 'scheduled')?.count).toBe(1);
    expect(revenueAvailable).toBe(false);
  });
});

describe('system settings', () => {
  it('saves a valid cancellation policy', async () => {
    const { api } = await asAdmin(app);
    const response = await api.put('/api/admin/settings', {
      cancellationPolicy: { freeCancelHours: 48, halfRefundHours: 6, halfRefundPercent: 40 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.settings.cancellationPolicy.freeCancelHours).toBe(48);
    expect(response.body.data.settings.cancellationPolicy.halfRefundPercent).toBe(40);
  });

  it('rejects a full-refund window shorter than the partial-refund window', async () => {
    const { api } = await asAdmin(app);
    const response = await api.put('/api/admin/settings', {
      cancellationPolicy: { freeCancelHours: 1, halfRefundHours: 12 },
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/full-refund window/i);
  });
});

describe('counters and staff', () => {
  it('creates staff with a counter and keeps the counter staff list in sync', async () => {
    const { api } = await asAdmin(app);
    const counter = (
      await api.post('/api/admin/counters', {
        code: 'CT-99',
        name: 'Test Counter',
        branchName: 'Test Branch',
      })
    ).body.data.counter;

    const staff = await api.post('/api/admin/users', {
      name: 'Counter Person',
      email: 'counter.person@example.com',
      phone: '01755555555',
      password: 'Password123',
      role: 'COUNTER',
      counterId: counter._id,
    });

    expect(staff.status).toBe(201);
    expect(staff.body.data.user.role).toBe('COUNTER');

    const stored = await Counter.findById(counter._id).lean();
    expect(stored.staffUserIds.map(String)).toContain(String(staff.body.data.user._id));
  });

  it('refuses to delete a counter that still has staff', async () => {
    const { api } = await asAdmin(app);
    const counter = (
      await api.post('/api/admin/counters', { code: 'CT-77', name: 'Busy Counter' })
    ).body.data.counter;

    await api.post('/api/admin/users', {
      name: 'Counter Two',
      email: 'counter.two@example.com',
      phone: '01755555556',
      password: 'Password123',
      role: 'COUNTER',
      counterId: counter._id,
    });

    const removed = await api.del(`/api/admin/counters/${counter._id}`);
    expect(removed.status).toBe(409);
    expect(removed.body.message).toMatch(/staff/i);
  });

  it('does not allow a passenger role when creating staff', async () => {
    const { api } = await asAdmin(app);
    const response = await api.post('/api/admin/users', {
      name: 'Sneaky',
      email: 'sneaky@example.com',
      phone: '01755555557',
      password: 'Password123',
      role: 'PASSENGER',
    });
    expect(response.status).toBe(400);
  });
});

describe('user safety rules', () => {
  it('prevents an admin from changing their own role', async () => {
    const { api, user } = await asAdmin(app);
    const response = await api.patch(`/api/admin/users/${user._id}/role`, { role: 'COUNTER' });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/your own role/i);
  });

  it('prevents suspending the last active admin', async () => {
    const { api, user } = await asAdmin(app);
    const response = await api.patch(`/api/admin/users/${user._id}/status`, {
      status: 'suspended',
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/your own account/i);
  });

  it('prevents demoting the last admin', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const other = await createUser({ role: 'ADMIN' });
    const cookie = await loginCookie(app, admin);
    const api = adminClient(app, cookie);

    // First admin demotes the second: allowed, one active admin remains.
    const ok = await api.patch(`/api/admin/users/${other._id}/role`, { role: 'COUNTER' });
    expect(ok.status).toBe(200);

    // Now the only admin left cannot be demoted by anyone (and not by themself).
    const selfDemote = await api.patch(`/api/admin/users/${admin._id}/role`, { role: 'COUNTER' });
    expect(selfDemote.status).toBe(400);
    expect(await User.countDocuments({ role: 'ADMIN', status: 'active' })).toBe(1);
  });
});

describe('lookups', () => {
  it('returns only active resources for form selects', async () => {
    const { api } = await asAdmin(app);
    const fleet = await makeFleet(api);
    await api.patch(`/api/admin/buses/${fleet.bus._id}/status`, { status: 'inactive' });

    const response = await api.get('/api/admin/lookups');
    expect(response.status).toBe(200);
    expect(response.body.data.buses).toHaveLength(0);
    expect(response.body.data.routes).toHaveLength(1);
    expect(response.body.data.drivers).toHaveLength(1);
  });
});

describe('csrf guard on admin writes', () => {
  it('blocks a cookie write without an Origin header', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const login = await browser(request(app).post('/api/auth/login')).send({
      identifier: admin.email,
      password: 'Password123',
    });
    const cookie = sessionCookie(login);

    const response = await request(app)
      .post('/api/admin/buses')
      .set('Cookie', cookie)
      .send(busPayload());

    expect(response.status).toBe(403);
  });
});
