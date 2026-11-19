# Phase 4 — Admin dashboard and management modules

**Goal:** the administrator can run the business: manage buses, drivers, routes, trips, counters and staff
accounts, edit system settings, and see a dashboard built from real database counts — with CRUD APIs,
validation, guards and automated tests.

Everything here is real: every number on the dashboard is a MongoDB count, every form writes to the database,
and any figure that is not implemented yet (revenue, bookings) is shown as "comes in Phase 6" instead of a fake
number.

---

## 1. How a request travels (the short version)

```
Admin page (React)
   └─ adminApi.buses.create(payload)        client/src/services/admin.api.js
        └─ POST /api/admin/buses  (cookie)  axios instance (withCredentials)
             ├─ authenticate                 who is this? (JWT in httpOnly cookie)
             ├─ authorize('ADMIN')          may they?  (role check)
             ├─ validate({body: schema})    Zod: is the payload valid?
             └─ controller → Mongoose       business rules + database write
        └─ { success, message, data }        one response shape for every admin endpoint
```

If validation fails, the API answers **400** with `errors: [{ field, message }]`; the page puts each message
under the matching input. If a business rule fails (e.g. the bus already has a trip at that time), the API answers
**409** with a readable message.

---

## 2. Backend files

| File | Why it exists |
|---|---|
| `server/src/routes/admin.routes.js` | One router for `/api/admin`, protected as a whole with `authenticate` + `authorize('ADMIN')`. Every `:id` is validated as an ObjectId first. |
| `server/src/controllers/admin/bus.controller.js` | Bus CRUD + status change. Edits load the document and `save()` it, so the pre-validate hook can recompute `totalSeats` from the seat layout. |
| `server/src/controllers/admin/driver.controller.js` | Driver CRUD; optionally creates the driver's login (`createLogin`) and keeps `Driver.userId` in sync. |
| `server/src/controllers/admin/route.controller.js` | Route CRUD; stops and duration; refuses duplicate origin→destination pairs. |
| `server/src/controllers/admin/trip.controller.js` | Trip list/create/update/status/cancel, delegating to the trip service. |
| `server/src/controllers/admin/counter.controller.js` | Counter CRUD; deleting a counter detaches its staff instead of orphaning them. |
| `server/src/controllers/admin/user.controller.js` | Staff accounts: list, create, change role, suspend/activate — with self-protection rules. |
| `server/src/controllers/admin/settings.controller.js` | Reads/writes the single `SystemSetting` document, merging sections instead of replacing them. |
| `server/src/controllers/admin/dashboard.controller.js` | Aggregations for the KPI cards, trips-by-status, next-7-days chart and next departures. |
| `server/src/controllers/admin/lookup.controller.js` | Small “active resources only” lists for form selects (buses, drivers, routes, counters). |
| `server/src/services/trip.service.js` | The scheduling logic: Dhaka-time departure, `TRP-YYMMDD-XXXX` codes, conflict checks, cancel-and-free-slot. |
| `server/src/validators/admin.validator.js` | The authoritative Zod rules for every admin payload. |
| `server/src/models/{Bus,Driver,Route,Trip,Counter}.js` | Collections from Phase 1, wired up here (derived seat count, normalised stops, partial unique indexes). |
| `server/src/seed/demo.js` | Optional demo fleet, so a fresh install has something to click. |
| `server/src/seed/index.js` | Runs `ensureIndexes()`, the settings/admin seed, then the demo seed. |
| `server/src/config/env.js` | New `SEED_DEMO_DATA` flag (default `true`). |
| `server/tests/{admin,helpers}.js` | 25 admin tests on top of the 26 auth tests. |

### Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/api/admin/dashboard` | KPI counts, trip status split, 7-day chart, next departures |
| GET | `/api/admin/lookups` | Active buses, drivers, routes, counters for selects |
| GET/PUT | `/api/admin/settings` | Read / partially update system settings |
| GET/POST | `/api/admin/buses` | List (search, status filter, paging) / create |
| GET/PATCH/DELETE | `/api/admin/buses/:id` | Read / update / delete |
| PATCH | `/api/admin/buses/:id/status` | Active ↔ maintenance ↔ inactive |
| GET/POST | `/api/admin/drivers` | List / create (optionally with a login) |
| GET/PATCH/DELETE | `/api/admin/drivers/:id` | Read / update / delete |
| GET/POST | `/api/admin/routes` | List / create |
| GET/PATCH/DELETE | `/api/admin/routes/:id` | Read / update / delete |
| GET/POST | `/api/admin/trips` | List (date + status filters) / schedule |
| GET/PATCH | `/api/admin/trips/:id` | Read / reschedule |
| PATCH | `/api/admin/trips/:id/status` | Scheduled → delayed → started → completed |
| POST | `/api/admin/trips/:id/cancel` | Cancel with a reason, freeing the bus/driver slot |
| GET/POST | `/api/admin/counters` | List / create |
| GET/PATCH/DELETE | `/api/admin/counters/:id` | Read / update / delete |
| GET | `/api/admin/users` | List staff/passengers (role + status filters) |
| POST | `/api/admin/users` | Create an ADMIN or COUNTER account |
| PATCH | `/api/admin/users/:id/role` | Move between ADMIN / COUNTER / PASSENGER |
| PATCH | `/api/admin/users/:id/status` | Suspend / activate |

