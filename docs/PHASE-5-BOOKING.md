# Phase 5 — Passenger search, seat map and 2-minute holds

This phase makes the passenger side real: you can search the timetable, open a bus, pick seats and have those
seats reserved on the server for two minutes while you decide. Nothing is charged and no booking exists yet —
that is Phase 6. The important part here is the **hold engine**, because it is what makes double-selling a seat
impossible later.

---

## 1. What this phase delivers

| Area | Delivered |
|---|---|
| Public API | Settings, popular routes, trip search, trip details, seat map |
| Seat holds | `POST /api/holds`, release one seat, release all seats on a trip |
| Guest identity | Random httpOnly `bb_sid` cookie — no login needed to hold seats |
| Race safety | Unique `(tripId, seatNumber)` index + per-seat atomic upsert |
| Expiry | `expiresAt` checked in every query + a 30-second sweeper job |
| Seat ledger | New `SeatHold` collection, one row per seat per trip |
| Passenger UI | Homepage search, `/trips` results, `/trips/:id/seats` seat map, live countdown |
| Bilingual | New `booking` namespace in Bangla (default) and English |
| Tests | 20 backend tests added (71 total), first 8 frontend tests (Vitest + Testing Library) |

---

## 2. How a seat hold actually works

The timeline for a passenger holding seat A1:

1. `GET /api/trips/:id/seats` — the server builds the seat map from the bus layout and marks each seat
   `available`, `held`, `booked`, `blocked` or `mine`. It also sets the `bb_sid` cookie if this browser has none.
2. `POST /api/holds { tripId, seatNumbers: [1] }` — the server checks the trip is still sellable, the seat
   exists, and the request is within the booking limits. Then it writes **one row per seat**.
3. The response contains `expiresAt` (now + `holdMinutes`, 2 minutes by default). The UI counts down from that
   server value, never from its own clock.
4. Anyone else looking at the same bus now sees that seat as `held` and cannot select it.
5. After two minutes the seat is free again: availability queries ignore expired rows, and the sweeper deletes
   them within 30 seconds.

### Why per-seat writes instead of one big update

Two passengers can tap the same seat in the same millisecond. The safe primitive is:

```js
SeatHold.findOneAndUpdate(
  {
    tripId,
    seatNumber,
    $or: [
      { status: 'held', expiresAt: { $lte: now } },        // expired: free to take
      { status: 'held', holderSessionId: sessionId },       // already mine: extend
    ],
  },
  { $set: { status: 'held', holderSessionId: sessionId, expiresAt }, $unset: { bookingId: 1 } },
  { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
);
```

If the seat is free, the upsert inserts it. If another request inserted it first, the unique
`uniq_trip_seat` index rejects this insert with code `11000`, which becomes a clean `409` for the passenger.
The database decides the winner, not our JavaScript.

If a request for three seats fails on the second one, the rollback deletes **only the seats this attempt
created** (`myActiveSeats` are kept), then recounts the trip counters. A passenger never loses a seat they
already held.

### Why there is no MongoDB TTL index

A TTL index would delete hold documents in the background without updating `trip.seatSummary.held`. The trip
list would then say "2 seats held" forever. Instead:

- every availability query filters on `expiresAt > now`;
- the sweeper (`server/src/jobs/holdSweeper.js`) deletes expired rows and recounts the affected trips;
- `trip.seatSummary` is only written by `recountTripSeats()`, which counts the same rows the seat map reads.

### Seat identity and labels

`seatNumber` is the 1-based position in the bus grid and is the permanent identity used by holds and, later,
bookings. `seatLabel` is what a human reads. A disabled grid position (a door, the stairs) consumes no label,
so the first real seat is still `A1`, not `A2`.

---

## 3. Backend files

```
server/src/
├── models/SeatHold.js              # seat ledger + unique index + live-hold index
├── middleware/session.js           # bb_sid guest cookie (read / create)
├── middleware/rateLimit.js         # + seatHoldLimiter (40 holds / 10 min / IP)
├── services/seat.service.js        # layout, availability, hold, release, sweeper
├── validators/public.validator.js  # search query, trip id, hold body
├── controllers/public.controller.js        # settings + popular routes
├── controllers/trip.public.controller.js   # search, trip, seat map
├── controllers/hold.controller.js          # create / release holds
├── routes/public.routes.js         # /api/public
├── routes/trips.routes.js          # /api/trips
├── routes/holds.routes.js          # /api/holds
├── jobs/holdSweeper.js             # 30-second expired-hold sweep
├── utils/query.js                  # + dhakaToday()
└── seed/index.js                   # now registers SeatHold so its index is built
```

