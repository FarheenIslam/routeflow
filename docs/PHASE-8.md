# Phase 8 — Reports, CSV export, driver map and Bangla coverage

Phase 8 adds the reporting layer the office uses, a Leaflet map for the driver console, and
finishes the Bangla UI so the default language no longer falls back to English.

Every number is read from stored bookings, cancellations and refunds. Nothing is projected.

---

## 1. Sales reports

`GET /api/admin/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` (admin only)

The range is inclusive and interpreted in **Dhaka time**. It defaults to the last 30 days, and
the endpoint rejects a malformed date or a start after the end.

### What is counted

| Figure | Definition |
|---|---|
| `bookingsCreated` | every booking created in the range (all statuses) |
| `activeTickets` | bookings with status `confirmed` or `completed` |
| `passengers` | sum of `seatCount` on those active tickets |
| `cancelled` | bookings cancelled in the range |
| `collected` | `payableAmount` of bookings whose payment status is `paid`, `refunded` or `partially_refunded` |
| `refunded` | sum of `Cancellation.refundAmount` where `refundStatus` is **processed** |
| `net` | `collected − refunded` |
| `outstanding` | payable amount of active tickets that are still `unpaid` (cash due) |
| `refundsPendingAmount` | pending and approved refunds, shown but **not** subtracted |

Alongside the summary the response contains:

- `daily` — tickets, seats and collected money per Dhaka day
- `routes` — bookings, seats and collected money per route (joined through the trip)
- `counters` — counter performance, using `bookedBy.counterId`; online sales are not
  attributed to a counter
- `paymentMix` — channel + payment method, with count, seats and amount
- `refunds` — count and amount for each of pending / approved / processed / rejected

### CSV export

`GET /api/admin/reports/bookings.csv` uses the same range and writes one row per booking with
ticket code, passenger, trip, route, seats, money, payment state, channel, counter and refund
fields. It is capped at 5,000 rows per request, returns `text/csv; charset=utf-8` with a UTF-8
BOM (so Bangla names open correctly in Excel) and a dated attachment filename.

The UI downloads it through the authenticated API call and a temporary object URL, so the
admin's session cookie is used and no public export link exists.

### Screen

`/admin/reports` (`client/src/pages/admin/ReportsPage.jsx`) shows:

- date-range form and an **Export CSV** button
- eight summary cards: collected, net after refunds, refunds processed, refunds awaiting action,
  active tickets, passengers, cancelled, unpaid at counter
- a daily sales bar list
- route performance, counter performance, payment mix, and refund counts by status

The copy says pending refunds are not subtracted until processed — the page does not imply money
has moved before it has.

---

## 2. Driver trip map

`client/src/components/driver/DriverTripMap.jsx` uses **Leaflet** with OpenStreetMap tiles
(installed as `leaflet@1.9.x`; no API key needed).

- Draws the route origin, every stop that has coordinates, and the destination, plus a polyline
  and `fitBounds`.
- Draws the latest `TripLocationUpdate` as a red marker with report time.
- If no report exists, an overlay says so; if the route has no coordinates, the map falls back
  to a Bangladesh-wide view rather than inventing a position.
- While a trip is `started` or `at_stop`, the driver console reloads the last report every
  30 seconds and offers a manual refresh. This is a re-read of a **manual** report, not a GPS
  feed; the label and popup say that in both languages.
- Map CSS is bundled through `import 'leaflet/dist/leaflet.css'`; no CDN is used.

Route coordinates already existed on `Route.stops` and `Route.origin/destination`; the demo seed
fills them for all four routes.

---

## 3. Bangla coverage

- `bn` and `en` locale files now have **identical key structures** in all three namespaces
  (`admin`, `booking`, `common`); a scripted key diff reports none missing.
- New Phase 8 strings — reports, map, refund cards — were written in both languages.
- The toast close button now uses a translated `aria-label` instead of hardcoded English.
- Stale copy was corrected: dashboard revenue note now points at the reports page, and the
  notification hint no longer says "wired in Phase 6".
- Form **examples** (bus number, route code, email) intentionally stay as neutral sample formats,
  because they are values to type, not labels.

Server validation and error messages remain English — a documented project-wide limitation, not
a missing translation of this phase.

---

## 4. Files

**Server**

- `services/report.service.js` — range parsing, aggregations, CSV builder
- `controllers/admin/report.controller.js`
- `validators/admin.validator.js` — `reportQuerySchema`
- `routes/admin.routes.js` — `/reports/summary`, `/reports/bookings.csv`
- `tests/phase8.test.js` — 5 tests

**Client**

- `pages/admin/ReportsPage.jsx`
- `components/driver/DriverTripMap.jsx`
- `pages/roles/DriverDashboardPage.jsx` — map card + 30-second refresh
- `services/admin.api.js`, `routes/AppRoutes.jsx`, `layouts/AdminLayout.jsx`
- `components/ui/Toaster.jsx` — translated close label
- `locales/{bn,en}/{admin,booking,common}.json`
- `package.json` / `package-lock.json` — `leaflet`

---

## 5. Verification

```
cd server && npx vitest run tests/auth.test.js tests/admin.test.js tests/holds.test.js --maxWorkers=1
# 71 passed
cd server && npx vitest run tests/bookings.test.js tests/phase7.test.js tests/phase8.test.js --maxWorkers=1
# 46 passed  (117 total)
cd client && npx vitest run        # 8 passed
cd client && npx oxlint src        # 0 errors, 11 known warnings
cd client && npm run build         # OK
```

The suite is split into two commands because a single run exceeds the five-minute command limit
in this environment; both halves together are the full suite.

Live check through the Vite proxy:

- `/admin/reports/summary` returned real totals from stored sales (collected ৳6,000, refunded
  ৳4,000, net ৳2,000) with route, daily and refund groups populated.
- `/admin/reports/bookings.csv` returned a CSV attachment with the expected header and 3 rows.
- `/driver/trips/:id` returned route stops with real coordinates (Cumilla 23.4607/91.1809,
  Feni 23.0159/91.3976) and `lastLocation: null`, so the map correctly shows "no report yet".

The map and report screens were **not** opened in a browser during verification; they are
verified by build, lint and the API responses above.

---

## 6. Known limitations

- Reports are read-only snapshots; there is no scheduled email of a report.
- CSV is capped at 5,000 rows and uses English column headers.
- Counter commission is stored on the counter but not yet applied in reporting.
- The map is one trip at a time on the driver's own console; there is no dispatcher map of the
  whole fleet yet.
- No GPS device integration: positions are manual reports only.
- Server messages are English only.
