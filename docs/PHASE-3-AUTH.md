# Phase 3 — Authentication, roles and tests

**Goal:** a real session system — register, sign in, sign out, password reset, password change,
role-based authorization, guarded client routes — plus the first automated test suite so later phases
cannot silently break it.

---

## 1. How a session works (the short version)

1. `POST /api/auth/login` checks the password with bcrypt.
2. The server signs a JWT containing the user id, role and a `tokenVersion` counter.
3. The token is sent back in an **httpOnly cookie**, so JavaScript cannot read it.
4. Every later request carries that cookie automatically.
5. `authenticate` verifies the token **and reloads the user from MongoDB**, so a suspended account or a
   changed role takes effect immediately.
6. `authorize('ADMIN')` (or any role list) decides whether that user may touch the endpoint.

The browser never stores the token in `localStorage`, so an XSS bug cannot steal a session.

---

## 2. Files created

### Backend

| File | Why it exists |
|---|---|
| `src/utils/token.js` | Signs/verifies JWTs, and holds the cookie flags (httpOnly, secure, sameSite) in one place. |
| `src/middleware/auth.js` | `authenticate` (who are you?) and `authorize(...roles)` (may you?). |
| `src/middleware/security.js` | CSRF guard: cookie-authenticated writes must come from a trusted Origin. |
| `src/middleware/validate.js` | Runs Zod schemas before the controller; returns per-field errors. |
| `src/middleware/rateLimit.js` | Strict limits for login (10/15 min), register (8/hour) and reset (6/15 min). |
| `src/validators/auth.validator.js` | The authoritative validation rules for every auth endpoint. |
| `src/services/auth.service.js` | All auth business logic (hashing, login checks, reset tokens, password change). |
| `src/controllers/auth.controller.js` | Thin HTTP layer: call service, set cookie, shape JSON. |
| `src/routes/auth.routes.js` | Endpoint wiring with limiters and validation. |
| `src/integrations/mailer.js` | Resend adapter with an honest mock mode (logs instead of pretending). |
| `src/models/User.js` (updated) | Added `tokenVersion` so a password change kills old sessions. |
| `src/config/env.js` (updated) | Added Resend keys, and `assertRuntimeConfig()` which refuses to boot production with a weak/missing JWT secret. |
| `src/app.js` (updated) | CSRF guard mounted after cookie parsing. |
| `tests/setup.js` | Starts a temporary MongoDB, builds real indexes, clears data between tests. |
| `tests/auth.test.js` | 26 tests: registration, login, sessions, roles, reset, change-password, CSRF. |
| `vitest.config.js` | Test configuration (`NODE_ENV=test`, sequential files). |

### Frontend

| File | Why it exists |
|---|---|
| `src/store/authStore.js` | Session state (`unknown` / `authenticated` / `anonymous`) + login/register/logout. Also maps each role to its home page. |
| `src/store/toastStore.js` | Tiny notification store (no dependency). |
| `src/services/auth.api.js` | Endpoint wrappers. |
| `src/schemas/auth.schemas.js` | Zod schemas for the forms, with **translated** messages. |
| `src/components/ui/FormField.jsx` | Labelled input with `aria-invalid` / `aria-describedby` errors. |
| `src/components/ui/Alert.jsx`, `Toaster.jsx`, `FullPageLoader.jsx` | Feedback components. |
| `src/components/routing/ProtectedRoute.jsx` | Requires a session; remembers the intended page and returns there after sign-in. |
| `src/components/routing/RoleRoute.jsx` | Requires one of the allowed roles, else a 403 page. |
| `src/layouts/AuthLayout.jsx` | Centred card shell for the four auth pages. |
| `src/layouts/DashboardLayout.jsx` | Signed-in shell: brand, language switch, user chip, sign out. |
| `src/pages/auth/LoginPage.jsx` | Email **or phone** sign-in. |
| `src/pages/auth/RegisterPage.jsx` | Passenger registration. |
| `src/pages/auth/ForgotPasswordPage.jsx` | Reset request; shows the dev-only link when no mail provider is configured. |
| `src/pages/auth/ResetPasswordPage.jsx` | New password form using the token from the URL. |
| `src/pages/public/AccountPage.jsx` | Profile, session explanation, change-password form. |
| `src/pages/roles/RolePlaceholderPage.jsx` | Honest "phase 4/6/7" page for admin/counter/driver, so no fake dashboard is shown. |
| `src/pages/ForbiddenPage.jsx` | 403 screen naming the required role. |
| `src/utils/formErrors.js` | Maps server field errors onto react-hook-form fields. |
| `src/App.jsx` (updated) | Bootstraps the session once and mounts the toaster. |
| `src/routes/AppRoutes.jsx` (updated) | Public, auth and guarded route trees. |
| `src/components/layout/AppHeader.jsx` (updated) | Auth-aware header (Sign in / Create account / Dashboard). |
| `src/locales/{en,bn}/common.json` (updated) | All new strings in both languages. |

---

