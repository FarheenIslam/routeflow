import Bus from '../models/Bus.js';
import Driver from '../models/Driver.js';
import Route from '../models/Route.js';
import Counter from '../models/Counter.js';
import Trip from '../models/Trip.js';
import User from '../models/User.js';
import { ROLES, USER_STATUS } from '../config/constants.js';
import { logger } from '../config/logger.js';
import { createTrip } from '../services/trip.service.js';
import { dhakaDateTime } from '../utils/query.js';

/**
 * DEMO DATA — development only.
 *
 * Real operators enter their own fleet through the admin panel. This exists so
 * the dashboard and seat map have something to show while building. It only runs
 * when SEED_DEMO_DATA is not "false", and it never touches existing records.
 */

function isoDate(offsetDays) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

/**
 * A real COUNTER login attached to CT-01, so the Phase 6 counter dashboard can
 * be tried without the admin account. Demo only — never use this password
 * outside development.
 */
async function seedCounterStaff() {
  const email = 'counter@busbook.local';
  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({
      name: 'Gabtoli Counter Staff',
      email,
      phone: '01711000199',
      passwordHash: await User.hashPassword('Counter@12345'),
      role: ROLES.COUNTER,
      status: USER_STATUS.ACTIVE,
      emailVerified: true,
    });
    logger.info(`Counter staff created: ${email} (password Counter@12345)`);
  }

  await Counter.updateOne({ code: 'CT-01' }, { $addToSet: { staffUserIds: user._id } });
}

/**
 * A real DRIVER login attached to the first demo driver. Like the counter login
 * it is ensured on every seed run, after the driver exists.
 */
async function seedDriverStaff() {
  const driver = await Driver.findOne({ licenseNumber: 'DL-DHK-1001' });
  if (!driver) return;

  const email = 'driver@busbook.local';
  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({
      name: 'Abdul Karim',
      email,
      phone: '01811000111',
      passwordHash: await User.hashPassword('Driver@12345'),
      role: ROLES.DRIVER,
      status: USER_STATUS.ACTIVE,
      emailVerified: true,
    });
    logger.info(`Driver login created: ${email} (password Driver@12345)`);
  }

  if (!driver.userId) {
    await Driver.updateOne({ _id: driver._id }, { $set: { userId: user._id } });
  }
}

