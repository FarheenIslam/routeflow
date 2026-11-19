# Bus Counter & Seat Booking System — Phase 1 Plan

**Stack:** MongoDB Atlas + Express + React (Vite) + Node.js — **JavaScript only** (ES Modules).
**Design direction requested:** clean, calm, comfortable — generous spacing, few colours, big touch targets,
no decorative animation. Bangla and English both must look comfortable (Bangla needs taller line-height
~1.75 and a proper Bengali font, not a Latin font pretending).

> This document is the contract for the build. Nothing is implemented yet.
> Phase 2 starts only after approval.

---

## 1. Architecture

### 1.1 Shape of the repository

```
bus-booking-system/
├── client/                     # React + Vite + Tailwind
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/         # reusable UI (Button, Modal, DataTable, SeatMap…)
│   │   │   ├── ui/
│   │   │   ├── booking/
│   │   │   └── charts/
│   │   ├── layouts/            # PublicLayout, DashboardLayout, AuthLayout
│   │   ├── pages/              # one folder per area: public, admin, counter, driver
│   │   ├── features/           # domain logic + API calls per feature
│   │   │   ├── auth/ buses/ drivers/ routes/ trips/ counters/
│   │   │   ├── bookings/ seats/ payments/ cancellations/
│   │   │   └── reports/ settings/ tracking/
│   │   ├── hooks/
│   │   ├── context/            # AuthProvider (thin wrapper over Zustand)
│   │   ├── services/           # axios instance, interceptors, endpoint wrappers
│   │   ├── store/              # Zustand stores (auth, ui, bookingDraft)
│   │   ├── utils/              # formatters, currency, date, seat helpers
│   │   ├── routes/             # router config + ProtectedRoute / RoleRoute
│   │   ├── locales/            # en/*.json, bn/*.json
│   │   ├── i18n.js
│   │   └── App.jsx
│   └── .env.example            # VITE_API_BASE_URL only
│
├── server/
│   ├── src/
│   │   ├── config/             # env.js, db.js, logger.js, constants.js
│   │   ├── models/             # 12 Mongoose models + index definitions
│   │   ├── routes/             # express routers per area
│   │   ├── controllers/        # thin HTTP layer (req → service → res)
│   │   ├── services/           # business logic (seatHold, booking, payment…)
│   │   ├── middleware/         # auth, authorize, validate, rateLimit, error
│   │   ├── validators/         # Zod schemas per endpoint
│   │   ├── integrations/       # sslcommerz, resend, sslwireless, ticketPdf
│   │   ├── jobs/               # holdSweeper, pendingBookingExpiry
│   │   ├── utils/              # ApiError, asyncHandler, codes, refund calc
│   │   ├── app.js              # express app (no listen)
│   │   └── seed/               # seed:settings, seed:demo
│   ├── server.js               # connect DB → listen → start jobs
│   └── .env.example
│
├── docs/                       # this plan + API reference + security checklist
├── README.md
└── .gitignore
```

### 1.2 Layering rule (why files exist)

A request travels: **route → middleware (auth, role, zod validate) → controller → service → model**.
A controller never talks to Mongoose directly; a service never touches `req`/`res`. Reason: booking and
payment logic must be callable from three places (passenger API, counter API, payment callback) without
copy-paste. UI never decides prices or availability; the server always recomputes.

### 1.3 Client state split

- **Server data** (trips, bookings, lists) → fetched per page with `axios` wrappers + small hooks. No global cache library needed.
- **Auth** → `authStore` (Zustand). On app boot call `GET /api/auth/me`; the JWT lives in an httpOnly cookie, so JS never sees it.
- **Booking draft** (chosen trip + seats + hold expiry) → `bookingDraftStore`, mirrored to `sessionStorage` so a refresh mid-booking does not lose the seat list.

---

## 2. Database design (MongoDB Atlas + Mongoose)

12 collections. All have `timestamps: true`, `versionKey: false`, and `_id` references (never bare strings).
Money is stored in **BDT as integer paisa-free Number rounded to 2 decimals**, never floats for arithmetic
we do not re-round.

