# Phase 2 — Foundation, explained

**Goal of this phase:** a React app and an Express API that both run, an API that proves it can reach
MongoDB Atlas, and a seed script that prepares the database. No booking features yet — those need a
trustworthy base first.

---

## 1. What was created

### Backend — `server/`

| File | Why it exists |
|---|---|
| `server.js` | The entry point. Connects the database, starts listening, and closes everything cleanly on Ctrl+C. Kept tiny on purpose. |
| `src/app.js` | Builds the Express app: security headers, CORS, body parsing, injection guards, rate limiting, routes, error handling. Separated from `server.js` so tests can import the app without opening a port. |
| `src/config/env.js` | The **only** file that reads `process.env`. Everything else imports `env`. This is what keeps secrets in one place. |
| `src/config/db.js` | Mongoose connection, disconnect, and a safe status snapshot for `/api/health`. |
| `src/config/logger.js` | Tiny timestamped logger (no extra dependency). |
| `src/config/constants.js` | Role and status enums used by models, validators and authorization. |
| `src/models/User.js` | Users collection: four roles, bcrypt hash (cost 12), unique email/phone, index set. |
| `src/models/SystemSetting.js` | The single settings document: cancellation policy, hold minutes, notification + language settings. |
| `src/routes/index.js` | Mounts API areas in one place (`/health` now; `/auth`, `/trips`, `/bookings`, … later). |
| `src/routes/health.routes.js` | `GET /api/health` — the endpoint you check after every deploy. |
| `src/middleware/errorHandler.js` | Converts every thrown error into one JSON shape with the right status code. |
| `src/utils/ApiError.js` | Errors you deliberately throw to the client (`ApiError.conflict(...)` etc.). |
| `src/utils/asyncHandler.js` | Forwards async errors to the error middleware (Express 4 does not do this itself). |
| `src/seed/index.js` | `npm run seed`: builds indexes, creates settings, creates the first admin. Safe to re-run. |
| `.env` / `.env.example` | Local secrets (ignored by Git) / documented placeholders (committed). |

### Frontend — `client/`

| File | Why it exists |
|---|---|
| `vite.config.js` | React + Tailwind plugins, port 3000, and the `/api` proxy to port 5000. |
| `src/index.css` | The design system: colour tokens, fonts, seat colours, Bangla line-height, focus ring. |
| `src/i18n.js` | react-i18next setup, language persistence, `<html lang>` switching. |
| `src/locales/{en,bn}/common.json` | All interface text in both languages. |
| `src/services/api.js` | One axios instance, cookie support, and an error normaliser so components never touch axios internals. |
| `src/components/ui/*` | `Button`, `Card`, `Badge`, `Spinner` — shared primitives so pages stay consistent. |
| `src/components/layout/*` | Header (brand + language switcher) and footer. |
| `src/components/health/HealthCard.jsx` | Live API/database card with loading, error and setup states. |
| `src/pages/public/HomePage.jsx` | Phase 2 landing page: what works, the four role dashboards, what comes next. |
| `src/routes/AppRoutes.jsx` | Route table (later: `/admin`, `/counter`, `/driver` trees with role guards). |

---

## 2. MongoDB Atlas, step by step

