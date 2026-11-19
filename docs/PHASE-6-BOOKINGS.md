# Phase 6 — Bookings, tickets, counter cash sales and SSLCommerz

Phase 6 turns a two-minute seat hold into a real ticket, adds the counter's cash
sale, and connects a hosted SSLCommerz checkout for passengers who pay online.

Two principles hold the whole phase together:

1. **The seat ledger is still the only authority.** A seat is sold when the
   conditional update in `SeatHold` says so. A booking never decides that on its
   own.
2. **Nothing is ever marked paid without evidence.** A browser redirect never
   confirms money. Only SSLCommerz's server-side validation API can do that, and
   only after our server checks the transaction id, amount and currency.

---

## 1. What a booking is

A `Booking` document is the ticket:

| Field | Meaning |
|---|---|
| `bookingCode` | The printed ticket number, `BB-XXXXXX` (no 0/O/1/I). Unique forever. |
| `verificationCode` | Six digits a conductor can check at boarding. |
| `tripId`, `seats[]`, `seatCount` | The journey and the exact seats. |
| `passenger` | Name, phone, optional email/gender/age/NID. |
| `farePerSeat`, `totalAmount`, `discount`, `payableAmount` | Money, always computed on the server from the trip fare. A client cannot send an amount. |
| `paymentMethod` | `cash` or `sslcommerz`. |
| `paymentStatus` | `unpaid`, `pending`, `paid`, `failed`, `refunded`… |
| `status` | `pending`, `confirmed`, `completed`, `cancelled`, `expired`. |
| `channel` | `online` or `counter`. |
| `bookedBy` | Staff user / counter for a counter sale, empty for a guest. |
| `holdIds` | The `SeatHold` rows this booking converted. |
| `guestSessionId` | The `bb_sid` cookie that booked it. Never returned by the API. |
| `paymentDeadlineAt` | When an unpaid gateway booking loses its seats. Null for cash. |

Every payment attempt is a separate `Payment` document. Its `_id` is sent to
SSLCommerz as `tran_id`, which makes it the idempotency key: a duplicated IPN can
only ever confirm the same booking, never a different one. `providerTranId` is
unique in MongoDB.

---

## 2. Hold → booking (online passenger)

`POST /api/bookings` does this in a fixed order:

1. Validate the trip is still bookable and the seats exist on the bus layout.
2. Recompute the fare; reject unknown seats, too many seats, bad passenger data.
3. For each selected seat, require a **live hold owned by this browser**:
   `status: held`, `holderSessionId === bb_sid`, `expiresAt > now`.
4. Flip them with one guarded `updateMany`:

   ```js
   SeatHold.updateMany(
     { _id: { $in: holdIds }, holderSessionId: sessionId,
       status: 'held', expiresAt: { $gt: now } },
     { $set: { status: 'booked', bookingId }, $unset: { expiresAt: 1 } },
   )
   ```

   If `modifiedCount !== seats.length`, the attempt deletes the rows **it** just
   flipped and returns `409`. This is the same guarantee as the hold engine,
   without needing MongoDB transactions (the dev/test database is standalone).
5. Create the `Booking`. If that insert fails, the seats claimed by this attempt
   are released again, so a failed sale can never leave a seat marked sold with
   no ticket behind it.
6. Recount the trip's `seatSummary` from `SeatHold`.

There is no "booking without a hold" path online, and the price is never trusted
from the client.

---

## 3. Two honest ways to pay online

### 3.1 Pay at counter (cash reservation)

* Booking status `pending`, payment status `unpaid`, `paymentDeadlineAt: null`.
* The seat is genuinely reserved; the ticket exists and shows **amount due**.
* Staff collect cash at a counter (`POST /api/counter/bookings/:code/collect`),
  which moves it to `confirmed/paid` and writes a `cash` Payment row.
* Cash reservations never expire automatically. An operator can cancel them in a
  later phase; pretending they expire would silently free a seat someone was
  promised.

### 3.2 SSLCommerz hosted checkout

Only offered when **both** are true:

