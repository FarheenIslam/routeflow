import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { dhakaToday } from '../src/utils/query.js';
import { asAdmin, browser } from './helpers.js';

const app = createApp();
const PASSENGER = { name: 'Report Passenger', phone: '01712345678' };

const suffix = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function futureDate(offsetDays = 5) {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

async function setupFleet() {
  const { api } = await asAdmin(app);

  const bus = (
    await api.post('/api/admin/buses', {
      busNumber: `BUS-${suffix()}`,
      operatorName: 'Report Operator',
      busType: 'AC',
      seatLayout: { rows: 5, columns: 4, aisleAfterColumn: 2, seatPrefix: 'R' },
    })
  ).body.data.bus;

  const route = (
    await api.post('/api/admin/routes', {
      code: `R-${suffix()}`,
      name: 'Dhaka → Sylhet',
      origin: { name: 'Dhaka', city: 'Dhaka' },
      destination: { name: 'Sylhet', city: 'Sylhet' },
      stops: [],
    })
  ).body.data.route;

  const driver = (
    await api.post('/api/admin/drivers', {
      name: 'Report Driver',
      phone: `018${String(Math.floor(10_000_000 + Math.random() * 89_000_000)).slice(0, 8)}`,
      licenseNumber: `DL-${suffix()}`,
    })
  ).body.data.driver;

  const trip = (
    await api.post('/api/admin/trips', {
      routeId: route._id,
      busId: bus._id,
      driverId: driver._id,
      departureDate: futureDate(),
      departureTime: '09:00',
      fare: 1000,
    })
  ).body.data.trip;

  return { api, trip, route };
}

async function sell(api, tripId, seats = [1, 2]) {
  const response = await api.post('/api/counter/bookings', {
    tripId,
    seatNumbers: seats,
    passenger: PASSENGER,
  });
  expect(response.status).toBe(201);
  return response.body.data.booking;
}

describe('sales reports', () => {
  it('requires an admin and validates the date range', async () => {
    const anonymous = await browser(request(app).get('/api/admin/reports/summary'));
    expect(anonymous.status).toBe(401);

    const { api } = await asAdmin(app);
    const invalid = await api.get('/api/admin/reports/summary?from=yesterday');
    expect(invalid.status).toBe(400);

    const reversed = await api.get(
      `/api/admin/reports/summary?from=${dhakaToday()}&to=2020-01-01`,
    );
    expect(reversed.status).toBe(400);
    expect(reversed.body.message).toMatch(/on or before/i);
  });

  it('returns zeroes for a range with no sales', async () => {
    const { api } = await asAdmin(app);
    const response = await api.get('/api/admin/reports/summary?from=2020-01-01&to=2020-01-02');

    expect(response.status).toBe(200);
    expect(response.body.data.summary).toMatchObject({
      bookingsCreated: 0,
      activeTickets: 0,
      passengers: 0,
      collected: 0,
      refunded: 0,
      net: 0,
    });
    expect(response.body.data.daily).toEqual([]);
  });

  it('totals cash sales, passengers and route performance honestly', async () => {
    const { api, trip, route } = await setupFleet();
    await sell(api, trip._id, [1, 2]);
    await sell(api, trip._id, [3]);

    const today = dhakaToday();
    const response = await api.get(`/api/admin/reports/summary?from=${today}&to=${today}`);

    expect(response.status).toBe(200);
    const report = response.body.data;
    expect(report.summary.activeTickets).toBe(2);
    expect(report.summary.passengers).toBe(3);
    expect(report.summary.collected).toBe(3000);
    expect(report.summary.refunded).toBe(0);
    expect(report.summary.net).toBe(3000);

    const routeRow = report.routes.find((row) => row.routeId === route._id);
    expect(routeRow).toMatchObject({ seats: 3, bookings: 2, collected: 3000 });

    expect(report.paymentMix[0]).toMatchObject({ channel: 'counter', method: 'cash', count: 2 });
  });

  it('subtracts only refunds that were actually processed', async () => {
    const { api, trip } = await setupFleet();
    const booking = await sell(api, trip._id, [1, 2]);

    const cancelled = await api.post(`/api/bookings/${booking.code}/cancel`, {
      reason: 'Report refund test',
    });
    expect(cancelled.status).toBe(200);
    const cancellationId = cancelled.body.data.cancellation.id;

    const today = dhakaToday();
    const pending = await api.get(`/api/admin/reports/summary?from=${today}&to=${today}`);
    expect(pending.body.data.summary.refunded).toBe(0);
    expect(pending.body.data.summary.refundsPendingAmount).toBe(2000);

    await api.patch(`/api/admin/cancellations/${cancellationId}/refund`, {
      action: 'approve',
    });
    await api.patch(`/api/admin/cancellations/${cancellationId}/refund`, {
      action: 'process',
      refundMethod: 'cash',
      refundTranId: 'REPORT-TEST-1',
    });

    const processed = await api.get(`/api/admin/reports/summary?from=${today}&to=${today}`);
    expect(processed.body.data.summary.collected).toBe(2000);
    expect(processed.body.data.summary.refunded).toBe(2000);
    expect(processed.body.data.summary.net).toBe(0);
    expect(processed.body.data.refunds.processed).toMatchObject({ count: 1, amount: 2000 });
  });

  it('exports a CSV attachment with a header row and the booked ticket', async () => {
    const { api, trip } = await setupFleet();
    const booking = await sell(api, trip._id, [1]);

    const today = dhakaToday();
    const response = await api.get(
      `/api/admin/reports/bookings.csv?from=${today}&to=${today}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.headers['content-disposition']).toMatch(/attachment; filename="busbook-bookings-/);
    expect(response.text).toContain('Booking code');
    expect(response.text).toContain(booking.code);
    expect(response.text).toContain('Report Passenger');
  });
});
