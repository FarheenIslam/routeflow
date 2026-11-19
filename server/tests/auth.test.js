import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';

import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import { authenticate, authorize } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const app = createApp();

/**
 * Every browser sends an Origin header on a state-changing request, and our
 * CSRF guard requires it when a session cookie is present. Tests send it too,
 * so they exercise the real middleware instead of a relaxed version.
 */
const ORIGIN = 'http://localhost:3000';
const browser = (req) => req.set('Origin', ORIGIN);

const passenger = {
  name: 'Rahim Uddin',
  email: 'rahim@example.com',
  phone: '01711111111',
  password: 'Password123',
};

function sessionCookie(response) {
  const cookies = response.headers['set-cookie'] || [];
  const authCookie = cookies.find((cookie) => cookie.startsWith('bb_token='));
  return authCookie ? authCookie.split(';')[0] : null;
}

async function createUser(overrides) {
  return User.create({
    name: 'Test User',
    email: `user-${crypto.randomUUID()}@example.com`,
    // Valid BD format: 01[3-9] + 8 digits.
    phone: `01${3 + Math.floor(Math.random() * 7)}${String(
      Math.floor(Math.random() * 100_000_000),
    ).padStart(8, '0')}`,
    passwordHash: await User.hashPassword('Password123'),
    role: 'PASSENGER',
    status: 'active',
    ...overrides,
  });
}