### 2.1 Users
| field | notes |
|---|---|
| name, email (unique, lowercase), phone (unique, BD format) | |
| passwordHash | bcrypt, cost 12 |
| role | enum `ADMIN, COUNTER, DRIVER, PASSENGER` (validated at schema + DB level) |
| status | enum `active, suspended, pending` |
| counterId | ref `Counter` — required when role is COUNTER |
| driverId | ref `Driver` — set for DRIVER |
| emailVerified, phoneVerified | Boolean |
| lastLoginAt, passwordChangedAt | |
| passwordResetTokenHash, passwordResetExpiresAt | reset token stored **hashed**, 30 min TTL |
| createdBy | ref `User` (who created the staff account) |

Indexes: `email` unique · `phone` unique · `{role, status}` · `{counterId}` · text index on `name, email, phone`.

### 2.2 Buses
`busNumber` (unique, e.g. `DHAKA-METRO-BA-11-2233`) · `operatorName` · `busType` enum `AC, NON_AC, AC_SLEEPER, DOUBLE_DECKER, HIACE` · `totalSeats`
· `seatLayout { decks, rows, columns, aisleAfterColumn, seatPrefix, disabledSeats[] }`
· `amenities[]` · `status` enum `active, maintenance, inactive` · `createdBy`.
Seat labels are generated deterministically from the layout (`A1…A20, B1…B20`) so the same trip always renders
identical seats. Indexes: `busNumber` unique · `{status, busType}`.

### 2.3 Drivers
`userId` (ref User, required — every driver can log in) · `name` · `phone` (unique) · `licenseNumber` (unique) · `licenseExpiry` · `assignedBusId` (ref Bus) · `status` enum `active, on_leave, inactive` · `address` · `photoUrl`.
Indexes: `phone`, `licenseNumber` unique · `{assignedBusId}`.

### 2.4 Routes
`code` (unique) · `name` · `origin {name, city, lat, lng}` · `destination {…}` · `stops[]` each `{name, lat, lng, order, offsetMinutesFromOrigin, distanceFromOriginKm}`
· `totalDistanceKm` · `estimatedDurationMinutes` · `status`.
Indexes: `code` unique · `{'origin.city':1,'destination.city':1}` · `{status}` · text index on `name, origin.name, destination.name`.

### 2.5 Trips
`tripCode` (unique, `TRP-20261110-001`) · `routeId` · `busId` · `driverId` · `departureDate` (Date, midnight Asia/Dhaka) · `departureTime` (`"HH:mm"`)
· `departureAt` (Date, **the field everything queries**) · `arrivalEstimateAt` · `fare` · `boardingPoints[]` · `droppingPoints[]`
· `status` enum `scheduled, started, at_stop, completed, cancelled, delayed` · `seatSummary {total, booked, held}`
· `cancelReason` · `createdBy`.
Indexes: `departureAt` · `{routeId, departureAt}` · `{status, departureAt}` · **unique `{busId, departureAt}`** and **unique `{driverId, departureAt}`** (one bus/driver cannot be on two trips at once).

### 2.6 Counters
`code` (unique) · `name` · `branchName` · `address {street, city, division, lat, lng}` · `phone` · `email`
· `managerUserId` · `staffUserIds[]` · `commissionPercent` · `status`.
Indexes: `code` unique · `{branchName}` · `{staffUserIds}`.

### 2.7 Bookings
`bookingCode` (unique, human-typed: `BB-7K2M9Q`) · `tripId` · `passengerUserId` (nullable — walk-in counter sales have none)
· `passenger {name, phone, email, gender, age, nid?}` · `seats[]` · `seatCount` · `farePerSeat` · `totalAmount` · `discount` · `payableAmount`
· `paymentMethod` enum `cash, sslcommerz` · `paymentStatus` enum `unpaid, pending, paid, failed, refunded, partially_refunded`
· `status` enum `pending, confirmed, completed, cancelled, expired` · `channel` enum `online, counter`
· `bookedBy {userId, role, counterId}` · `holdIds[]` · `verificationCode` · `cancellationId` · `cancelledAt`.
Indexes: `bookingCode` unique · `{tripId, status}` · `{passengerUserId, createdAt}` · `{'passenger.phone', createdAt}` · `{createdAt}` · `{'bookedBy.counterId', createdAt}` · `{paymentStatus, createdAt}`.