export async function seedDemoData() {
  await Counter.updateOne(
    { code: 'CT-01' },
    {
      $setOnInsert: {
        code: 'CT-01',
        name: 'Gabtoli Counter',
        branchName: 'Gabtoli Bus Terminal',
        address: { street: 'Gabtoli', city: 'Dhaka', division: 'Dhaka' },
        phone: '01711000111',
        commissionPercent: 5,
      },
    },
    { upsert: true },
  );
  await Counter.updateOne(
    { code: 'CT-02' },
    {
      $setOnInsert: {
        code: 'CT-02',
        name: 'Saydabad Counter',
        branchName: 'Saydabad Bus Terminal',
        address: { street: 'Saydabad', city: 'Dhaka', division: 'Dhaka' },
        phone: '01711000222',
        commissionPercent: 5,
      },
    },
    { upsert: true },
  );

  // The counter login must exist *after* CT-01 does, and it must be attached even
  // when trips already exist (that is the normal case on a second seed run).
  await seedCounterStaff();
  await seedDriverStaff();

  const existingTrips = await Trip.countDocuments();
  if (existingTrips > 0) {
    logger.info('Demo data skipped: trips already exist.');
    return;
  }

  const routeSeeds = [
    {
      code: 'R-DHK-CTG',
      name: 'Dhaka → Chattogram',
      origin: { name: 'Dhaka', city: 'Dhaka', lat: 23.8103, lng: 90.4125 },
      destination: { name: 'Chattogram', city: 'Chattogram', lat: 22.3569, lng: 91.7832 },
      stops: [
        { name: 'Cumilla', lat: 23.4607, lng: 91.1809, order: 0, offsetMinutesFromOrigin: 120, distanceFromOriginKm: 100 },
        { name: 'Feni', lat: 23.0159, lng: 91.3976, order: 1, offsetMinutesFromOrigin: 190, distanceFromOriginKm: 165 },
      ],
      totalDistanceKm: 264,
      estimatedDurationMinutes: 330,
    },
    {
      code: 'R-DHK-SYL',
      name: 'Dhaka → Sylhet',
      origin: { name: 'Dhaka', city: 'Dhaka', lat: 23.8103, lng: 90.4125 },
      destination: { name: 'Sylhet', city: 'Sylhet', lat: 24.8949, lng: 91.8687 },
      stops: [
        { name: 'Bhairab', lat: 24.0500, lng: 90.9800, order: 0, offsetMinutesFromOrigin: 110, distanceFromOriginKm: 90 },
        { name: 'Moulvibazar', lat: 24.4829, lng: 91.7774, order: 1, offsetMinutesFromOrigin: 230, distanceFromOriginKm: 200 },
      ],
      totalDistanceKm: 240,
      estimatedDurationMinutes: 300,
    },
    {
      code: 'R-DHK-RJH',
      name: 'Dhaka → Rajshahi',
      origin: { name: 'Dhaka', city: 'Dhaka', lat: 23.8103, lng: 90.4125 },
      destination: { name: 'Rajshahi', city: 'Rajshahi', lat: 24.3745, lng: 88.6042 },
      stops: [
        { name: 'Pabna', lat: 24.0064, lng: 89.2372, order: 0, offsetMinutesFromOrigin: 210, distanceFromOriginKm: 160 },
      ],
      totalDistanceKm: 250,
      estimatedDurationMinutes: 330,
    },
    {
      code: 'R-DHK-KHL',
      name: 'Dhaka → Khulna',
      origin: { name: 'Dhaka', city: 'Dhaka', lat: 23.8103, lng: 90.4125 },
      destination: { name: 'Khulna', city: 'Khulna', lat: 22.8456, lng: 89.5403 },
      stops: [
        { name: 'Jashore', lat: 23.1664, lng: 89.2081, order: 0, offsetMinutesFromOrigin: 220, distanceFromOriginKm: 165 },
      ],
      totalDistanceKm: 270,
      estimatedDurationMinutes: 360,
    },
  ];

  const routes = [];
  for (const seed of routeSeeds) {
    const route = await Route.findOneAndUpdate(
      { code: seed.code },
      { $setOnInsert: seed },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    routes.push(route);
  }

  const busSeeds = [
    { busNumber: 'DHAKA-METRO-BA-11-2233', operatorName: 'Shohag Paribahan', busType: 'AC', seatLayout: { rows: 10, columns: 4, aisleAfterColumn: 2, seatPrefix: 'A', disabledSeats: [] } },
    { busNumber: 'DHAKA-METRO-BA-11-4455', operatorName: 'Hanif Enterprise', busType: 'NON_AC', seatLayout: { rows: 11, columns: 4, aisleAfterColumn: 2, seatPrefix: 'B', disabledSeats: [1, 44] } },
    { busNumber: 'DHAKA-METRO-BA-12-7788', operatorName: 'Ena Transport', busType: 'AC_SLEEPER', seatLayout: { rows: 8, columns: 3, aisleAfterColumn: 1, seatPrefix: 'S', disabledSeats: [] } },
    { busNumber: 'DHAKA-METRO-BA-13-9900', operatorName: 'Green Line', busType: 'HIACE', seatLayout: { rows: 6, columns: 3, aisleAfterColumn: 1, seatPrefix: 'H', disabledSeats: [] } },
  ];

  const buses = [];
  for (const seed of busSeeds) {
    // Updates skip the document's derive-total-seats hook, so the count is set
    // explicitly here rather than relying on the upsert.
    const { rows, columns, disabledSeats } = seed.seatLayout;
    const totalSeats = rows * columns - disabledSeats.length;

    const bus = await Bus.findOneAndUpdate(
      { busNumber: seed.busNumber },
      { $setOnInsert: { ...seed, totalSeats } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    buses.push(bus);
  }

  const driverSeeds = [
    { name: 'Abdul Karim', phone: '01811000111', licenseNumber: 'DL-DHK-1001' },
    { name: 'Jashim Uddin', phone: '01811000222', licenseNumber: 'DL-DHK-1002' },
    { name: 'Mizanur Rahman', phone: '01811000333', licenseNumber: 'DL-DHK-1003' },
    { name: 'Sohel Rana', phone: '01811000444', licenseNumber: 'DL-DHK-1004' },
  ];

  const drivers = [];
  for (const [index, seed] of driverSeeds.entries()) {
    const driver = await Driver.findOneAndUpdate(
      { licenseNumber: seed.licenseNumber },
      { $setOnInsert: { ...seed, assignedBusId: buses[index]._id } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    drivers.push(driver);
  }

  await seedDriverStaff();

  // Two departures per day for the next three days.
  const schedule = [
    { dayOffset: 0, time: '08:00', route: 0, bus: 0, driver: 0, fare: 1200 },
    { dayOffset: 0, time: '21:00', route: 1, bus: 1, driver: 1, fare: 900 },
    { dayOffset: 1, time: '08:00', route: 2, bus: 2, driver: 2, fare: 1000 },
    { dayOffset: 1, time: '21:00', route: 3, bus: 3, driver: 3, fare: 850 },
    { dayOffset: 2, time: '08:00', route: 1, bus: 0, driver: 1, fare: 1200 },
    { dayOffset: 2, time: '21:00', route: 0, bus: 2, driver: 0, fare: 1000 },
  ];

  let created = 0;
  for (const entry of schedule) {
    try {
      await createTrip({
        routeId: routes[entry.route]._id,
        busId: buses[entry.bus]._id,
        driverId: drivers[entry.driver]._id,
        departureDate: isoDate(entry.dayOffset),
        departureTime: entry.time,
        fare: entry.fare,
        boardingPoints: ['Gabtoli', 'Saydabad'],
        droppingPoints: [routes[entry.route].destination.name],
      });
      created += 1;
    } catch (error) {
      logger.warn(`Demo trip skipped (${entry.time}): ${error.message}`);
    }
  }

  logger.info(
    `Demo data ready: 2 counters, ${routes.length} routes, ${buses.length} buses, ${drivers.length} drivers, ${created} trips.`,
  );

  // Keep the helper import meaningful for future date-based demo trips.
  void dhakaDateTime;
}