Every list answers `data: { items, pagination: { page, limit, total, totalPages } }`.

---

## 3. Business rules that are actually enforced

These are not UI hints — the API refuses the request and the tests prove it.

1. **No double-booked bus or driver.** Two live trips may not share the same bus, or the same driver, at the same
   departure instant. Enforced twice: a service check with a friendly message, and *partial* unique indexes
   (`uniq_bus_live_departure`, `uniq_driver_live_departure`) that ignore cancelled trips — so cancelling a trip
   really frees the slot for a replacement.
2. **Departure time is Dhaka time.** The form sends a date and a time; the server builds the instant in
   `Asia/Dhaka`, so a trip at 21:00 is 21:00 in Bangladesh regardless of the server's timezone.
3. **Nothing in use can be deleted.** A bus, driver or route that trips still reference answers **409** and says to
   set it inactive instead. Counters detach their staff before being removed.
4. **Seat total is derived, never typed.** `totalSeats = rows × columns − disabled seats`. Changing the layout
   recomputes it on save, and the API's own edit endpoint loads the document for that reason (a plain
   `findByIdAndUpdate` would skip the hook and leave a stale count).
5. **Staff and counters stay consistent.** Creating a counter staff account with a counter, or changing a counter's
   staff, updates both sides. Moving an account to COUNTER without a counter is rejected.
6. **Admin safety.** The signed-in admin cannot change their own role, cannot suspend themselves, and the last
   active admin cannot be demoted or suspended. The Users page disables those two buttons on your own row; the API
   enforces it anyway.
7. **Driver logins come from the Drivers page.** `/api/admin/users` accepts only ADMIN and COUNTER, so a driver's
   login is created together with their driver record and linked through `Driver.userId`.
8. **Cancellation policy must make sense.** Full-refund hours must be greater than partial-refund hours; the form
   and the API both reject the wrong order.
9. **The dashboard does not invent money.** `revenueAvailable: false` and an explicit note: bookings, revenue and
   cancellation figures arrive with Phase 6.

---

## 4. Demo data (`SEED_DEMO_DATA`)

`npm run seed` always creates settings + the first admin. When **no trips exist**, it also creates a small fleet so
the admin screens are not empty:

* 2 counters (Gabtoli, Saydabad) with 5% commission
* 4 routes (Chattogram, Sylhet, Khulna, Rajshahi) with stops and durations
* 4 buses with different seat layouts (42 non-AC, 40 AC, 24 AC sleeper, 18 Hiace)
* 4 drivers, each linked to a bus
* 6 trips over the next three days (two per day)

It is idempotent and **skips itself if any trip already exists**, so it can never overwrite real scheduling data.
Turn it off with `SEED_DEMO_DATA=false` in `server/.env`.

To try the app without Atlas, run a local MongoDB and point `MONGODB_URI` at it:

```bash
# terminal 1 — local database (only for development)
mongod --dbpath /tmp/bb-mongo --port 27017

# terminal 2 — API
cd server
MONGODB_URI=mongodb://127.0.0.1:27017/busbook_dev npm run seed
MONGODB_URI=mongodb://127.0.0.1:27017/busbook_dev npm run dev

# terminal 3 — app
cd client && npm run dev
```

For production, put your Atlas connection string in `server/.env` as `MONGODB_URI` and run the seed once.

---

## 5. Frontend files

| File | Why it exists |
|---|---|
| `client/src/layouts/AdminLayout.jsx` | Sidebar (desktop) / drawer (mobile) shell with the language switch and sign-out. |
| `client/src/pages/admin/AdminDashboardPage.jsx` | KPI cards, trips-by-status pie, next-7-days bar chart (Recharts), next departures table, honest "revenue in Phase 6" note. |
| `client/src/pages/admin/BusesPage.jsx` | Bus table + form: number, operator, type, seat layout, disabled seats, live seat preview, amenities, status, delete guard. |
| `client/src/pages/admin/DriversPage.jsx` | Driver table + form, optional login creation, assigned bus, status. |
| `client/src/pages/admin/RoutesPage.jsx` | Route table + form: code, origin/destination, stops, duration, status. |
| `client/src/pages/admin/TripsPage.jsx` | Trip table + schedule form (route, bus, driver, Dhaka date/time, fare, boarding/dropping points), inline status change, cancel-with-reason. |
| `client/src/pages/admin/CountersPage.jsx` | Counter table + form: branch, phone, address, staff, commission. |
| `client/src/pages/admin/UsersPage.jsx` | Staff accounts: create ADMIN/COUNTER, change role, suspend/activate, self-protection. |
| `client/src/pages/admin/SettingsPage.jsx` | Cancellation policy, booking limits, notifications, payment toggles, default/ticket language, ticket text. |
| `client/src/components/admin/DataTable.jsx` | One table: columns, loading skeleton, empty state, error row, row keys. |
| `client/src/components/admin/Modal.jsx` | Accessible dialog: labelled by its title, Escape/backdrop close, scroll lock, translated close button. |
| `client/src/components/admin/ConfirmDialog.jsx` | Destructive confirmation with a danger button. |
| `client/src/components/admin/{PageHeader,Pagination,SearchInput,StatusBadge}.jsx` | Shared page furniture; badges and pagination are bilingual. |
| `client/src/components/ui/SelectField.jsx` | Select with the same label/error layout as the other form fields. |
| `client/src/hooks/useList.js` | Paging + debounced search + filters for every admin table. Loading is derived from the request key, not set inside an effect. |
| `client/src/services/admin.api.js` | Every admin call in one place. |
| `client/src/schemas/admin.schemas.js` | Zod form schemas built with the translation function, so validation messages follow the chosen language. |
| `client/src/utils/datetime.js` | `formatDate`, `formatDateTime`, `formatMoney`, `formatNumber`, `formatDuration`, `toDateInputValue` — all Dhaka-aware, Bangla digits when the UI is Bangla. |
| `client/src/utils/formErrors.js` | Puts server field errors under the right input. |
| `client/src/locales/{bn,en}/admin.json` | Every admin string, including validation messages and hints. |