### 2.8 Payments
`bookingId` · `provider` enum `sslcommerz, cash` · `method` (`card, bkash, nagad, rocket, bank, cash`) · `amount` · `currency` (`BDT`)
· `status` enum `initiated, pending, success, failed, cancelled, refunded` · `providerTranId` (**unique** — our idempotency key)
· `valId` · `bankTranId` · `cardType` · `gatewayPageUrl` · `rawValidation` (sanitised) · `initiatedAt`, `verifiedAt`, `failureReason`.
Indexes: `providerTranId` unique · `{bookingId}` · `{status, createdAt}`.

### 2.9 Cancellations
`bookingId` (**unique** — a booking is cancelled once) · `cancelledByUserId` · `cancelledByRole` · `reason`
· `policyApplied {hoursBeforeDeparture, refundPercent, ruleLabel}` · `refundAmount` · `refundStatus` enum `pending, approved, processed, rejected`
· `refundMethod` · `refundTranId` · `processedBy` · `processedAt`.
Indexes: `bookingId` unique · `{refundStatus, createdAt}`.

### 2.10 SeatHolds — the seat lock ledger (critical design)
One document **per seat per trip, permanently**:

`tripId` · `seatNumber` · `status` enum `held, booked, blocked` · `holderSessionId` · `holderUserId?` · `bookingId?` · `expiresAt?`

- **Unique compound index `{tripId:1, seatNumber:1}`** — the database itself guarantees no second document can exist for that seat. This is what makes double booking impossible, not application code.
- **TTL index on `expiresAt` with `partialFilterExpression: {status:'held'}`** — only *held* documents are ever auto-deleted, and only after expiry. Booked documents have `expiresAt` **unset**, so TTL can never delete a sold seat.
- Availability is computed as: *no document* **or** *`status:'held'` and `expiresAt <= now`*. Reads never assume TTL has already run.
- Bounded collection: at most `seats × trips` documents, no unbounded history.

### 2.11 TripLocationUpdates
`tripId` · `driverId` · `tripStatusAtReport` · `currentStopIndex` · `currentStopName` · `nextStopName` · `betweenStops` (Boolean)
· `location {lat, lng}` · `note` · `isManual: true` · `reportedAt`.
Indexes: `{tripId, reportedAt:-1}` · TTL on `reportedAt` (90 days) so history stays small.

### 2.12 Notifications
`userId?` · `bookingId?` · `channel` enum `email, sms, in_app` · `template` · `to` · `subject` · `body` · `status` enum `queued, sent, failed, skipped`
· `provider` · `providerMessageId` · `error` · `meta`.
Indexes: `{status, createdAt}` · `{userId, createdAt}` · `{bookingId}`.
Every send is recorded here first — so "we sent an SMS" is auditable, and mock mode writes `skipped` rows instead of lying.

### 2.13 SystemSettings (single document, `key: "global"`)
`cancellationPolicy {freeCancelHours:24, halfRefundHours:2, halfRefundPercent:50, noRefundPercent:0}`
· `booking {holdMinutes:2, maxSeatsPerBooking:6, advanceBookingDays:60, passengerSelfCancel:false}`
· `notifications {emailEnabled, smsEnabled, mockMode:true}` · `payments {onlineEnabled, sandbox:true}`
· `localization {defaultLanguage:"bn", ticketLanguages:["bn","en"]}` · `ticket {headerText, footerText, termsBn, termsEn}` · `updatedBy`.

### 2.14 Relationship map

```
User 1─1 Driver ──assignedBus──▶ Bus
User 1─* Booking ──tripId──▶ Trip ◀──routeId── Route
Counter 1─* User(COUNTER)         Trip ◀──busId── Bus
                                  Trip ◀──driverId── Driver
Booking 1─1 Payment               Trip 1─* SeatHold   (unique per seat)
Booking 1─1 Cancellation          Trip 1─* TripLocationUpdate
Booking 1─* Notification
```

---

## 3. Core workflows

### 3.1 Online booking with a 2-minute hold
1. Passenger opens a trip → `GET /api/trips/:id/seats` returns seats with `status` computed server-side + `serverTime`.
2. Selects 1–6 seats → `POST /api/holds` → server creates/reclaims hold docs, returns `expiresAt` and `holdIds`.
3. UI shows countdown based on **server** `expiresAt` (client clock is only used to tick).
4. Passenger fills details → `POST /api/bookings` creates a `pending` booking bound to the holds (holds extended once, still ≤2 min total from the UI perspective).
5. `POST /api/payments/initiate` → SSLCommerz `GatewayPageURL` → passenger pays.
6. Callback/IPN → server **validates with SSLCommerz** → transaction confirms booking, marks holds `booked`, clears `expiresAt`.
7. If anything fails or the timer runs out → holds released / expire; booking marked `expired`; seats return to green.
8. Sweeper job (every 30 s) marks stale pending bookings `expired` and deletes expired holds — belt and braces on top of TTL.

