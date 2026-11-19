import { afterAll, beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Importing the models registers them with Mongoose, which lets syncIndexes()
// build the real unique/compound indexes the tests rely on.
import '../src/models/User.js';
import '../src/models/SystemSetting.js';
import '../src/models/SeatHold.js';
import '../src/models/Booking.js';
import '../src/models/Payment.js';
import '../src/models/Cancellation.js';
import '../src/models/Notification.js';
import '../src/models/TripLocationUpdate.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('busbooking_test'));
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