## 3. Endpoints

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | public | Always creates a **PASSENGER**. A `role` in the body is ignored. |
| POST | `/api/auth/login` | public | `identifier` = email **or** phone. Rate limited. |
| POST | `/api/auth/logout` | public | Clears the cookie. |
| GET | `/api/auth/me` | signed in | Returns the current user. |
| PATCH | `/api/auth/change-password` | signed in | Requires the current password; issues a fresh token. |
| POST | `/api/auth/forgot-password` | public | Same response whether or not the email exists. |
| POST | `/api/auth/reset-password/:token` | public | Token valid 30 minutes, stored **hashed**. |

Response shape stays consistent with Phase 2: `{ success, message, data }` or
`{ success: false, message, errors: [{ field, message }] }`.

---

## 4. Security decisions (and why)

| Decision | Reason |
|---|---|
| httpOnly + secure + sameSite cookie | XSS cannot read the token. `sameSite=none` is required in production because Vercel and Render are different sites. |
| Origin check on writes (`verifyRequestOrigin`) | `sameSite=none` means a foreign page could POST with the cookie. Writes must carry a trusted `Origin`; requests with no Origin are only accepted without a session cookie. Payment IPN/callback routes are exempt (they are signature-verified in Phase 6). |
| `tokenVersion` in the JWT | Changing or resetting a password invalidates every existing session instantly — no waiting for a 7-day expiry. |
| Fresh user load per request | Suspending an account or changing a role applies on the very next request. |
| Same error for wrong password and unknown account | Prevents attackers from discovering which emails/phones are registered. |
| Status revealed only after a correct password | A suspended account is not public knowledge. |
| bcrypt cost 12, max password 72 chars | 12 is a sensible 2026 cost; the 72-byte cap is bcrypt's real limit, so we reject longer input instead of silently truncating. |
| Zod on the server, mirrored on the client | The browser is never trusted; the client copy only improves the experience. |
| Role never accepted from the client at registration | Otherwise anyone could register as ADMIN. |
| Rate limits per IP | Slows credential stuffing without blocking normal use. |
| `/api/health` and login errors reveal nothing about secrets | The fatal config check runs at boot, not in a response. |

---

## 5. Tests

```bash
cd server
npm test          # one run
npm run test:watch
```

The suite starts a **temporary MongoDB** (`mongodb-memory-server`), builds the real indexes, and wipes
collections between tests — so unique-constraint behaviour is tested for real, not mocked.

26 tests cover:

- registration: safe user object, httpOnly cookie, bcrypt cost-12 hash, duplicate email, duplicate phone,
  validation errors, **attempted role escalation is ignored**
- login: email, phone, identical message for wrong password vs unknown account, suspended account blocked
  only after the correct password
- session: `/me` without a cookie, with a cookie, tampered token, Bearer-token path, logout clears the
  cookie, a suspended user loses access immediately
- roles: passenger → 403 on an admin route, admin → 200, counter user allowed/denied correctly,
  unauthenticated → 401 (not 403)
- password reset: identical response for known/unknown email, full reset (old password fails, new works,
  old session dies), expired token rejected
- change password: wrong current password, successful change issuing a fresh session, replay of the old
  cookie rejected, and the **CSRF guard blocking a cookie write with no Origin**

Frontend tests (Vitest + React Testing Library) come with Phase 5, where the booking form and seat map
carry real interactive risk. Form validation was verified in the browser instead (see below).

---

## 6. Verified in the browser (not just compiled)

| Check | Result |
|---|---|
| Register a passenger through the real form | 201, redirected to `/account`, profile shows name/email/phone/role/status ✅ |
| Passenger visits `/admin` | 403 page naming the required role ✅ |
| Sign out | Cookie cleared, redirected to `/login` ✅ |
| Admin sign-in (`admin@busbook.local`) | Redirected to `/admin` placeholder dashboard ✅ |
| Empty login submit | Bangla inline errors, `aria-invalid` set on both fields ✅ |
| Untrusted Origin on a write | API answers `403`, trusted preview origin passes to validation ✅ |

The Origin check initially blocked the cloud preview hostname — which is exactly the behaviour it should
have. Adding that origin to `CLIENT_URL` (comma-separated) fixed it; you will do the same with your Vercel
URL in Phase 9.

---

## 7. Known limitations (deliberate)

- **Signing out only clears the cookie.** A copied token stays valid until it expires (7 days) or the
  password changes. Refresh-token rotation would fix this; it is out of scope for v1.
- **No email verification** on registration. The `emailVerified` field exists for a later phase.
- **No account lockout** after repeated failures — rate limiting covers the common case.
- **Reset email is mocked** until `RESEND_API_KEY` is set; the dev link is shown in the UI and logged.
- **The role dashboards are placeholders** — they exist so the guards are testable, not to look finished.

---

## 8. Next: Phase 4

Admin management modules (buses, drivers, routes, trips, counters, users, settings) with the real admin
dashboard shell, charts and CRUD APIs — all behind the `ADMIN` guard that already exists.