### 3.2 Hold acquisition (atomic, race-safe)
Per seat, two atomic attempts:
1. `updateOne({tripId, seatNumber, status:'held', expiresAt:{$lte:now}}, {$set:{holderSessionId, expiresAt: now+2min}})`
2. if `matchedCount === 0` → `insertOne(...)`; a duplicate-key error (`E11000`) means *booked or actively held* → seat unavailable.

Multi-seat requests run inside `session.withTransaction`, with rollback on any failure, retried on
`TransientTransactionError`. Atlas free/hosted clusters are replica sets, so transactions are supported.

### 3.3 Final confirmation (the part that must never double book)
Inside one transaction:
1. Re-read holds for the requested seats; require `holderSessionId` match, `status:'held'`, `expiresAt > now`.
2. Re-read the trip fare and recompute the amount — the client's price is ignored.
3. Insert/confirm `Booking`.
4. `updateMany({_id: {$in: holdIds}, holderSessionId, status:'held', expiresAt:{$gt: now}}, {$set:{status:'booked', bookingId}, $unset:{expiresAt: 1}})` →
   **require `modifiedCount === seats.length`, otherwise throw and abort the transaction.**
5. Update `Payment` with a conditional guard (`status: {$in:['initiated','pending']}`) so a duplicated IPN cannot confirm twice.
6. Increment `trip.seatSummary`.

Why this is safe: the conditional `updateMany` makes the *database* decide the winner. If another session
reclaimed the seat one millisecond earlier, `modifiedCount` is lower and the whole transaction rolls back — no
lost update, even under snapshot isolation.

### 3.4 Payment verification (SSLCommerz)
- Initiate: server → `sandbox.sslcommerz.com/gwprocess/v4/api.php` (sandbox) or live host, `tran_id = payment._id`.
- On redirect **and** on IPN: server calls `validator/api/validationserverAPI.php?val_id=…`, then checks
  `status ∈ {VALID, VALIDATED}`, `tran_id` matches our payment, `amount` and `currency` match the booking.
  Only then is the booking marked paid. A frontend redirect alone never marks anything paid.
- Duplicate IPN → second call is a no-op thanks to the conditional payment update.
- Amount mismatch / unknown `tran_id` → payment `failed`, notification logged, no booking confirmation.
- **Honest limitation:** the public HTTPS callback cannot reach `localhost`. IPN testing requires a tunnel
  (Cloudflare Tunnel) or the deployed Render URL. I will not claim live payments work until tested with real sandbox credentials.

### 3.5 Cancellation & refund
`hoursBeforeDeparture` → policy from `SystemSettings` (24h full, 2–24h 50%, <2h none) → refund amount stored on
`Cancellation` → booking `cancelled`, `paymentStatus` updated → seats released in one transaction
(`SeatHold.deleteMany` for those seats, guarded by `bookingId`) → refund marked `pending` for admin
approval. **No automatic gateway refund is implemented**, because SSLCommerz refunds require merchant API
access; the system records the intent and tracks status. That is stated in the UI too.

---

## 4. Frontend pages

**Public** (`PublicLayout` — header, language switcher, login/account menu, footer)
`/` Home · `/search` results · `/trips/:id` seat map · `/booking/passenger` · `/booking/payment` · `/booking/:code/success`
· `/my-bookings` · `/my-bookings/:code` (ticket + cancel) · `/track/:tripId` (Leaflet) · `/login` · `/register`
· `/forgot-password` · `/reset-password/:token` · `/about` · `/contact` · `/403` · `/404`

**Admin** (`DashboardLayout`, sidebar + topbar)
`/admin` dashboard · `/admin/buses` · `/admin/drivers` · `/admin/routes` · `/admin/trips` · `/admin/counters`
· `/admin/users` · `/admin/bookings` · `/admin/cancellations` · `/admin/payments` · `/admin/reports` · `/admin/settings`

**Counter** `/counter` today · `/counter/book` (search → seat map → passenger → cash) · `/counter/bookings` (search by code/phone)
· `/counter/sales` · `/counter/profile`