`server/server.js` starts the sweeper after the database connects. `server/tests/setup.js` registers `SeatHold`
so the test database builds the real unique index.

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/public/settings` | public | Hold minutes, max seats, advance days, cancellation policy |
| GET | `/api/public/popular-routes` | public | Routes with departures in the next 7 days + lowest fare |
| GET | `/api/trips/search?origin&destination&date&busType&page&limit` | public | Search the timetable |
| GET | `/api/trips/:id` | public | One departure (direct links) |
| GET | `/api/trips/:id/seats` | public | Layout + every seat + this browser's hold |
| POST | `/api/holds` | guest cookie | Hold 1–6 seats for `holdMinutes` |
| DELETE | `/api/holds/:id` | guest cookie | Release one held seat |
| DELETE | `/api/holds?tripId=…` | guest cookie | Release every seat this browser holds on a trip |

Search matches the origin/destination **name or city**, so "Dhaka" finds a route whose origin is "Gabtoli"
with city "Dhaka". Only routes with status `active` and trips with status `scheduled`/`delayed` are returned;
cancelled trips disappear from search and cannot be held.

A successful hold returns:

```json
{
  "success": true,
  "message": "Seats held",
  "data": {
    "hold": {
      "tripId": "…",
      "seats": [{ "holdId": "…", "seatNumber": 1, "label": "A1" }],
      "holdMinutes": 2,
      "expiresAt": "2026-11-11T04:12:00.000Z",
      "seatSummary": { "total": 24, "booked": 0, "held": 2, "available": 22 }
    }
  }
}
```

---

## 4. Rules that are actually enforced

- **2 minutes** per hold (`SystemSetting.booking.holdMinutes`); the sweeper runs every 30 seconds.
- **6 seats** per request (`maxSeatsPerBooking`), also enforced in the validator (max 20 in one payload).
- **Advance booking window** (`advanceBookingDays`, 60 by default) — a search beyond it returns a clear 400.
- A trip must be `scheduled` or `delayed`, not `cancelled`, and must not have departed.
- A hold can only be released by the browser session that created it (`403` otherwise); another guest taking
  the same seat gets `409`.
- Expired holds are invisible to passengers *and* reclaimable immediately, even before the sweeper runs.
- Seat counters on the trip (`seats.total/booked/held`) are always recomputed from the ledger.
- Holds are rate-limited (40 per 10 minutes per IP) because each one writes and takes a seat off sale.
- Passengers can look and hold without an account; nothing personal is stored against a guest session.

---

## 5. Frontend files

```
client/src/
├── pages/public/TripResultsPage.jsx   # /trips — URL-driven search results
├── pages/public/SeatSelectionPage.jsx # /trips/:id/seats — map, hold, countdown
├── pages/public/HomePage.jsx          # search band on the homepage
├── components/booking/SearchForm.jsx  # origin, destination, date, bus type
├── components/booking/HomeSearch.jsx  # search form + real popular-route chips
├── components/booking/SeatMap.jsx     # accessible grid, aisle, legend, disabled seats
├── services/booking.api.js            # public endpoints
├── store/bookingDraftStore.js         # sessionStorage: seats + expiry per trip
├── locales/{bn,en}/booking.json       # new namespace
└── utils/datetime.js                  # + formatTime(), formatCountdown()
```

Routes are added inside `PublicLayout` in `client/src/routes/AppRoutes.jsx`, so `/trips` and the seat page need
no login. The URL is the state: refreshing or sharing `/trips?origin=Dhaka&destination=Chattogram&date=…`
shows the same search.

The seat map colours by status and never relies on colour alone — every seat has an `aria-label` such as
`A1 — খালি`, and sold/held seats are `disabled`. Row numbers, the aisle position and disabled seats all come
from the bus layout, so a 2+2 coach and a 24-seat Hiace both draw correctly.

Once seats are held the map becomes read-only: changing a hold halfway would be more confusing than releasing
and picking again. The release button calls `DELETE /api/holds?tripId=…`, which works by cookie even after a
refresh where the individual hold ids are gone.

The countdown is driven by the server's `expiresAt`. At zero the page clears the draft, reloads the seat map
and explains that the seats went back on sale. `sessionStorage` only remembers which seats this tab held, so a
refresh keeps the timer; the server remains the source of truth.

---

## 6. Testing

### Automated — backend

```bash
cd server && npm test
```

**71 tests pass** (51 from earlier phases + 20 new). The Phase 5 file `server/tests/holds.test.js` covers:

- public settings expose booking limits and no secrets;
- popular routes show real departures, lowest fare and free seats;
- search by route/date, empty results, missing fields, past date, bus-type filter, cancelled trips hidden;
- seat layout with a disabled seat (labels `A1…A5`), seat statuses, `sessionHold` after refresh;
- holding two seats updates the trip counters and marks them `mine`;
- a second guest gets `409` on the same seat; the same guest can extend a hold;
- unknown seats and more than the limit are rejected; booked seats cannot be held;
- an expired hold can be taken over immediately;
- release one seat frees it, a foreign session gets `403`, release-all returns every seat;
- the sweeper deletes expired rows, recounts the trip, and leaves live holds alone.

### Automated — frontend

```bash
cd client && npm test
```

**8 tests pass** (Vitest + jsdom + Testing Library):

- `formatCountdown` formats `mm:ss` with English and Bangla digits and never goes negative;
- `SeatMap` draws every real seat, only allows free seats to be clicked, and locks everything while holding;
- `SearchForm` rejects the same city twice and requires both cities.

### Manual browser checks (done in this phase)

1. Homepage loads in Bangla with the search band and real popular routes.
2. Searching Dhaka → Rajshahi on a future date lists the seeded trip with time, duration, fare and free seats.
3. The seat page shows 24 seats with the aisle, live availability and the policy line.
4. Selecting S1 + S2 and pressing the hold button creates the hold; the UI shows "২ মিনিটের জন্য আপনার",
   a counting-down `০১:৫৫`, disabled seats and a release button.
5. Refreshing the page keeps S1/S2 as mine and continues the countdown.
6. Releasing returns both seats to `খালি` and the button returns to the hold action.
7. Switching to English shows English labels and still-localised digits in the countdown.

---

## 7. Known limitations (honest list)

- **No booking yet.** A hold is not a ticket. The button says so, and no payment or revenue is recorded.
- **No seat change while holding.** Release and pick again; this avoids half-released groups.
- **Holds are not released when you leave the page.** They expire in two minutes instead. A navigation-based
  release would need a reliable unload signal, which browsers do not provide.
- **Guest holds are per browser.** Clearing cookies loses the ability to release early (the seats still expire).
- **Single deck only.** The layout renders one grid; a double-decker bus needs a second deck in a later phase.
- **Server messages are English**, as in Phase 4; the UI labels around them are bilingual.
- **Popular routes look 7 days ahead**, so a route with only later departures is not in the chips.
- **Expiry at the UI is not instant.** The countdown is exact to the second; other passengers' expired seats
  may linger visually until the sweeper runs (≤30 s) or the map reloads.
- The in-memory test database is temporary by design; production uses MongoDB Atlas.

---

## 8. Commands recap

```bash
# terminal 1 — local MongoDB (development only)
mongod --dbpath /tmp/bb-mongo --port 27017

# terminal 2 — API
cd server && npm run dev

# terminal 3 — app
cd client && npm run dev

# seed the demo timetable (safe to repeat)
cd server && npm run seed

# tests
cd server && npm test
cd client && npm test
```

Demo login: `admin@busbook.local` / `ChangeMe@12345`.

---

## 9. What Phase 6 builds on this

The hold engine is deliberately shaped for booking:

- `SeatHold.status` already supports `booked` and `blocked`, and holds a `bookingId` field.
- Converting a hold into a booking is one atomic `held → booked` update owned by the same unique index.
- A cancellation flips the seat back to `available` by deleting the row and recounting the trip.
- Phase 6 adds passenger details, booking documents, ticket numbers, SSLCommerz sandbox payment, counter cash
  sales and printable tickets — using these same seat rules rather than a second implementation.