* `SSLCOMMERZ_STORE_ID` and `SSLCOMMERZ_STORE_PASSWORD` are set; and
* the admin has enabled **Settings → Payments → Online payment**.

If either is missing, the seat map reports `paymentOptions.online: false`, and
creating a `sslcommerz` booking returns `409` with a clear message. The UI falls
back to the cash reservation. No fake success page exists.

Flow:

```
browser  ──POST /api/payments/initiate──▶  API
                                           ├─ creates/reuses Payment (tran_id = Payment._id)
                                           ├─ POST sandbox /gwprocess/v4/api.php
                                           └─ returns GatewayPageURL
browser  ──redirect──▶  SSLCommerz checkout
                         ├─ success_url → POST /api/payments/callback/success
                         ├─ fail_url    → POST /api/payments/callback/fail
                         ├─ cancel_url  → POST /api/payments/callback/cancel
                         └─ ipn_url     → POST /api/payments/ipn  (server-to-server)
API      ──GET /validator/api/validationserverAPI.php?val_id=…──▶ SSLCommerz
         ✔ status VALID/VALIDATED
         ✔ tran_id equals our providerTranId
         ✔ amount equals the booking amount (±0.01)
         ✔ currency BDT
         → Payment success  → Booking confirmed/paid
```

Security decisions:

* `val_id` is always verified server-side. The `?payment=success` query string
  only changes the banner text; the banner reads the booking from our database.
* Card data and the store password are stripped before `rawValidation` is stored.
* A mismatched amount or transaction id marks the payment `failed` and leaves the
  ticket unpaid.
* A repeated IPN for an already-successful payment returns 200 immediately and
  creates nothing.
* If money arrives after the booking expired, the payment is recorded as success
  but the booking is **not** resurrected (its seats may already be sold). The
  server logs it for a refund decision — an honest gap the refund phase closes.

Sandbox setup:

```env
SSLCOMMERZ_STORE_ID=your_sandbox_store_id
SSLCOMMERZ_STORE_PASSWORD=your_sandbox_store_password
SSLCOMMERZ_SANDBOX=true
# Public HTTPS address of the API, used for the gateway callbacks.
# The gateway calls from its own servers, so "localhost" cannot work.
API_PUBLIC_URL=https://your-tunnel-or-api.example.com
```

The gateway's sandbox panel must be able to reach these callback URLs. Without a
public HTTPS URL (or credentials), the end-to-end sandbox payment cannot be
completed locally; the flow is covered by mocked gateway tests instead (section 8).

---

## 4. Counter cash sale

`POST /api/counter/bookings` (COUNTER or ADMIN only):

* No guest hold exists, so each seat is claimed with a per-seat conditional
  update that only accepts a **free seat or a dead hold**. A live hold or a sold
  seat makes MongoDB's unique `(tripId, seatNumber)` index reject the upsert; the
  API catches `E11000` and answers `409` with "held or sold".
* The booking is created `confirmed/paid` and a real `cash` Payment row is
  written with the staff user and (when assigned) the counter.
* Admin users can sell without a counter; the response says so.

`POST /api/counter/bookings/:code/collect` takes cash for an unpaid reservation.
It uses a conditional update (`unpaid → paid`) so a double click cannot write two
payments; the second request gets `409`.

Counter search (`GET /api/counter/bookings?q=`) matches ticket number, passenger
phone or name, and returns the same ticket shape as the passenger pages.

---

## 5. Who can open a ticket

`GET /api/bookings/:code` allows:

* ADMIN or COUNTER staff;
* the signed-in passenger whose account created it;
* a signed-in user whose phone matches the booking phone;
* the guest browser that created it (`bb_sid`);
* anyone who supplies `?phone=` matching the booking phone.

Otherwise `403`. The verification code is only included for allowed viewers.

`GET /api/bookings/lookup?code=…&phone=…` requires **both** values and returns
`404` for any mismatch, so the short ticket number alone reveals nothing.

---

## 6. Expiry sweeper

`expireStaleBookings()` runs in the same 30-second job as the hold sweeper:

