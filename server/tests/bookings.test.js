import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import Booking from '../src/models/Booking.js';
import Payment from '../src/models/Payment.js';
import SeatHold from '../src/models/SeatHold.js';
import SystemSetting from '../src/models/SystemSetting.js';
import Trip from '../src/models/Trip.js';
import { env } from '../src/config/env.js';
import { expireStaleBookings } from '../src/services/booking.service.js';
import {
  ORIGIN,
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
    agent,
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

async function setupTrip({ rows = 5, columns = 4 } = {}) {
  const { api } = await asAdmin(app);

  const bus = (
    await api.post('/api/admin/buses', {
      busNumber: `BUS-${suffix()}`,
      operatorName: 'Test Operator',
      busType: 'AC',
      seatLayout: { rows, columns, aisleAfterColumn: 2, seatPrefix: 'A' },
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

  const trip = (
    await api.post('/api/admin/trips', {
      routeId: route._id,
      busId: bus._id,
      driverId: driver._id,
      departureDate: futureDate(),
      departureTime: '08:00',
      fare: 900,
    })
  ).body.data.trip;

  return { api, trip, bus };
}

function passenger(overrides = {}) {
  return {
    name: 'Rahim Uddin',
    phone: PASSENGER_PHONE,
    email: 'rahim@example.com',
    gender: 'male',
    age: 30,
    ...overrides,
  };
}

function bookingBody(tripId, seatNumbers, overrides = {}) {
  return {
    tripId,
    seatNumbers,
    paymentMethod: 'cash',
    passenger: passenger(),
    ...overrides,
  };
}

async function holdSeats(passengerClient, tripId, seatNumbers) {
  const response = await passengerClient.post('/api/holds', { tripId, seatNumbers });
  expect(response.status).toBe(201);
  return response.body.data.hold;
}

/** Turns on the gateway for one test, with fake credentials. */
async function enableGateway() {
  env.sslcommerz.storeId = 'test-store';
  env.sslcommerz.storePassword = 'test-password';
  await SystemSetting.create({ key: 'global', payments: { onlineEnabled: true, sandbox: true } });
}

function mockGateway(validationOverrides = {}) {
  const fetchMock = vi.fn(async (url) => {
    const target = String(url);
    if (target.includes('gwprocess')) {
      return {
        ok: true,
        json: async () => ({
          status: 'SUCCESS',
          GatewayPageURL: 'https://sandbox.sslcommerz.com/EasyCheckOut/test-session',
        }),
      };
    }
    if (target.includes('validationserverAPI')) {
      return {
        ok: true,
        json: async () => ({
          status: 'VALID',
          val_id: 'VAL-123',
          tran_id: validationOverrides.tran_id,
          amount: '900.00',
          currency: 'BDT',
          bank_tran_id: 'BANK-999',
          card_type: 'VISA-Dutch Bangla',
          card_no: '4111111111111111',
          store_passwd: 'should-never-be-stored',
          ...validationOverrides,
        }),
      };
    }
    throw new Error(`Unexpected fetch: ${target}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function createOnlineBooking(client, tripId, seats = [1]) {
  await holdSeats(client, tripId, seats);
  const response = await client.post(
    '/api/bookings',
    bookingBody(tripId, seats, { paymentMethod: 'sslcommerz' }),
  );
  expect(response.status).toBe(201);
  return response.body.data.booking;
}

afterEach(() => {
  env.sslcommerz.storeId = '';
  env.sslcommerz.storePassword = '';
  vi.unstubAllGlobals();
});

describe('turning a hold into a ticket', () => {
  it('creates a pay-at-counter reservation from the browser’s held seats', async () => {
    const { trip } = await setupTrip();
    const client = guest();
    const hold = await holdSeats(client, trip._id, [1, 2]);

    const response = await client.post('/api/bookings', bookingBody(trip._id, [1, 2]));

    expect(response.status).toBe(201);
    const booking = response.body.data.booking;
    expect(booking.code).toMatch(/^BB-[A-Z0-9]{6}$/);
    expect(booking.status).toBe('pending');
    expect(booking.paymentStatus).toBe('unpaid');
    expect(booking.paymentMethod).toBe('cash');
    expect(booking.channel).toBe('online');
    expect(booking.seats.map((seat) => seat.number)).toEqual([1, 2]);
    expect(booking.totalAmount).toBe(1800);
    expect(booking.verificationCode).toMatch(/^\d{6}$/);
    expect(booking.trip.id).toBe(String(trip._id));
    expect(booking.trip.route.destination.city).toBe('Chattogram');

    const storedSeats = await SeatHold.find({ tripId: trip._id }).lean();
    expect(storedSeats).toHaveLength(2);
    expect(storedSeats.every((seat) => seat.status === 'booked')).toBe(true);
    expect(storedSeats.every((seat) => seat.expiresAt === undefined)).toBe(true);
    expect(storedSeats.every((seat) => Boolean(seat.bookingId))).toBe(true);

    const storedTrip = await Trip.findById(trip._id).lean();
    expect(storedTrip.seatSummary.booked).toBe(2);
    expect(storedTrip.seatSummary.held).toBe(0);

    // Nothing was paid, so no payment row was invented.
    expect(await Payment.countDocuments({})).toBe(0);
    expect(hold.seats).toHaveLength(2);
  });

  it('refuses a booking for seats this browser never held', async () => {
    const { trip } = await setupTrip();
    const client = guest();

    const response = await client.post('/api/bookings', bookingBody(trip._id, [1]));

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/choose the seats again/i);
    expect(await Booking.countDocuments({})).toBe(0);
  });

  it('leaves the owner’s holds untouched when someone else fails to book', async () => {
    const { trip } = await setupTrip();
    const owner = guest();
    const stranger = guest();
    await holdSeats(owner, trip._id, [1]);

    const clash = await stranger.post('/api/bookings', bookingBody(trip._id, [1]));
    expect(clash.status).toBe(409);

    const own = await owner.post('/api/bookings', bookingBody(trip._id, [1]));
    expect(own.status).toBe(201);
  });

  it('rejects an expired hold instead of selling the seat twice', async () => {
    const { trip } = await setupTrip();
    const client = guest();
    await holdSeats(client, trip._id, [3]);

    await SeatHold.updateMany(
      { tripId: trip._id },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } },
    );

    const response = await client.post('/api/bookings', bookingBody(trip._id, [3]));
    expect(response.status).toBe(409);
    expect(await Booking.countDocuments({})).toBe(0);
  });

  it('checks the passenger details and the seats before writing anything', async () => {
    const { trip } = await setupTrip();
    const client = guest();
    await holdSeats(client, trip._id, [1, 2]);

    const noPhone = await client.post(
      '/api/bookings',
      bookingBody(trip._id, [1], { passenger: passenger({ phone: '' }) }),
    );
    expect(noPhone.status).toBe(400);
    expect(noPhone.body.errors?.[0]?.field).toBe('passenger.phone');

    const badSeat = await client.post('/api/bookings', bookingBody(trip._id, [1, 999]));
    expect(badSeat.status).toBe(400);

    const tooMany = await client.post(
      '/api/bookings',
      bookingBody(trip._id, [1, 2, 3, 4, 5, 6, 7]),
    );
    expect(tooMany.status).toBe(400);

    expect(await Booking.countDocuments({})).toBe(0);
    expect(await SeatHold.countDocuments({ tripId: trip._id, status: 'held' })).toBe(2);
  });

  it('advertises payment options honestly on the seat map', async () => {
    const { trip } = await setupTrip();
    const client = guest();

    const seats = await client.get(`/api/trips/${trip._id}/seats`);
    expect(seats.status).toBe(200);
    expect(seats.body.data.paymentOptions).toEqual({ online: false, cashAtCounter: true });
    expect(seats.body.data.paymentWindowMinutes).toBe(15);

    const settings = await request(app).get('/api/public/settings');
    expect(settings.body.data.settings.payments.onlineAvailable).toBe(false);
  });

  it('refuses online payment when the gateway is not configured', async () => {
    const { trip } = await setupTrip();
    const client = guest();
    await holdSeats(client, trip._id, [4]);

    const response = await client.post(
      '/api/bookings',
      bookingBody(trip._id, [4], { paymentMethod: 'sslcommerz' }),
    );

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/online payment is not available/i);
    expect(response.body.errors?.[0]?.field).toBe('paymentMethod');
    expect(await Booking.countDocuments({})).toBe(0);
    // The hold is still the passenger's; they can choose cash instead.
    expect(
      await SeatHold.countDocuments({ tripId: trip._id, status: 'held' }),
    ).toBe(1);
  });
});

describe('the ticket', () => {
  it('opens for the browser that booked it, with its verification code', async () => {
    const { trip } = await setupTrip();
    const client = guest();
    await holdSeats(client, trip._id, [1]);
    const booking = (await client.post('/api/bookings', bookingBody(trip._id, [1]))).body.data
      .booking;

    const response = await client.get(`/api/bookings/${booking.code}`);
    expect(response.status).toBe(200);
    expect(response.body.data.booking.code).toBe(booking.code);
    expect(response.body.data.booking.verificationCode).toBe(booking.verificationCode);
    expect(response.body.data.booking.passenger.phone).toBe(PASSENGER_PHONE);
  });

  it('hides a ticket from another browser and from a wrong phone', async () => {
    const { trip } = await setupTrip();
    const owner = guest();
    const stranger = guest();
    await holdSeats(owner, trip._id, [2]);
    const booking = (await owner.post('/api/bookings', bookingBody(trip._id, [2]))).body.data
      .booking;
    await stranger.get(`/api/trips/${trip._id}/seats`);

    const forbidden = await stranger.get(`/api/bookings/${booking.code}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.data).toBeUndefined();

    const wrongPhone = await stranger.get(
      `/api/bookings/${booking.code}?phone=01999999999`,
    );
    expect(wrongPhone.status).toBe(403);

    const withPhone = await stranger.get(
      `/api/bookings/${booking.code}?phone=${PASSENGER_PHONE}`,
    );
    expect(withPhone.status).toBe(200);
    expect(withPhone.body.data.booking.code).toBe(booking.code);
  });

  it('reopens a ticket on a new device with the ticket number and phone', async () => {
    const { trip } = await setupTrip();
    const client = guest();
    await holdSeats(client, trip._id, [1]);
    const booking = (await client.post('/api/bookings', bookingBody(trip._id, [1]))).body.data
      .booking;

    const found = await request(app)
      .get('/api/bookings/lookup')
      .query({ code: booking.code.toLowerCase(), phone: PASSENGER_PHONE });
    expect(found.status).toBe(200);
    expect(found.body.data.booking.code).toBe(booking.code);

    const wrong = await request(app)
      .get('/api/bookings/lookup')
      .query({ code: booking.code, phone: '01911111111' });
    expect(wrong.status).toBe(404);
    expect(wrong.body.message).toMatch(/no ticket matches/i);
  });

  it('rejects a malformed ticket number before touching the database', async () => {
    const response = await request(app).get('/api/bookings/NOT-A-TICKET');
    expect(response.status).toBe(400);
  });

  it('lists tickets for a signed-in passenger whose phone matches', async () => {
    const { trip } = await setupTrip();
    const client = guest();
    await holdSeats(client, trip._id, [1]);
    const booking = (await client.post('/api/bookings', bookingBody(trip._id, [1]))).body.data
      .booking;

    const owner = await createUser({ phone: PASSENGER_PHONE });
    const cookie = await loginCookie(app, owner);
    const mine = await request(app).get('/api/bookings').set('Cookie', cookie);
    expect(mine.status).toBe(200);
    expect(mine.body.data.bookings.map((item) => item.code)).toContain(booking.code);

    const other = await createUser();
    const otherCookie = await loginCookie(app, other);
    const theirs = await request(app).get('/api/bookings').set('Cookie', otherCookie);
    expect(theirs.status).toBe(200);
    expect(theirs.body.data.bookings).toHaveLength(0);
  });
});

describe('counter sales', () => {
  it('sells a seat for cash and writes a real cash payment', async () => {
    const { api, trip } = await setupTrip();

    const response = await api.post('/api/counter/bookings', {
      tripId: trip._id,
      seatNumbers: [1, 2],
      passenger: passenger({ phone: '01812345678', name: 'Walk-in Passenger' }),
    });

    expect(response.status).toBe(201);
    const booking = response.body.data.booking;
    expect(booking.channel).toBe('counter');
    expect(booking.status).toBe('confirmed');
    expect(booking.paymentStatus).toBe('paid');
    expect(booking.paymentMethod).toBe('cash');
    expect(booking.amountDue).toBe(0);
    expect(booking.verificationCode).toMatch(/^\d{6}$/);

    const cash = await Payment.findOne({ bookingCode: booking.code }).lean();
    expect(cash).toBeTruthy();
    expect(cash.provider).toBe('cash');
    expect(cash.status).toBe('success');
    expect(cash.amount).toBe(1800);

    const seats = await SeatHold.find({ tripId: trip._id }).lean();
    expect(seats.every((seat) => seat.status === 'booked')).toBe(true);
  });

  it('will not sell a seat that an online passenger is holding', async () => {
    const { api, trip } = await setupTrip();
    const online = guest();
    await holdSeats(online, trip._id, [3]);

    const response = await api.post('/api/counter/bookings', {
      tripId: trip._id,
      seatNumbers: [3],
      passenger: passenger({ phone: '01812345679' }),
    });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/held or sold/i);
    expect(await Booking.countDocuments({})).toBe(0);
    expect(
      await SeatHold.countDocuments({ tripId: trip._id, status: 'held' }),
    ).toBe(1);
  });

  it('keeps counter tools away from passengers', async () => {
    const { trip } = await setupTrip();
    const user = await createUser({ role: 'PASSENGER' });
    const cookie = await loginCookie(app, user);
    const client = adminClient(app, cookie);

    const response = await client.post('/api/counter/bookings', {
      tripId: trip._id,
      seatNumbers: [1],
      passenger: passenger(),
    });

    expect(response.status).toBe(403);
  });

  it('collects cash for a pay-at-counter reservation exactly once', async () => {
    const { api, trip } = await setupTrip();
    const client = guest();
    await holdSeats(client, trip._id, [1]);
    const booking = (await client.post('/api/bookings', bookingBody(trip._id, [1]))).body.data
      .booking;
    expect(booking.canPayAtCounter).toBe(true);

    const paid = await api.post(`/api/counter/bookings/${booking.code}/collect`);
    expect(paid.status).toBe(200);
    expect(paid.body.data.booking.status).toBe('confirmed');
    expect(paid.body.data.booking.paymentStatus).toBe('paid');
    expect(paid.body.data.booking.amountDue).toBe(0);

    const cash = await Payment.findOne({ bookingCode: booking.code }).lean();
    expect(cash.status).toBe('success');
    expect(cash.provider).toBe('cash');
    expect(cash.receivedByUserId).toBeTruthy();

    const again = await api.post(`/api/counter/bookings/${booking.code}/collect`);
    expect(again.status).toBe(409);
    expect(await Payment.countDocuments({ bookingCode: booking.code })).toBe(1);
  });

  it('finds a ticket by number or phone for staff', async () => {
    const { api, trip } = await setupTrip();
    const sold = await api.post('/api/counter/bookings', {
      tripId: trip._id,
      seatNumbers: [1],
      passenger: passenger({ phone: '01812345670', name: 'Karim Mia' }),
    });
    const code = sold.body.data.booking.code;

    const byCode = await api.get(`/api/counter/bookings?q=${code}`);
    expect(byCode.status).toBe(200);
    expect(byCode.body.data.bookings).toHaveLength(1);
    expect(byCode.body.data.bookings[0].code).toBe(code);

    const byPhone = await api.get('/api/counter/bookings?q=01812345670');
    expect(byPhone.body.data.bookings[0].code).toBe(code);

    const anonymous = await request(app).get('/api/counter/bookings');
    expect(anonymous.status).toBe(401);
  });
});

describe('unpaid online tickets', () => {
  async function seedExpiredBooking(tripId, overrides = {}) {
    const booking = await Booking.create({
      bookingCode: 'BB-EXPIRE',
      tripId,
      passenger: passenger(),
      seats: [{ seatNumber: 5, seatLabel: 'A5' }],
      seatCount: 1,
      farePerSeat: 900,
      totalAmount: 900,
      payableAmount: 900,
      paymentMethod: 'sslcommerz',
      paymentStatus: 'pending',
      status: 'pending',
      channel: 'online',
      verificationCode: '123456',
      paymentDeadlineAt: new Date(Date.now() - 60_000),
      ...overrides,
    });

    await SeatHold.create({
      tripId,
      seatNumber: 5,
      seatLabel: 'A5',
      status: 'booked',
      bookingId: booking._id,
    });

    return booking;
  }

  it('expires a gateway booking whose payment window ended and frees the seat', async () => {
    const { trip } = await setupTrip();
    const booking = await seedExpiredBooking(trip._id);

    const result = await expireStaleBookings();
    expect(result.expired).toBe(1);
    expect(result.released).toBe(1);

    const stored = await Booking.findById(booking._id).lean();
    expect(stored.status).toBe('expired');
    expect(await SeatHold.countDocuments({ tripId: trip._id })).toBe(0);

    const storedTrip = await Trip.findById(trip._id).lean();
    expect(storedTrip.seatSummary.booked).toBe(0);
  });

  it('never expires a cash reservation waiting at the counter', async () => {
    const { trip } = await setupTrip();
    await seedExpiredBooking(trip._id, {
      bookingCode: 'BB-CASHOK',
      paymentMethod: 'cash',
      paymentDeadlineAt: null,
    });

    const result = await expireStaleBookings();
    expect(result.expired).toBe(0);
    expect(await SeatHold.countDocuments({ tripId: trip._id, status: 'booked' })).toBe(1);
  });
});

describe('SSLCommerz checkout (mocked gateway)', () => {
  it('will not start a checkout while online payment is switched off', async () => {
    const { trip } = await setupTrip();
    const client = guest();
    await holdSeats(client, trip._id, [1]);
    const booking = (await client.post('/api/bookings', bookingBody(trip._id, [1]))).body.data
      .booking;

    const response = await client.post('/api/payments/initiate', { bookingCode: booking.code });
    expect(response.status).toBe(503);
    expect(response.body.message).toMatch(/not configured/i);
  });

  it('creates a gateway session with our payment id as tran_id', async () => {
    await enableGateway();
    const { trip } = await setupTrip();
    const client = guest();
    const booking = await createOnlineBooking(client, trip._id, [1]);

    expect(booking.status).toBe('pending');
    expect(new Date(booking.paymentDeadlineAt).getTime()).toBeGreaterThan(Date.now());

    const fetchMock = mockGateway({ tran_id: 'set-later' });
    const response = await client.post('/api/payments/initiate', { bookingCode: booking.code });

    expect(response.status).toBe(201);
    expect(response.body.data.gatewayPageUrl).toContain('sslcommerz.com');
    expect(response.body.data.sandbox).toBe(true);

    const payment = await Payment.findOne({ bookingCode: booking.code }).lean();
    expect(payment.status).toBe('pending');
    expect(payment.gatewayPageUrl).toContain('sslcommerz.com');

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('gwprocess/v4/api.php');
    expect(options.body).toContain('store_id=test-store');
    expect(options.body).toContain('total_amount=900.00');
    expect(options.body).toContain(`tran_id=${payment.providerTranId}`);
    expect(options.body).toContain(`value_a=${booking.code}`);

    const stored = await Booking.findById(payment.bookingId).lean();
    expect(stored.paymentStatus).toBe('pending');
  });

  it('confirms the ticket only after the validator approves the money', async () => {
    await enableGateway();
    const { trip } = await setupTrip();
    const client = guest();
    const booking = await createOnlineBooking(client, trip._id, [1]);

    mockGateway({ tran_id: 'resolved-at-validation' });
    const initiated = await client.post('/api/payments/initiate', { bookingCode: booking.code });
    expect(initiated.status).toBe(201);

    const paymentBefore = await Payment.findOne({ bookingCode: booking.code }).lean();
    expect(paymentBefore.providerTranId).toBeTruthy();
    // The validator echoes the tran_id we sent; make the mock answer with it.
    globalThis.fetch.mockImplementation(async (url) =>
      String(url).includes('validationserverAPI')
        ? {
            ok: true,
            json: async () => ({
              status: 'VALID',
              val_id: 'VAL-123',
              tran_id: paymentBefore.providerTranId,
              amount: '900.00',
              currency: 'BDT',
              bank_tran_id: 'BANK-999',
              card_type: 'VISA-Dutch Bangla',
              card_no: '4111111111111111',
              store_passwd: 'should-never-be-stored',
            }),
          }
        : { ok: true, json: async () => ({ status: 'SUCCESS', GatewayPageURL: 'https://sandbox.sslcommerz.com/EasyCheckOut/test-session' }) },
    );

    const callback = await request(app)
      .post('/api/payments/callback/success')
      .type('form')
      .send({ tran_id: paymentBefore.providerTranId, val_id: 'VAL-123' });

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain(`/booking/${booking.code}?payment=success`);

    const paidBooking = await Booking.findById(paymentBefore.bookingId).lean();
    expect(paidBooking.status).toBe('confirmed');
    expect(paidBooking.paymentStatus).toBe('paid');
    expect(paidBooking.paymentDeadlineAt).toBeNull();

    const payment = await Payment.findOne({ bookingCode: booking.code }).lean();
    expect(payment.status).toBe('success');
    expect(payment.valId).toBe('VAL-123');
    expect(payment.bankTranId).toBe('BANK-999');
    expect(JSON.stringify(payment.rawValidation)).not.toMatch(/card_no|4111111111111111|should-never/);

    // A repeated IPN must not pay twice or re-validate.
    const repeat = await request(app)
      .post('/api/payments/ipn')
      .type('form')
      .send({ tran_id: paymentBefore.providerTranId, val_id: 'VAL-123' });
    expect(repeat.status).toBe(200);
    expect(repeat.body.handled).toBe(true);
    expect(await Payment.countDocuments({ bookingCode: booking.code })).toBe(1);
  });

  it('rejects a validated payment whose amount does not match the ticket', async () => {
    await enableGateway();
    const { trip } = await setupTrip();
    const client = guest();
    const booking = await createOnlineBooking(client, trip._id, [1]);

    mockGateway({ tran_id: 'resolved-at-validation', amount: '10.00' });
    await client.post('/api/payments/initiate', { bookingCode: booking.code });
    const payment = await Payment.findOne({ bookingCode: booking.code }).lean();
    globalThis.fetch.mockImplementation(async (url) =>
      String(url).includes('validationserverAPI')
        ? {
            ok: true,
            json: async () => ({
              status: 'VALID',
              val_id: 'VAL-123',
              tran_id: payment.providerTranId,
              amount: '10.00',
              currency: 'BDT',
            }),
          }
        : { ok: true, json: async () => ({ status: 'SUCCESS', GatewayPageURL: 'https://sandbox.sslcommerz.com/EasyCheckOut/test-session' }) },
    );

    const callback = await request(app)
      .post('/api/payments/callback/success')
      .type('form')
      .send({ tran_id: payment.providerTranId, val_id: 'VAL-123' });

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toContain('payment=failed');

    const stored = await Booking.findById(payment.bookingId).lean();
    expect(stored.status).toBe('pending');
    expect(stored.paymentStatus).not.toBe('paid');

    const failed = await Payment.findOne({ bookingCode: booking.code }).lean();
    expect(failed.status).toBe('failed');
    expect(failed.failureReason).toMatch(/amount mismatch/i);
  });

  it('records a cancelled checkout without touching the ticket', async () => {
    await enableGateway();
    const { trip } = await setupTrip();
    const client = guest();
    const booking = await createOnlineBooking(client, trip._id, [1]);
    mockGateway({ tran_id: 'resolved-at-validation' });
    await client.post('/api/payments/initiate', { bookingCode: booking.code });
    const payment = await Payment.findOne({ bookingCode: booking.code }).lean();

    const response = await request(app)
      .post('/api/payments/callback/cancel')
      .type('form')
      .send({ tran_id: payment.providerTranId });

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('payment=cancelled');
    expect((await Payment.findById(payment._id).lean()).status).toBe('cancelled');
    expect((await Booking.findById(payment.bookingId).lean()).status).toBe('pending');
  });

  it('answers an IPN for an unknown transaction safely', async () => {
    const response = await request(app)
      .post('/api/payments/ipn')
      .set('Origin', ORIGIN)
      .send({ tran_id: 'not-ours', val_id: 'VAL-X' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, handled: false });
  });
});
