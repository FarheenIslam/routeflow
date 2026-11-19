# Phase 7 — Cancellations, refunds, notifications and the driver console

Phase 7 turns the ticket into something that can be **cancelled safely**, gives the office a
**refund trail** it can actually reconcile, logs **notifications without pretending to send
them**, and adds a **driver console** whose trip status and location are entered by a person.

Nothing in this phase invents money movement, delivery receipts or GPS coordinates.

---

## 1. Cancellation and refund tracking

### The rule engine (one place)

`server/src/services/cancellation.service.js` → `calculateRefund()` is the only place the
refund policy is interpreted. It uses the admin settings (`SystemSetting.booking`):

| Setting | Meaning |
|---|---|
| `freeCancelHours` | full refund at or before this many hours before departure |
| `halfRefundHours` | partial refund at or before this many hours before departure |
| `halfRefundPercent` | the partial percentage (default 50) |
| `noRefundPercent` | refund after that window (default 0) |

The calculation returns `hoursBeforeDeparture`, `refundPercent`, `ruleLabel`
(`full_refund` / `partial_refund` / `no_refund`) and `refundAmount` rounded to taka.

At cancellation time the amount and percentage are **frozen onto the `Cancellation` row**, so a
later settings change never rewrites history.

### What cancelling does

`POST /api/bookings/:code/cancel` (passenger: own ticket; staff: any ticket):

1. Refuses if the trip already departed, or if the ticket is already cancelled.
2. Refuses a passenger when `booking.passengerSelfCancel` is off — the UI shows
   "contact a counter" instead of a button. Staff can always cancel.
3. Creates **one** `Cancellation` (unique index on `bookingId`), so two simultaneous requests
   still produce one row and one refund.
4. Deletes the seat holds and marks the booking `cancelled`, releasing the seats for resale.
5. Cancels any still-open payment record (a pending gateway payment can no longer complete).
6. Queues `booking_cancelled` notifications for email and SMS.
7. Writes a refund row:
   - paid booking → `refundStatus: pending`, amount from the policy;
   - unpaid booking → amount `0`, `refundStatus: processed` (there is nothing to review).

`GET /api/bookings/:code/cancellation-preview` answers the same question without writing
anything, so the ticket page can show "you would get ৳2,000 (100%)" before the passenger
confirms.

### The refund workflow (admin)

`GET /api/admin/cancellations` — filter by refund status, paginated, with per-status counts.
`PATCH /api/admin/cancellations/:id/refund` — `action` is one of:

| Action | Effect |
|---|---|
| `approve` | `pending → approved` |
| `reject` | `pending/approved → rejected`; the booking keeps `paid` |
| `process` | `approved → processed`; records method, reference, notes and who processed it |

Processing updates the booking to `refunded` (or `partially_refunded` when the refund is smaller
than the amount paid). Rejecting never changes the payment status.

**No gateway refund is called.** The money is handed back outside the system (cash at the
counter, bank, bKash). "Processed" means a staff member confirmed that it happened; the admin
page states this explicitly.

---

## 2. Email and SMS — honest mock mode

`server/src/services/notification.service.js` writes a `Notification` row **before** attempting
delivery, then records the truthful outcome:

| Situation | `status` | `provider` | `error` |
|---|---|---|---|
| Email adapter has no `RESEND_API_KEY` | `skipped` | `mock` | `Mock mode: nothing was sent` |
| SMS credentials missing, or SMS disabled | `skipped` | `mock` | `… disabled in settings` / mock reason |
| Real provider accepted the message | `sent` | `resend` / `sslwireless` | — |
| Provider returned an error | `failed` | provider | provider message |

A row is **never** written as `sent` without a provider response. Mock mode does not call the
network.

Templates: `booking_confirmed`, `booking_cancelled`, `refund_processed`. Hooks live in
`booking.service.js` (counter sale and cash collection) and `payment.service.js` (verified
gateway payment).

SMS uses the SSL Wireless v3 HTTP API (`SSL_WIRELESS_API_TOKEN`, `SSL_WIRELESS_SID`,
`SSL_WIRELESS_API_URL`). The request shape follows their public documentation but **has not been
verified against a real account** — no credentials were available. Email uses the existing
Resend adapter.

The notification log is currently readable in MongoDB (`notifications` collection); no admin
screen was added in this phase.

---

## 3. Driver console

Routes are under `/api/driver` and every one is scoped to the signed-in driver's own
`Driver.userId`. A driver cannot ask for another driver's trip by changing an id.

