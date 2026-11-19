# BusBook — Bus Counter & Seat Booking System (MERN)

A bus counter and seat booking platform for **passengers, counter staff, drivers and administrators**.
Built with **JavaScript only**: React (Vite) + Tailwind on the front end, Express + Mongoose on the back end,
**MongoDB Atlas** as the database.

> **Build status: Phase 9 prepared.** Phases 1–8 are complete and tested. Phase 9 adds the Render Blueprint,
> the Vercel configuration, production config guards and a deployment verification script. An actual production
> deployment needs the owner's Atlas, Render and Vercel accounts — see [docs/PHASE-9.md](docs/PHASE-9.md).
> Nothing in this repo pretends to work before it does.

---

## 1. What works right now

| Area | Status |
|---|---|
| Express API with security middleware, CORS allowlist, rate limiting, JSON errors | ✅ working |
| MongoDB Atlas connection + health reporting | ✅ working (needs your `MONGODB_URI`) |
| `User` model (4 roles, bcrypt hashing, unique email/phone, text indexes) | ✅ working |
| `SystemSettings` model (cancellation policy, hold minutes, languages) | ✅ working |
| Seed script (idempotent: settings + first admin) | ✅ working |
| React shell, design tokens, Bangla ⇄ English switcher, live status card | ✅ working |
| Register, login (email or phone), logout, password reset & change | ✅ working |
| JWT in an httpOnly cookie, role guards, CSRF origin check, rate limiting | ✅ working |
| Admin dashboard: real KPI counts, trips-by-status and next-7-days charts | ✅ working |
| Admin management: buses, drivers, routes, trips, counters, staff accounts | ✅ working |
| Trip scheduling with bus/driver conflict guards and cancel-to-free-slot | ✅ working |
| System settings: cancellation policy, booking limits, notifications, payments, ticket text | ✅ working |
| Demo fleet seed for a fresh install (`SEED_DEMO_DATA`) | ✅ working |
| Public trip search (origin, destination, date, bus type) | ✅ working |
| Live seat map with aisle, disabled seats and per-seat status | ✅ working |
| 2-minute server-side seat holds (race-safe, guest cookie, sweeper) | ✅ working |
| Booking/ticket creation from held seats, `BB-XXXXXX` ticket numbers | ✅ working |
| Printable ticket page, ticket lookup by number + phone, my tickets | ✅ working |
| Pay-at-counter reservations (honest `unpaid`, no auto-expiry) | ✅ working |
| Counter dashboard: sell seats for cash, search tickets, collect cash | ✅ working |
| SSLCommerz sandbox checkout (server-side validation, idempotent IPN) | ✅ implemented, mocked-gateway tests (real sandbox keys not verified) |
| Payment-window expiry sweeper that releases unpaid gateway seats | ✅ working |
| Cancellation with policy-based refund amount, seat release and one-cancel guard | ✅ working |
| Admin cancellation and refund tracking (approve / reject / processed, method + reference) | ✅ working |
| Email and SMS notification log (mock mode until provider credentials are set) | ✅ implemented, mock-verified |
| Driver console: own trips, status transitions, passenger manifest, manual location | ✅ working |
| Sales reports: collected, net after refunds, routes, counters, payment mix, daily totals | ✅ working |
| CSV export of bookings for a selected date range | ✅ working |
| Leaflet map of route stops and the last manual driver position | ✅ working |
| Bangla and English locale keys at full parity | ✅ working |
| Backend test suite (Vitest + Supertest + real MongoDB) — 117 tests | ✅ passing |
| Frontend test suite (Vitest + Testing Library) — 8 tests | ✅ passing |
| Deployment blueprint, production guards and smoke-check script | ✅ prepared (needs owner accounts) |

---

## 2. Requirements