**Driver** (mobile-first, big buttons) `/driver` today's trip · `/driver/trip/:id` (start / at stop / completed + manual location)
· `/driver/history` · `/driver/profile`

Shared components: `Button, Input, Select, Textarea, DatePicker, Modal, ConfirmDialog, DataTable, Pagination, Badge,
Card, StatCard, EmptyState, Spinner, Skeleton, ToastProvider, SeatMap, SeatLegend, CountdownTimer, TicketView,
LanguageSwitcher, ProtectedRoute, RoleRoute, ErrorBoundary`.

Design tokens: neutral slate canvas, one accent (deep teal), one danger (red), semantic seat colours exactly as
specified (green/yellow/red/grey), 8-pt spacing scale, 44 px minimum tap target, visible focus rings, WCAG AA
contrast, `prefers-reduced-motion` respected.

---

## 5. Backend API surface

```
GET    /api/health

POST   /api/auth/register            POST /api/auth/login          POST /api/auth/logout
GET    /api/auth/me                  PATCH /api/auth/change-password
POST   /api/auth/forgot-password     POST /api/auth/reset-password/:token

GET    /api/public/settings          GET  /api/public/popular-routes
GET    /api/trips/search?origin&destination&date&busType&page
GET    /api/trips/:id                GET  /api/trips/:id/seats
GET    /api/trips/:id/tracking
POST   /api/holds                    DELETE /api/holds/:id
POST   /api/bookings                 GET  /api/bookings/:bookingCode
POST   /api/bookings/:bookingCode/cancel
POST   /api/payments/initiate
POST   /api/payments/callback/success | /fail | /cancel
POST   /api/payments/ipn             GET  /api/payments/status/:tranId
GET    /api/tickets/:bookingCode/pdf | /api/tickets/:bookingCode/print

# admin (ADMIN only)
GET    /api/admin/dashboard?range=          GET /api/admin/dashboard/charts
CRUD   /api/admin/buses      PATCH /api/admin/buses/:id/status
CRUD   /api/admin/drivers    CRUD  /api/admin/routes
CRUD   /api/admin/trips      PATCH /api/admin/trips/:id/status | /cancel
CRUD   /api/admin/counters   CRUD  /api/admin/users (list, status, role)
GET    /api/admin/bookings   GET   /api/admin/payments   GET /api/admin/cancellations
POST   /api/admin/cancellations            PATCH /api/admin/cancellations/:id/refund
GET    /api/admin/reports/sales | /counters | /occupancy | /cancellations | /payments
GET    /api/admin/exports/:report?format=pdf|xlsx
GET    /api/admin/settings   PUT   /api/admin/settings

# counter (COUNTER + ADMIN)
GET    /api/counter/trips/search    POST /api/counter/bookings
GET    /api/counter/bookings/search POST /api/counter/bookings/:id/cancel
GET    /api/counter/sales?date=

# driver (DRIVER + ADMIN)
GET    /api/driver/trips            GET  /api/driver/trips/:id
POST   /api/driver/trips/:id/status POST /api/driver/trips/:id/location
GET    /api/driver/history
```

Every mutating endpoint: Zod validation → sanitisation → role check → service → typed JSON response
`{ success, data, message }`; errors use `{ success:false, message, errors[] }` with proper HTTP codes.

---

## 6. MongoDB Atlas connection

1. Create a free cluster (Atlas UI) in the closest region (Singapore/Mumbai for Bangladesh).
2. Create a **database user** with a long random password, role `readWrite` on this database only.
3. Network Access: for Render's free tier the outbound IPs are not static, so `0.0.0.0/0` is required — accepted only because the password is strong and the URI stays server-side.
4. Copy the `mongodb+srv://…` string into `server/.env` as `MONGODB_URI`. **Never in client code, never in chat, never in Git.**
5. Server connects once in `config/db.js` with `mongoose.connect(uri, {serverSelectionTimeoutMS: 10000})`, logs a single safe line, and registers a clean shutdown handler.
6. `npm run seed` creates `SystemSettings`, an admin user from env, and demo data — idempotent.

Free-tier limits that matter: one free cluster per project, shared CPU, ~100 ops/sec, 32 MB in-memory sort
limit, **no continuous backups**. Fine for this app; not for a live counter business at scale.

---

## 7. Risks & how each is handled