| Endpoint | Purpose |
|---|---|
| `GET /api/driver/trips?date=YYYY-MM-DD` | own trips for a Dhaka day, with passenger counts |
| `GET /api/driver/trips/:id` | trip detail + passenger manifest + last location |
| `POST /api/driver/trips/:id/status` | `started`, `at_stop`, `completed` |
| `POST /api/driver/trips/:id/location` | manual lat/lng, stop index, at-stop flag, note |
| `GET /api/driver/history` | recent completed/cancelled trips |
| `GET /api/driver/trips/:id/locations` | location history for that trip |

Allowed transitions (anything else is `409`):

```
scheduled / delayed → started
started             → at_stop | completed
at_stop             → started | completed
```

`startedAt` and `completedAt` are written once on the trip. Location rows go to
`TripLocationUpdate` (TTL 90 days) and the newest one is shown on the trip detail. The stop name
is derived from the route's stops array; the console never guesses coordinates.

The UI is `/driver` (`client/src/pages/roles/DriverDashboardPage.jsx`): today's trips, a status
button strip, a manual location form, the passenger manifest and recent history. It is
deliberately mobile-first and says "manual entry only — no GPS device is connected".

Demo login after seeding: `driver@busbook.local` / `Driver@12345` (linked to Abdul Karim).

---

## 4. Admin and passenger UI

| Screen | What it does |
|---|---|
| `/booking/:code` | refund preview, reason + confirmation, refund status once cancelled; the printable ticket shows the refund line |
| `/admin/cancellations` | status counts, filter, approve / reject / mark processed with method + reference |
| `/driver` | the driver console above |

Both languages are covered (`bn` default, `en` one click away). Server messages remain English
(a known limitation carried from earlier phases).

---

## 5. Files added or changed

**Server**

- `models/Cancellation.js`, `models/Notification.js`, `models/TripLocationUpdate.js`
- `services/cancellation.service.js`, `services/notification.service.js`, `services/driver.service.js`
- `integrations/sms.js`; `integrations/email.js` (reused by the notification service)
- `controllers/booking.controller.js`, `controllers/driver.controller.js`,
  `controllers/admin/cancellation.controller.js`
- `routes/bookings.routes.js`, `routes/driver.routes.js`, `routes/admin.routes.js`, `routes/index.js`
- `validators/booking.validator.js`, `validators/driver.validator.js`, `validators/admin.validator.js`
- `config/constants.js` (refund/notification enums), `config/env.js` (SMS config + boot summary)
- `models/Trip.js` (`startedAt`, `completedAt`), `models/Booking.js` (existing statuses reused)
- `services/booking.service.js`, `services/payment.service.js` (notification hooks, view fields)
- `seed/demo.js` (driver portal login), `seed/index.js`, `tests/setup.js`
- `tests/phase7.test.js` — 16 tests

**Client**

- `pages/roles/DriverDashboardPage.jsx`
- `pages/admin/CancellationsPage.jsx`
- `pages/public/TicketPage.jsx` (cancellation card), `components/booking/TicketCard.jsx`
- `services/driver.api.js`, `services/booking.api.js`, `services/admin.api.js`, `services/counter.api.js`
- `routes/AppRoutes.jsx`, `layouts/AdminLayout.jsx`
- `locales/{bn,en}/booking.json`, `locales/{bn,en}/admin.json`

---

## 6. Tests and checks

```
cd server && npx vitest run --maxWorkers=1     # 112 tests passing (16 in phase7.test.js)
cd client && npx vitest run                    # 8 tests passing
cd client && npx oxlint src                    # 0 errors (11 known warnings)
cd client && npm run build                     # production build OK
```

The Phase 7 tests cover the policy maths, paid and unpaid cancellation, the self-cancel setting,
double-cancel races, departure refusal, role separation, both refund transitions, the mock
notification log, own-trips scoping, the status state machine, manual location and outsider
rejection.

---

## 7. Known limitations

- **No automatic refund.** SSLCommerz refund APIs are not implemented; processing is a manual
  record. This is intentional and shown in the admin UI.
- **No real email/SMS delivery verified.** Resend and SSL Wireless need credentials; until then
  every row is `skipped` in mock mode.
- **No GPS.** Driver location is typed in by a person. The planned Leaflet map is not part of
  this phase.
- **Seeded driver has one login.** Additional driver logins must be created through the admin
  panel; the current admin driver form does not create a portal login (Phase 4 behaviour).
- **No admin screen for the notification log** yet.
- Server error messages are English only.