* finds `pending` bookings with `paymentDeadlineAt <= now`;
* flips each to `expired` with a conditional update;
* deletes the `SeatHold` rows belonging to that booking;
* marks unfinished gateway payments as `failed`;
* recounts the affected trips.

Cash reservations have no deadline and are never touched by the sweeper.

---

## 7. API endpoints added

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/bookings` | guest + `bb_sid` (optional login) | Hold → ticket; cash or SSLCommerz |
| GET | `/api/bookings/:code` | owner / staff / phone | Read a ticket |
| GET | `/api/bookings/lookup` | public, rate limited | Ticket number + phone |
| GET | `/api/bookings` | passenger login | My tickets |
| POST | `/api/payments/initiate` | ticket owner | Hosted checkout URL |
| POST | `/api/payments/callback/success` | gateway (CSRF-exempt) | Verify + confirm |
| POST | `/api/payments/callback/fail` | gateway | Record failure |
| POST | `/api/payments/callback/cancel` | gateway | Record cancellation |
| POST | `/api/payments/ipn` | gateway | Idempotent server notification |
| GET | `/api/counter/context` | COUNTER/ADMIN | Assigned counter |
| GET | `/api/counter/bookings` | COUNTER/ADMIN | Search tickets |
| POST | `/api/counter/bookings` | COUNTER/ADMIN | Cash sale |
| POST | `/api/counter/bookings/:code/collect` | COUNTER/ADMIN | Collect cash |

Public additions: `/api/public/settings` exposes `payments.onlineAvailable` and
`booking.paymentWindowMinutes`; `/api/trips/:id/seats` exposes `paymentOptions`
and `paymentWindowMinutes`.

---

## 8. Tests

```bash
cd server && npx vitest run
```

96 tests pass (25 new for Phase 6), covering:

* hold → booking, seat counters, stored hold ids;
* booking without/with an expired hold, another guest's holds;
* validation (missing phone, unknown seat, too many seats);
* online payment unavailable without credentials;
* ticket access rules (owner session, other guest, phone, lookup, my tickets);
* counter sale, counter vs live hold conflict, role 403, collect cash once;
* counter search + anonymous 401;
* sweeper expiry of unpaid gateway bookings (and cash exemptions);
* SSLCommerz with a mocked gateway: session creation payload (`tran_id`,
  `total_amount`, `value_a`), validator approval, duplicate IPN, amount mismatch,
  cancellation, unknown IPN.

Client: `cd client && npm test`, `npx oxlint`, `npm run build`.

**Not verified in this environment:** a real SSLCommerz sandbox round trip,
because there are no sandbox credentials and no public HTTPS callback URL. The
integration is implemented and unit-tested against a mocked gateway; it must be
re-verified with real sandbox keys before production. No payment success,
revenue or SMS/email delivery is claimed anywhere.

---

## 9. Frontend pages added

| Route | Page |
|---|---|
| `/booking/:tripId/passenger` | Passenger details + payment choice |
| `/booking/:code` | Printable ticket, payment retry, real status |
| `/booking/lookup` | Ticket number + phone lookup |
| `/counter` | Counter dashboard: find trip, sell seats for cash, search tickets, collect cash |

The seat page now has **Continue to passenger details** once seats are held. The
account page lists the signed-in passenger's tickets. Printing uses the existing
`.no-print` convention plus a dedicated `.ticket-print` block.

---

## 10. Demo logins (development seed)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@busbook.local` | `ChangeMe@12345` |
| Counter staff (CT-01 Gabtoli) | `counter@busbook.local` | `Counter@12345` |

Run the seed once to create the counter login and attach it to CT-01.

---

## 11. Known limitations / next phase

* Refunds after a late gateway payment are logged but not automated (Phase 7).
* Cash reservations do not expire by themselves; staff cancel or collect them.
* PDF ticket download is not built yet — the browser's print dialog produces a
  clean ticket (the roadmap lists PDF in a later phase).
* Email/SMS ticket delivery is not sent; Phase 7 wires notifications with honest
  mock mode until keys exist.
* Gateway callback URLs need a public HTTPS address; the UI clearly falls back to
  pay-at-counter when online payment is not configured.