1. Sign in at [cloud.mongodb.com](https://cloud.mongodb.com) and create a **free cluster** (M0).
   Choose a region near Bangladesh — Singapore or Mumbai.
2. **Database Access** → *Add New Database User*:
   - Authentication: password
   - Username: `busbook_app`
   - Password: click **Autogenerate Secure Password** and save it somewhere safe
   - Built-in role: **Read and write to any database**
3. **Network Access** → *Add IP Address* → `0.0.0.0/0` (allow from anywhere).
   Atlas needs to accept connections from Render, whose free-tier IPs change. The strong password is
   what protects the database. For a private production setup, restrict this list later.
4. **Clusters → Connect → Drivers** → choose *Node.js*, version 6.x → copy the string:

   ```
   mongodb+srv://busbook_app:<db_password>@cluster0.ab1cd.mongodb.net/?retryWrites=true&w=majority
   ```

5. Build your real URI: replace `<db_password>` with the password (URL-encode special characters),
   and add the database name before the `?`:

   ```
   mongodb+srv://busbook_app:YourPassword@cluster0.ab1cd.mongodb.net/busbooking?retryWrites=true&w=majority
   ```

6. Paste it into `server/.env`:

   ```
   MONGODB_URI=mongodb+srv://busbook_app:YourPassword@cluster0.ab1cd.mongodb.net/busbooking?retryWrites=true&w=majority
   ```

7. Run `npm run seed` in `server/`. In Atlas → **Browse Collections** you should now see the
   `busbooking` database with `users` and `systemsettings` collections.

> If `npm run seed` reports `querySrv ENOTFOUND`, your network blocks SRV lookups. In Atlas choose the
> **standard connection string** (`mongodb://…` with three hosts) instead of `+srv`.

---

## 3. How to verify Phase 2

```bash
# Terminal 1 — inside server/
npm run seed        # indexes + settings + admin
npm run dev         # API on :5000

# Terminal 2
curl http://localhost:5000/api/health
```

Expected when the database is connected (HTTP 200):

```json
{
  "success": true,
  "message": "API is running and connected to the database",
  "data": {
    "service": "bus-booking-api",
    "version": "0.2.0",
    "environment": "development",
    "uptimeSeconds": 42,
    "serverTime": "2026-11-10T05:20:00.000Z",
    "database": { "status": "connected", "connected": true, "database": "busbooking" }
  }
}
```

Expected when `MONGODB_URI` is still empty (HTTP 503 — the API is alive, the database is not):

```json
{
  "success": false,
  "message": "API is running, but MONGODB_URI is not configured yet",
  "data": { "database": { "status": "not_configured", "connected": false, "database": null } }
}
```

That second response is a feature, not a failure: it tells you exactly what is missing instead of
pretending the app is healthy.

### Checks performed while building this phase

| Check | Result |
|---|---|
| `GET /api/health` with no `MONGODB_URI` | 503 with `not_configured` ✅ |
| Unknown route (`/api/does-not-exist`) | 404 JSON, no crash ✅ |
| Seed run against a real MongoDB 8.2 server | exit 0, settings + admin created ✅ |
| Seed run twice (idempotency) | second run changes nothing ✅ |
| Unique index on `users.email` | duplicate insert rejected with `11000` ✅ |
| Role enum (`SUPERUSER`) rejected | `ValidationError` ✅ |
| Phone validation (`12345`) rejected | `ValidationError` ✅ |
| Password stored as bcrypt cost-12 hash and verifies | ✅ |
| `GET /api/health` with a connected database | 200 `connected` ✅ |
| Client `npm run build` | 0 errors ✅ |
| Client `npm run lint` | 0 errors, 1 advisory React warning (see below) ✅ |

The advisory warning is `react-hooks/set-state-in-effect` on the health fetch effect. Fetching on mount is
the intended "synchronise with an external system" case; the state updates happen after `await`, so it is
a false positive of a new React Compiler lint. It is left visible rather than suppressed.

---

## 4. Design decisions worth knowing

- **Why the API starts even without a database.** A silent crash looks like "the project is broken" to a
  beginner. A running API that answers `/api/health` with *"MONGODB_URI is not configured"* turns a
  mystery into a next step.
- **Why `/api/health` returns 503 when the database is down.** Uptime monitors (Render, UptimeRobot)
  read the status code, not the JSON. 503 says "not ready" in a language they understand.
- **Why Express 4, not 5.** `express-mongo-sanitize` and `hpp` — the injection guards this project needs —
  are not yet reliable on Express 5. Express 4.22 is still maintained and is what nearly all tutorials target.
- **Why Bangla is the default language.** Most passengers and counter staff read Bangla. English is one
  click away, and the choice is remembered.
- **Why no local MongoDB.** Development and production hit the same Atlas cluster type, so a "works on my
  machine" surprise caused by a different database version cannot happen. The Phase 2 smoke test used a
  temporary in-memory MongoDB purely to verify the models; it is not part of the project.

---

## 5. What is deliberately NOT here yet

- Login and role protection (Phase 3) — do not deploy publicly expecting authentication before then.
- Buses, routes, trips, seat holds, payments, tickets (Phases 4–6).
- Test suite (Jest/Vitest + Supertest) — arrives with Phase 3, where there is real logic to test.

---

## 6. Remaining tasks before Phase 3 starts

1. Create the Atlas cluster and put the real URI in `server/.env`.
2. Run `npm run seed` and confirm `200 connected` from `/api/health`.
3. Change `ADMIN_PASSWORD` in `server/.env` to your own value **before** the first seed, or update the
   admin later once the auth module exists.