`recharts` is the only new dependency (dashboard charts).

### Bilingual details

* Bangla is the default; `English` in the header switches instantly (`react-i18next`, namespace `admin`).
* Numbers, money and dates follow the language: `৪২টি সিট`, `১,২০০৳`, `১০ নভে, ২০২৬, ৮:০০ AM`.
* Validation messages come from the same Zod schema in the chosen language — no English leftovers in the form.

---

## 6. Testing

### Automated (backend)

```bash
cd server
npx vitest run
```

Result at the end of Phase 4: **51 tests pass** (26 auth + 25 admin), about 26 seconds. The admin suite starts a
real MongoDB in memory, signs in as an admin through the actual login endpoint, and checks:

* non-admins and anonymous callers get 401/403;
* bus create/update/list/status/delete, including the **seat-count recompute on edit**;
* delete-in-use answers 409;
* route create and duplicate origin→destination rejection;
* trip scheduling, bus/driver conflict, cancel-and-free-slot, status changes;
* dashboard shape (and that revenue is explicitly unavailable);
* settings merge + policy-order rejection;
* counter creation, staff assignment, and detaching staff on delete;
* admin self-protection (own role, own status, last active admin);
* lookups return only active resources;
* a cookie-authenticated write without a trusted `Origin` is blocked.

### Manual (browser)

1. Start the API and client as shown in section 4, then open `http://localhost:3000/login`.
2. Sign in with the seeded admin: `admin@busbook.local` and the `ADMIN_PASSWORD` from `server/.env`
   (default `ChangeMe@12345` — change it before deploying).
3. Check the list below.

| Check | Expected |
|---|---|
| Dashboard | Real counts, both charts render, "revenue comes in Phase 6" note is visible |
| Buses → add | Seat preview updates while typing; new bus appears in the table |
| Buses → edit layout | Total seats changes to rows × columns − disabled |
| Buses → delete | 409 with "in use, set inactive instead" when trips reference it |
| Trips → schedule | Today's date pre-filled; same bus + same time is refused with a field error under the bus |
| Trips → cancel | Ask for a reason; row becomes "বাতিল"; the bus can then be scheduled again |
| Users | Your own row's role/suspend buttons are disabled; last-admin rules hold |
| Settings | Save shows a Bangla toast; reload keeps the value; wrong refund order shows a Bangla error |
| Header | `English` switches every label, number and date instantly |

---

## 7. Known limitations (honest list)

* **Server messages are English.** Guard messages such as "That bus is already scheduled to depart at this time"
  come from the API and are not translated yet; form validation messages *are* Bangla. Adding stable error codes
  and translating them on the client is a good Phase 5/8 task.
* **No booking/revenue numbers yet** — by design; they arrive with Phase 6.
* **Bundle size warning.** The production build is one ~1 MB JS chunk. Route-level code splitting is planned for
  Phase 8; it does not affect correctness.
* **Local MongoDB is temporary.** The repo expects Atlas (`MONGODB_URI`); the local `mongod` used for verification
  keeps data in `/tmp` and is wiped when the sandbox is restored. Re-run `npm run seed` after that.

---

## 8. Commands recap

```bash
cd server && npm ci && npm run seed && npm run dev   # API :5000
cd client && npm ci && npm run dev                   # app :3000
cd server && npx vitest run                          # tests
cd client && npm run lint && npm run build           # lint + production build
```

## 9. What Phase 5 builds on this

Phase 5 (passenger site: search, seat map, 2-minute holds) will reuse:

* `GET /api/admin/lookups` patterns for public route/trip search,
* the trip document's `seatSummary` (already counting booked/total),
* `SystemSetting.booking.holdMinutes` (editable here),
* the same `useList`/formatting utilities and Bangla/English strings.