- **Node.js 20 or newer** (`node -v`) — tested on Node 26.
- **npm** (comes with Node).
- A free **MongoDB Atlas** account → [cloud.mongodb.com](https://cloud.mongodb.com).
- Git (optional, for version control).

---

## 3. First-time setup

### 3.1 Backend (`server/`)

Open a terminal **in the project root**, then:

```bash
cd server
npm install
cp .env.example .env          # Windows PowerShell: copy .env.example .env
```

Open `server/.env` and paste your Atlas connection string into `MONGODB_URI`
(step-by-step Atlas instructions: [docs/PHASE-2-SETUP.md](docs/PHASE-2-SETUP.md)).

Then create the settings document, the indexes and your first admin account:

```bash
npm run seed
npm run dev
```

You should see:

```
[INFO] MongoDB connected (database: busbooking)
[INFO] API listening on http://localhost:5000/api/health
```

Check it in a second terminal:

```bash
curl http://localhost:5000/api/health
```

### 3.2 Frontend (`client/`)

Open a **second terminal** at the project root (leave the backend running):

```bash
cd client
npm install
npm run dev
```

Open **http://localhost:3000**. The status card on the home page should show
**API: Online** and **Database: Connected**.

> Locally you do **not** need `client/.env`. Vite proxies `/api` to `http://localhost:5000`,
> so the browser talks to one origin — no CORS problems while developing.

---

## 4. Environment variables

### Backend — `server/.env` (never committed)

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | yes | API port, default `5000` |
| `NODE_ENV` | yes | `development` or `production` |
| `MONGODB_URI` | yes | MongoDB Atlas connection string |
| `CLIENT_URL` | yes | Allowed browser origin(s), comma separated |
| `JWT_SECRET` | from Phase 3 | Signs login tokens |
| `JWT_EXPIRES_IN` | no | Token lifetime, default `7d` |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PHONE` / `ADMIN_PASSWORD` | for `npm run seed` | First admin account |
| `SEED_DEMO_DATA` | no | `false` skips the demo fleet seed (default `true`) |
| `RESEND_API_KEY`, `MAIL_FROM` | from Phase 7 | Email delivery (mock mode until set) |
| `SSL_WIRELESS_*` | from Phase 7 | SMS delivery (mock mode until set) |
| `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` | for online payment | Sandbox store credentials (leave empty to offer pay-at-counter only) |
| `SSLCOMMERZ_SANDBOX` | no | `true` (default) uses the sandbox gateway; `false` is live |
| `API_PUBLIC_URL` | for online payment | Public HTTPS origin of this API; the gateway calls back there |

### Frontend — `client/.env` (public values only)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Deployed API origin + `/api`. Empty locally because of the Vite proxy. |

**Anything starting with `VITE_` is downloaded by every visitor's browser.**
Never put a database URI, JWT secret or payment key there.

---

## 5. Scripts

### `server/`

| Command | What it does |
|---|---|
| `npm run dev` | Start the API with auto-restart on file changes |
| `npm start` | Start the API once (production) |
| `npm run seed` | Create indexes, settings and the first admin (safe to repeat) |
| `npm test` | Run the API test suite (uses a temporary in-memory MongoDB) |
| `npm run test:watch` | Re-run tests while you edit |

### `client/`

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite on port 3000 |
| `npm run build` | Production build into `client/dist` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint the frontend |
| `npm test` | Run the component tests once (Vitest + Testing Library) |
| `npm run test:watch` | Re-run component tests while you edit |

---

## 6. Folder map

```
bus-booking-system/
├── client/                  React app (Vite + Tailwind)
│   ├── src/components/      reusable UI (ui/, layout/, common/, routing/, health/)
│   ├── src/pages/           screens (public/, auth/, roles/)
│   ├── src/layouts/         public, auth and dashboard shells
│   ├── src/routes/          route table with protected/role trees
│   ├── src/services/        axios instance + endpoint wrappers
│   ├── src/store/           Zustand auth and toast stores
│   ├── src/schemas/         Zod form schemas (translated messages)
│   ├── src/locales/         en/ and bn/ translation JSON
│   ├── src/utils/           formatting + form error helpers
│   └── src/config/          brand + runtime constants
├── server/                  Express API
│   ├── server.js            starts the API (listen / shutdown)
│   ├── src/app.js           builds the middleware + route stack
│   ├── src/config/          env, database, logger, constants
│   ├── src/models/          Mongoose schemas
│   ├── src/routes/          API routers
│   ├── src/middleware/      auth, roles, validation, CSRF, rate limits, errors
│   ├── src/services/        business logic (auth, seats, bookings, payments)
│   ├── src/validators/      Zod request schemas
│   ├── src/integrations/    email, SMS and payments (mock until credentials are set)
│   ├── src/utils/           ApiError, asyncHandler, JWT/cookie helpers
│   ├── src/seed/            database seeding
│   └── tests/               Vitest + Supertest suite
├── docs/                    plan, setup guide, decisions
└── .gitignore
```

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Status card says **"Cannot reach the API"** | The backend is not running. Start it with `npm run dev` in `server/`. |
| **Database: Not configured** | `MONGODB_URI` in `server/.env` is empty or still a placeholder. |
| `MongooseServerSelectionError` | Wrong password, or your IP is not allowed. Atlas → **Network Access** → add `0.0.0.0/0` for development. |
| `querySrv ENOTFOUND` | Some networks block SRV DNS lookups. In Atlas use the **standard** (non-`+srv`) connection string. |
| `E11000 duplicate key` | You tried to reuse an existing email/phone. Use another one. |
| `Port 5000 is already in use` | Another process owns the port: stop it, or change `PORT` in `server/.env`. |
| Browser shows a **403 CORS** error | `CLIENT_URL` in `server/.env` must exactly match the browser origin (scheme + host + port). It accepts a comma-separated list, e.g. `http://localhost:3000,https://your-app.vercel.app`. |
| `Origin … is not allowed to call this API` | Same cause: add that origin to `CLIENT_URL` and restart the API. |
| Tests fail with `MongoMemoryServer` download errors | The first `npm test` downloads a MongoDB binary (~100 MB). Retry on a stable connection. |

---

## 8. Security rules for this project

1. `server/.env` is git-ignored — keep it that way. Commit only `.env.example`.
2. `JWT_SECRET` must be long and random in production:
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
3. Passwords are stored as bcrypt hashes (cost 12), never as text.
4. The browser never receives database credentials, payment keys or the JWT itself (httpOnly cookie, from Phase 3).
5. Change the seeded admin password (`ADMIN_PASSWORD`) before deploying.

---

## 9. Deployment

The repository is deployment-ready; the actual accounts and secrets belong to the owner.

1. **MongoDB Atlas** — create the cluster, database user and network rule, then run `npm run seed`
   locally against Atlas with `SEED_DEMO_DATA=false`.
2. **Render** — import the repo and apply `render.yaml`; set `MONGODB_URI`, `CLIENT_URL` and
   `API_PUBLIC_URL`. Health check: `/api/health`.
3. **Vercel** — import the repo with Root Directory `client`; set
   `VITE_API_BASE_URL=https://<your-api>.onrender.com/api`.
4. **Verify** — `PROD_API_URL=… PROD_CLIENT_URL=… node scripts/verify-deployment.mjs`.

Full step-by-step guide, environment table, manual smoke flow and rollback:
[docs/PHASE-9.md](docs/PHASE-9.md).

---

## 10. Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, database design, API map, risks | ✅ approved |
| 2 | Project scaffold, Atlas connection, health API, seed | ✅ complete |
| 3 | Auth: register, login, logout, JWT cookie, roles, tests | ✅ complete |
| 4 | Admin: buses, drivers, routes, trips, counters, users, settings, dashboard | ✅ complete |
| 5 | Passenger site: search, seat map, 2-minute server-side holds | ✅ complete |
| 6 | Booking, counter sales, SSLCommerz sandbox, tickets | ✅ complete |
| 7 | Cancellation & refund tracking, email/SMS, driver portal, manual location | ✅ complete |
| 8 | Reports + CSV exports, Leaflet map, full Bangla/English coverage | ✅ complete |
| 9 | Deployment blueprint (Render + Vercel + Atlas), guards and verification script | ✅ prepared; deploy with owner accounts |

Full architecture and database design: [docs/PHASE-1-PLAN.md](docs/PHASE-1-PLAN.md).
Phase 2 walkthrough (Atlas setup, file-by-file explanation): [docs/PHASE-2-SETUP.md](docs/PHASE-2-SETUP.md).
Phase 3 walkthrough (auth, roles, security decisions, tests): [docs/PHASE-3-AUTH.md](docs/PHASE-3-AUTH.md).
Phase 4 walkthrough (admin modules, business rules, demo seed, tests): [docs/PHASE-4-ADMIN.md](docs/PHASE-4-ADMIN.md).
Phase 5 walkthrough (search, seat map, hold engine, tests): [docs/PHASE-5-BOOKING.md](docs/PHASE-5-BOOKING.md).
Phase 6 walkthrough (bookings, tickets, counter cash, SSLCommerz, tests): [docs/PHASE-6-BOOKINGS.md](docs/PHASE-6-BOOKINGS.md).
Phase 7 walkthrough (cancellations, refunds, notifications, driver console, tests): [docs/PHASE-7.md](docs/PHASE-7.md).
Phase 8 walkthrough (reports, CSV export, driver map, Bangla coverage, tests): [docs/PHASE-8.md](docs/PHASE-8.md).
Phase 9 walkthrough (Atlas, Render, Vercel, production checks): [docs/PHASE-9.md](docs/PHASE-9.md).