| Risk | Handling |
|---|---|
| **Double booking** | Unique `{tripId, seatNumber}` index + conditional writes inside a transaction + `modifiedCount` check. Never trust the client. |
| **TTL deletion lag** | Expiry is evaluated in every query (`expiresAt > now`), TTL is cleanup only. |
| **Transaction retries** | `withTransaction` wrapper retried on `TransientTransactionError`/`WriteConflict`, max 3 attempts, then a friendly 409. |
| **Clock skew** | Server `Date.now()` is the only authority; seat API returns `serverTime`; countdown is offset-corrected. |
| **Duplicate payment callbacks** | `providerTranId` unique + conditional status transition; IPN and redirect share one idempotent service. |
| **Cross-site cookies** (Vercel frontend ↔ Render backend) | `httpOnly; secure; sameSite=None` in production, `Lax` locally, explicit `credentials:true` CORS allowlist, Origin/Referer check on mutations (CSRF defence), refresh-friendly 7-day token. |
| **Render cold start** | Documented: first request after 15 idle minutes takes ~50–60 s. Uptime pings are a user decision, not built in. |
| **Bangla in PDF** | PDFKit does not shape Bengali conjuncts correctly. Plan: **browser-print HTML tickets** (thermal + A4) give correct Bangla shaping; server-side PDFKit is used for the English A4 download with an embedded QR. Stated honestly rather than shipping broken Bengali glyphs. |
| **SMS delivery** | SSL Wireless needs a business account + approved sender mask. Default is `mockMode` with logged rows, so nothing pretends to deliver. |
| **Free-tier email cap** | Resend free = 3,000/month, 100/day. Notifications queue degrades gracefully and logs failures. |
| **Photo/file uploads** | No file upload in v1 (no ephemeral disk on Render). Bus photos are URL fields. |

---

## 8. Optional integrations & cost (checked Nov 2026)

| Service | Free sandbox/dev | Paid reality |
|---|---|---|
| MongoDB Atlas | Free cluster, forever | Paid dedicated tiers cost real money (tens of $/mo); ask Atlas for current pricing |
| Render | Free web service: 512 MB, 0.1 CPU, sleeps after 15 idle min (~1 min wake), 750 h/month | Starter $7/mo removes sleeping |
| Vercel | Hobby free — **non-commercial use** | Pro $20/mo for commercial use |
| Resend | 3,000 emails/mo, 100/day, 3 domains | Pro $20/mo = 50k emails |
| SSLCommerz | Sandbox free with test store credentials | Live needs a merchant account (trade licence, TIN, bank settlement); MDR/fees are negotiated per merchant — confirm with SSLCommerz |
| SSL Wireless SMS | Mock mode in code | Per-SMS charge + sender-mask approval; quote required |
| OSM tiles | Free tiles, but with a usage policy | For real traffic use a free-tier tile provider (MapTiler/Carto) with an API key |

**Decision for v1:** everything runs in development/mock mode by default. Nothing claims to be live until the
matching credentials exist and a real test has passed.

---

## 9. Roadmap

| Phase | Deliverable | Gate |
|---|---|---|
| 2 | Vite+Tailwind client shell, Express server, Atlas connection, health endpoint, env files, seed script | `GET /api/health` and the client both run; DB connects |
| 3 | Auth (register/login/logout/me/forgot/reset), bcrypt, JWT cookie, RBAC middleware, 4 role accounts | Auth + role tests pass |
| 4 | Admin: buses, drivers, routes, trips, counters, users, settings + dashboard shell & charts | CRUD + RBAC tests pass |
| 5 | Public site: home, search, trip detail, seat map, hold API, countdown, concurrency-safe holds | Hold/expiry/concurrency tests pass |
| 6 | Booking creation, counter booking, cash payment, SSLCommerz sandbox, ticket print/PDF, QR | Booking + payment-verification tests pass |
| 7 | Cancellation & refund records, Resend + SSL Wireless adapters (mock default), driver portal, Leaflet tracking | Cancellation + notification tests pass |
| 8 | Reports (date filters, Recharts, PDF/Excel export), full bn/en translations, security hardening, test sweep | Lint + full test run green |
| 9 | Deploy to Render + Vercel + Atlas, set env vars, verify end to end, security checklist | Deployed URLs verified |

Each phase ends with: what was built, how it works, file list, commands, test instructions, and what remains.