describe('POST /api/auth/register', () => {
  it('creates a passenger, returns a safe user object and sets an httpOnly cookie', async () => {
    const response = await browser(request(app).post('/api/auth/register')).send(passenger);

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({
      name: passenger.name,
      email: passenger.email,
      phone: passenger.phone,
      role: 'PASSENGER',
      status: 'active',
    });
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.user.passwordResetTokenHash).toBeUndefined();

    const cookie = response.headers['set-cookie'].join(';');
    expect(cookie).toContain('bb_token=');
    expect(cookie.toLowerCase()).toContain('httponly');
  });

  it('stores a bcrypt hash, never the raw password', async () => {
    await browser(request(app).post('/api/auth/register')).send(passenger);

    const stored = await User.findOne({ email: passenger.email }).select('+passwordHash');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(stored.passwordHash).not.toContain(passenger.password);
  });

  it('rejects a duplicate email with 409 and a field-level error', async () => {
    await browser(request(app).post('/api/auth/register')).send(passenger);
    const response = await browser(request(app).post('/api/auth/register')).send({
      ...passenger,
      phone: '01799999999',
    });

    expect(response.status).toBe(409);
    expect(response.body.errors?.[0]?.field).toBe('email');
  });

  it('rejects a duplicate phone number with 409', async () => {
    await browser(request(app).post('/api/auth/register')).send(passenger);
    const response = await browser(request(app).post('/api/auth/register')).send({
      ...passenger,
      email: 'other@example.com',
    });

    expect(response.status).toBe(409);
    expect(response.body.errors?.[0]?.field).toBe('phone');
  });

  it('validates the payload (bad phone, short password)', async () => {
    const response = await browser(request(app).post('/api/auth/register')).send({
      name: 'A',
      email: 'not-an-email',
      phone: '12345',
      password: 'abc',
    });

    expect(response.status).toBe(400);
    const fields = response.body.errors.map((error) => error.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'phone', 'password']));
  });

  it('ignores an attempted role escalation in the body', async () => {
    const response = await browser(request(app).post('/api/auth/register')).send({
      ...passenger,
      role: 'ADMIN',
      status: 'suspended',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe('PASSENGER');
    expect(response.body.data.user.status).toBe('active');
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with email', async () => {
    await browser(request(app).post('/api/auth/register')).send(passenger);
    const response = await browser(request(app).post('/api/auth/login')).send({
      identifier: passenger.email,
      password: passenger.password,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(passenger.email);
    expect(sessionCookie(response)).toBeTruthy();
  });

  it('signs in with phone number', async () => {
    await browser(request(app).post('/api/auth/register')).send(passenger);
    const response = await browser(request(app).post('/api/auth/login')).send({
      identifier: passenger.phone,
      password: passenger.password,
    });

    expect(response.status).toBe(200);
  });

  it('answers the same way for a wrong password and an unknown account', async () => {
    await browser(request(app).post('/api/auth/register')).send(passenger);

    const wrongPassword = await browser(request(app).post('/api/auth/login')).send({
      identifier: passenger.email,
      password: 'WrongPassword123',
    });
    const unknownAccount = await browser(request(app).post('/api/auth/login')).send({
      identifier: 'nobody@example.com',
      password: 'WrongPassword123',
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownAccount.body.message);
  });

  it('blocks a suspended account only after the correct password', async () => {
    const user = await createUser({ status: 'suspended', email: 'sus@example.com' });

    const wrongPassword = await browser(request(app).post('/api/auth/login')).send({
      identifier: user.email,
      password: 'WrongPassword123',
    });
    const correctPassword = await browser(request(app).post('/api/auth/login')).send({
      identifier: user.email,
      password: 'Password123',
    });

    expect(wrongPassword.status).toBe(401);
    expect(correctPassword.status).toBe(403);
    expect(correctPassword.body.message).toMatch(/suspended/i);
  });
});

describe('session endpoints', () => {
  it('GET /api/auth/me requires a session', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('returns the current user with a valid cookie', async () => {
    const agent = request.agent(app);
    await browser(agent.post('/api/auth/register')).send(passenger);

    const response = await agent.get('/api/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(passenger.email);
  });

  it('rejects a tampered token', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'bb_token=not.a.real.token');
    expect(response.status).toBe(401);
  });

  it('accepts the token from Authorization: Bearer as well as from the cookie', async () => {
    await browser(request(app).post('/api/auth/register')).send(passenger);
    const login = await browser(request(app).post('/api/auth/login')).send({
      identifier: passenger.email,
      password: passenger.password,
    });

    const token = sessionCookie(login).split('=')[1];
    const withBearer = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    const withGarbage = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer garbage.token.value');

    expect(withBearer.status).toBe(200);
    expect(withGarbage.status).toBe(401);
  });

  it('logout clears the cookie and ends the session', async () => {
    const agent = request.agent(app);
    await browser(agent.post('/api/auth/register')).send(passenger);

    const logout = await browser(agent.post('/api/auth/logout'));
    expect(logout.status).toBe(200);
    expect(logout.headers['set-cookie'].join(';')).toMatch(/bb_token=;/);

    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(401);
  });

  it('blocks a suspended user who already holds a token', async () => {
    const agent = request.agent(app);
    await browser(agent.post('/api/auth/register')).send(passenger);
    await User.updateOne({ email: passenger.email }, { $set: { status: 'suspended' } });

    const response = await agent.get('/api/auth/me');
    expect(response.status).toBe(403);
  });
});

describe('role-based authorization', () => {
  /** Mirrors how admin/counter/driver routes will be declared in later phases. */
  function guardedApp() {
    const guarded = express();
    guarded.use(express.json());
    guarded.use(cookieParser());
    guarded.get('/admin-only', authenticate, authorize('ADMIN'), (req, res) =>
      res.json({ success: true, role: req.user.role }),
    );
    guarded.get(
      '/counter-or-admin',
      authenticate,
      authorize('ADMIN', 'COUNTER'),
      (req, res) => res.json({ success: true, role: req.user.role }),
    );
    guarded.use(errorHandler);
    return guarded;
  }

  const guarded = guardedApp();

  async function loginAs(role) {
    const user = await createUser({ role });
    const response = await browser(request(app).post('/api/auth/login')).send({
      identifier: user.email,
      password: 'Password123',
    });
    return sessionCookie(response);
  }

  it('denies a passenger on an admin-only route', async () => {
    const cookie = await loginAs('PASSENGER');
    const response = await request(guarded).get('/admin-only').set('Cookie', cookie);

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/ADMIN/);
  });

  it('allows an admin on an admin-only route', async () => {
    const cookie = await loginAs('ADMIN');
    const response = await request(guarded).get('/admin-only').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.role).toBe('ADMIN');
  });

  it('allows a counter user where COUNTER is permitted but not where it is not', async () => {
    const cookie = await loginAs('COUNTER');

    const allowed = await request(guarded).get('/counter-or-admin').set('Cookie', cookie);
    const denied = await request(guarded).get('/admin-only').set('Cookie', cookie);

    expect(allowed.status).toBe(200);
    expect(denied.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401, not 403', async () => {
    const response = await request(guarded).get('/admin-only');
    expect(response.status).toBe(401);
  });
});

describe('password reset', () => {
  it('always gives the same answer, whether or not the email exists', async () => {
    await browser(request(app).post('/api/auth/register')).send(passenger);

    const known = await browser(request(app).post('/api/auth/forgot-password')).send({
      email: passenger.email,
    });
    const unknown = await browser(request(app).post('/api/auth/forgot-password')).send({
      email: 'nobody@example.com',
    });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
    // The dev-only shortcut exists for the real account and not for the unknown one.
    expect(known.body.data?.devResetUrl).toBeTruthy();
    expect(unknown.body.data).toBeNull();
  });

  it('resets the password and invalidates the old one and old sessions', async () => {
    const agent = request.agent(app);
    await browser(agent.post('/api/auth/register')).send(passenger);

    const forgot = await browser(request(app).post('/api/auth/forgot-password')).send({
      email: passenger.email,
    });
    const token = forgot.body.data.devResetUrl.split('/').pop();

    const reset = await browser(request(app).post(`/api/auth/reset-password/${token}`)).send({
      password: 'BrandNewPass123',
    });
    expect(reset.status).toBe(200);

    // The session that existed before the reset must no longer work.
    const oldSession = await agent.get('/api/auth/me');
    expect(oldSession.status).toBe(401);

    // Old password fails, new password works.
    const oldPassword = await browser(request(app).post('/api/auth/login')).send({
      identifier: passenger.email,
      password: passenger.password,
    });
    const newPassword = await browser(request(app).post('/api/auth/login')).send({
      identifier: passenger.email,
      password: 'BrandNewPass123',
    });
    expect(oldPassword.status).toBe(401);
    expect(newPassword.status).toBe(200);
  });

  it('rejects an expired reset token', async () => {
    const user = await createUser({ email: 'expired@example.com' });
    const rawToken = 'a'.repeat(64);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetTokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
          passwordResetExpiresAt: new Date(Date.now() - 1000),
        },
      },
    );

    const response = await browser(
      request(app).post(`/api/auth/reset-password/${rawToken}`),
    ).send({ password: 'AnotherPass123' });

    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/auth/change-password', () => {
  it('requires the current password', async () => {
    const agent = request.agent(app);
    await browser(agent.post('/api/auth/register')).send(passenger);

    const response = await browser(agent.patch('/api/auth/change-password')).send({
      currentPassword: 'WrongOne123',
      newPassword: 'AnotherPass123',
    });

    expect(response.status).toBe(400);
    expect(response.body.errors?.[0]?.field).toBe('currentPassword');
  });

  it('updates the password and issues a fresh session', async () => {
    const agent = request.agent(app);
    const registered = await browser(agent.post('/api/auth/register')).send(passenger);
    const oldCookie = sessionCookie(registered);

    const response = await browser(agent.patch('/api/auth/change-password')).send({
      currentPassword: passenger.password,
      newPassword: 'AnotherPass123',
    });

    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toBeTruthy();

    // The same browser keeps working with the refreshed cookie.
    const after = await agent.get('/api/auth/me');
    expect(after.status).toBe(200);

    // A token captured before the change is dead.
    if (oldCookie) {
      const replayed = await request(app).get('/api/auth/me').set('Cookie', oldCookie);
      expect(replayed.status).toBe(401);
    }
  });

  it('blocks a cookie-authenticated write with no Origin header (CSRF guard)', async () => {
    const agent = request.agent(app);
    const registered = await browser(agent.post('/api/auth/register')).send(passenger);
    const cookie = sessionCookie(registered);

    const response = await request(app)
      .patch('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: passenger.password, newPassword: 'AnotherPass123' });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/Origin/i);
  });
});
