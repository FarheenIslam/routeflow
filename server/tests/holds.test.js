import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import SeatHold from '../src/models/SeatHold.js';
import Trip from '../src/models/Trip.js';
import { sweepExpiredHolds } from '../src/services/seat.service.js';
import { asAdmin, browser } from './helpers.js';

const app = createApp();

/**
 * A guest browser: supertest's agent keeps the `bb_sid` cookie between calls,
 * which is exactly how a real passenger's seat hold survives a page refresh.
 */
function guest() {
  const agent = request.agent(app);
  return {
    get: (url) => browser(agent.get(url)),
    post: (url, body) => browser(agent.post(url)).send(body ?? {}),
    del: (url) => browser(agent.delete(url)),
  };
}

function futureDate(offsetDays = 10) {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

const suffix = () => Math.random().toString(36).slice(2, 8).toUpperCase();

/** Creates a route, an active bus, a driver and one future trip through the admin API. */
async function setupTrip({
  rows = 5,
  columns = 4,
  disabledSeats = [],
  busType = 'AC',
  offsetDays = 10,
} = {}) {
  const { api } = await asAdmin(app);

  const bus = (
    await api.post('/api/admin/buses', {
      busNumber: `BUS-${suffix()}`,
      operatorName: 'Test Operator',
      busType,
      seatLayout: { rows, columns, aisleAfterColumn: 2, seatPrefix: 'A', disabledSeats },
    })
  ).body.data.bus;

  const route = (
    await api.post('/api/admin/routes', {
      code: `R-${suffix()}`,
      name: 'Dhaka → Chattogram',
      origin: { name: 'Dhaka', city: 'Dhaka' },
      destination: { name: 'Chattogram', city: 'Chattogram' },
      stops: [],
      totalDistanceKm: 264,
      estimatedDurationMinutes: 330,
    })
  ).body.data.route;

  const driver = (
    await api.post('/api/admin/drivers', {
      name: 'Test Driver',
      phone: `018${String(Math.floor(10_000_000 + Math.random() * 89_000_000)).slice(0, 8)}`,
      licenseNumber: `DL-${suffix()}`,
    })
  ).body.data.driver;

  const date = futureDate(offsetDays);
  const trip = (
    await api.post('/api/admin/trips', {
      routeId: route._id,
      busId: bus._id,
      driverId: driver._id,
      departureDate: date,
      departureTime: '08:00',
      fare: 900,
    })
  ).body.data.trip;

  return { api, bus, route, driver, trip, date };
}

describe('public settings and homepage data', () => {
  it('exposes booking limits but no secrets', async () => {
    const response = await request(app).get('/api/public/settings');

    expect(response.status).toBe(200);
    expect(response.body.data.settings.booking.holdMinutes).toBe(2);
    expect(response.body.data.settings.booking.maxSeatsPerBooking).toBe(6);
    expect(JSON.stringify(response.body)).not.toMatch(/jwt|secret|sslcommerz|resend/i);
  });

  it('lists routes with upcoming departures and their lowest fare', async () => {
    // Popular routes look at the next seven days, so the trip must be inside it.
    const { route, date } = await setupTrip({ offsetDays: 3 });

    const response = await request(app).get('/api/public/popular-routes');
    expect(response.status).toBe(200);

    const found = response.body.data.routes.find(
      (item) => item.code === route.code,
    );
    expect(found).toBeTruthy();
    expect(found.trips).toBe(1);
    expect(found.fromFare).toBe(900);
    expect(found.availableSeats).toBe(20);
    expect(date).toBeTruthy();
  });
});

describe('trip search', () => {
  it('finds a departure by origin, destination and date', async () => {
    const { trip, date } = await setupTrip();

    const response = await request(app)
      .get('/api/trips/search')
      .query({ origin: 'Dhaka', destination: 'Chattogram', date });

    expect(response.status).toBe(200);
    const item = response.body.data.items.find((row) => row.id === String(trip._id));
    expect(item).toBeTruthy();
    expect(item.fare).toBe(900);
    expect(item.seats.total).toBe(20);
    expect(item.seats.available).toBe(20);
    expect(item.bus.busType).toBe('AC');
    expect(item.route.origin.city).toBe('Dhaka');
    expect(item.bookable).toBe(true);
  });

  it('hydrates the page with a helpful empty result instead of an error', async () => {
    const response = await request(app)
      .get('/api/trips/search')
      .query({ origin: 'Nowhere', destination: 'Elsewhere', date: futureDate() });

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(0);
    expect(response.body.data.pagination.total).toBe(0);
  });

  it('requires both ends of the journey', async () => {
    const response = await request(app)
      .get('/api/trips/search')
      .query({ origin: 'Dhaka' });

    expect(response.status).toBe(400);
    expect(response.body.errors?.[0]?.field).toBe('destination');
  });

  it('rejects a date in the past', async () => {
    const response = await request(app)
      .get('/api/trips/search')
      .query({ origin: 'Dhaka', destination: 'Chattogram', date: '2020-01-01' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/today or a later date/i);
  });

  it('filters by bus type and hides cancelled departures', async () => {
    const { api, trip, date } = await setupTrip({ busType: 'AC' });

    const wrongType = await request(app)
      .get('/api/trips/search')
      .query({ origin: 'Dhaka', destination: 'Chattogram', date, busType: 'NON_AC' });
    expect(wrongType.body.data.items).toHaveLength(0);

    await api.post(`/api/admin/trips/${trip._id}/cancel`, { reason: 'Test cancellation' });

    const afterCancel = await request(app)
      .get('/api/trips/search')
      .query({ origin: 'Dhaka', destination: 'Chattogram', date });
    expect(afterCancel.body.data.items).toHaveLength(0);
  });
});

describe('seat map', () => {
  it('returns every real seat with a stable label and the layout', async () => {
    const { trip } = await setupTrip({ rows: 2, columns: 3, disabledSeats: [1] });
    const passenger = guest();

    const response = await passenger.get(`/api/trips/${trip._id}/seats`);
    expect(response.status).toBe(200);

    const { layout, seats, seatSummary } = response.body.data;
    expect(layout.rows).toBe(2);
    expect(layout.columns).toBe(3);
    expect(layout.disabledSeats).toEqual([1]);

    // Six grid positions, one is a door: five seats, labelled A1–A5.
    expect(seats).toHaveLength(5);
    expect(seats.map((seat) => seat.number)).toEqual([2, 3, 4, 5, 6]);
    expect(seats[0].label).toBe('A1');
    expect(seats[4].label).toBe('A5');
    expect(seats.every((seat) => seat.status === 'available')).toBe(true);
    expect(seatSummary).toEqual({
      total: 5,
      booked: 0,
      held: 0,
      mine: 0,
      available: 5,
    });
    expect(response.body.data.holdMinutes).toBe(2);
    expect(response.body.data.sessionHold).toBeNull();
  });

  it('refuses seats on a cancelled trip', async () => {
    const { api, trip } = await setupTrip();
    await api.post(`/api/admin/trips/${trip._id}/cancel`, { reason: 'Bus breakdown' });

    const passenger = guest();
    const seats = await passenger.get(`/api/trips/${trip._id}/seats`);
    expect(seats.status).toBe(409);
    expect(seats.body.message).toMatch(/cancelled/i);

    const hold = await passenger.post('/api/holds', {
      tripId: trip._id,
      seatNumbers: [1],
    });
    expect(hold.status).toBe(409);
  });
});

describe('seat holds', () => {
  it('holds seats, marks them as mine and updates the trip counters', async () => {
    const { trip } = await setupTrip();
    const passenger = guest();

    const response = await passenger.post('/api/holds', {
      tripId: trip._id,
      seatNumbers: [1, 2],
    });

    expect(response.status).toBe(201);
    const hold = response.body.data.hold;
    expect(hold.seats).toHaveLength(2);
    expect(hold.holdMinutes).toBe(2);
    expect(new Date(hold.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(hold.seatSummary.held).toBe(2);

    const stored = await Trip.findById(trip._id).lean();
    expect(stored.seatSummary.held).toBe(2);
    expect(stored.seatSummary.booked).toBe(0);

    const seats = await passenger.get(`/api/trips/${trip._id}/seats`);
    const statuses = Object.fromEntries(
      seats.body.data.seats.map((seat) => [seat.number, seat.status]),
    );
    expect(statuses[1]).toBe('mine');
    expect(statuses[2]).toBe('mine');
    expect(statuses[3]).toBe('available');
    expect(seats.body.data.sessionHold.seats).toEqual([1, 2]);
    expect(seats.body.data.seatSummary.available).toBe(18);
  });

  it('does not let a second guest hold the same seat', async () => {
    const { trip } = await setupTrip();
    const first = guest();
    const second = guest();

    await first.post('/api/holds', { tripId: trip._id, seatNumbers: [1] });
    const clash = await second.post('/api/holds', { tripId: trip._id, seatNumbers: [1] });

    expect(clash.status).toBe(409);
    expect(clash.body.errors?.[0]?.field).toBe('seatNumbers');

    const seats = await second.get(`/api/trips/${trip._id}/seats`);
    expect(seats.body.data.seats.find((seat) => seat.number === 1).status).toBe('held');
  });

  it('lets the same guest extend their own hold', async () => {
    const { trip } = await setupTrip();
    const passenger = guest();

    await passenger.post('/api/holds', { tripId: trip._id, seatNumbers: [1] });
    const again = await passenger.post('/api/holds', { tripId: trip._id, seatNumbers: [1, 2] });

    expect(again.status).toBe(201);
    expect(again.body.data.hold.seatSummary.held).toBe(2);
    expect(await SeatHold.countDocuments({ tripId: trip._id })).toBe(2);
  });

  it('rejects seats that do not exist and more seats than the limit', async () => {
    const { trip } = await setupTrip();
    const passenger = guest();

    const unknown = await passenger.post('/api/holds', {
      tripId: trip._id,
      seatNumbers: [999],
    });
    expect(unknown.status).toBe(400);

    const tooMany = await passenger.post('/api/holds', {
      tripId: trip._id,
      seatNumbers: [1, 2, 3, 4, 5, 6, 7],
    });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.message).toMatch(/at most 6 seats/i);
  });

  it('refuses a seat that is already booked', async () => {
    const { trip } = await setupTrip();
    await SeatHold.create({
      tripId: trip._id,
      seatNumber: 1,
      seatLabel: 'A1',
      status: 'booked',
    });

    const passenger = guest();
    const response = await passenger.post('/api/holds', {
      tripId: trip._id,
      seatNumbers: [1],
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/no longer available/i);
  });

  it('lets another guest take over an expired hold', async () => {
    const { trip } = await setupTrip();
    const first = guest();
    const second = guest();

    await first.post('/api/holds', { tripId: trip._id, seatNumbers: [1] });
    await SeatHold.updateMany(
      { tripId: trip._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    const takeover = await second.post('/api/holds', {
      tripId: trip._id,
      seatNumbers: [1],
    });

    expect(takeover.status).toBe(201);
    const seats = await second.get(`/api/trips/${trip._id}/seats`);
    expect(seats.body.data.seats.find((seat) => seat.number === 1).status).toBe('mine');
  });
});

describe('releasing holds', () => {
  it('releases one seat and frees it for someone else', async () => {
    const { trip } = await setupTrip();
    const passenger = guest();
    const other = guest();

    const hold = (
      await passenger.post('/api/holds', { tripId: trip._id, seatNumbers: [1, 2] })
    ).body.data.hold;

    const released = await passenger.del(`/api/holds/${hold.seats[0].holdId}`);
    expect(released.status).toBe(200);
    expect(released.body.data.seatSummary.held).toBe(1);

    const taken = await other.post('/api/holds', { tripId: trip._id, seatNumbers: [1] });
    expect(taken.status).toBe(201);
  });

  it('refuses to release another session’s hold', async () => {
    const { trip } = await setupTrip();
    const owner = guest();
    // The stranger has its own guest session, it simply does not own this hold.
    const stranger = guest();
    await stranger.get(`/api/trips/${trip._id}/seats`);

    const hold = (
      await owner.post('/api/holds', { tripId: trip._id, seatNumbers: [3] })
    ).body.data.hold;

    const response = await stranger.del(`/api/holds/${hold.seats[0].holdId}`);
    expect(response.status).toBe(403);
    expect(await SeatHold.countDocuments({ tripId: trip._id })).toBe(1);
  });

  it('releases every seat of the session on one trip', async () => {
    const { trip } = await setupTrip();
    const passenger = guest();

    await passenger.post('/api/holds', { tripId: trip._id, seatNumbers: [1, 2, 3] });
    const response = await passenger.del(`/api/holds?tripId=${trip._id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.released).toBe(3);
    expect(response.body.data.seatSummary.available).toBe(20);

    const stored = await Trip.findById(trip._id).lean();
    expect(stored.seatSummary.held).toBe(0);
  });
});

describe('hold sweeper', () => {
  it('deletes expired holds and recounts the trip', async () => {
    const { trip } = await setupTrip();
    const passenger = guest();

    await passenger.post('/api/holds', { tripId: trip._id, seatNumbers: [1, 2] });
    await SeatHold.updateMany(
      { tripId: trip._id },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } },
    );

    const result = await sweepExpiredHolds();
    expect(result.removed).toBe(2);

    expect(await SeatHold.countDocuments({ tripId: trip._id })).toBe(0);
    const stored = await Trip.findById(trip._id).lean();
    expect(stored.seatSummary.held).toBe(0);

    const seats = await passenger.get(`/api/trips/${trip._id}/seats`);
    expect(seats.body.data.seats.every((seat) => seat.status === 'available')).toBe(true);
  });

  it('leaves live holds alone', async () => {
    const { trip } = await setupTrip();
    const passenger = guest();

    await passenger.post('/api/holds', { tripId: trip._id, seatNumbers: [4] });
    const result = await sweepExpiredHolds();

    expect(result.removed).toBe(0);
    expect(await SeatHold.countDocuments({ tripId: trip._id })).toBe(1);
  });
});
