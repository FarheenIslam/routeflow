import request from 'supertest';
import User from '../src/models/User.js';

/** Browsers send Origin on writes; the CSRF guard requires it when a cookie is used. */
export const ORIGIN = 'http://localhost:3000';
export const browser = (req) => req.set('Origin', ORIGIN);

let phoneCounter = 0;

export function uniquePhone() {
  phoneCounter += 1;
  return `019${String(10_000_000 + phoneCounter).slice(0, 8)}`;
}

export function uniqueEmail(prefix = 'user') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

export async function createUser({
  role = 'PASSENGER',
  status = 'active',
  email = uniqueEmail(role.toLowerCase()),
  phone = uniquePhone(),
  password = 'Password123',
  ...rest
} = {}) {
  return User.create({
    name: 'Test User',
    email,
    phone,
    passwordHash: await User.hashPassword(password),
    role,
    status,
    ...rest,
  });
}

export function sessionCookie(response) {
  const cookies = response.headers['set-cookie'] || [];
  const authCookie = cookies.find((cookie) => cookie.startsWith('bb_token='));
  return authCookie ? authCookie.split(';')[0] : null;
}

/** Signs a user in and returns the raw cookie header value. */
export async function loginCookie(app, user, password = 'Password123') {
  const response = await browser(request(app).post('/api/auth/login')).send({
    identifier: user.email,
    password,
  });
  return sessionCookie(response);
}

/** Admin client: every call carries the session cookie and a trusted Origin. */
export function adminClient(app, cookie) {
  const withAuth = (req) => browser(req).set('Cookie', cookie);
  return {
    get: (url) => withAuth(request(app).get(url)),
    post: (url, body) => withAuth(request(app).post(url)).send(body ?? {}),
    patch: (url, body) => withAuth(request(app).patch(url)).send(body ?? {}),
    put: (url, body) => withAuth(request(app).put(url)).send(body ?? {}),
    del: (url) => withAuth(request(app).delete(url)),
  };
}

/** Creates an ADMIN and returns an authenticated client for the admin API. */
export async function asAdmin(app) {
  const user = await createUser({ role: 'ADMIN' });
  const cookie = await loginCookie(app, user);
  return { user, cookie, api: adminClient(app, cookie) };
}
