# Phase 9 — Deployment to MongoDB Atlas, Render and Vercel

Phase 9 prepares and documents production deployment. The repository now contains a Render
Blueprint, a Vercel configuration, a production configuration guard, and a repeatable
post-deploy verification script.

**What this environment cannot do:** it has no MongoDB Atlas, Render or Vercel account and no
credentials for them. The actual deployment must be performed by the project owner, following
the steps below. No deployment URL is claimed in this document because none was created.

---

## 1. What was added for production

| File | Purpose |
|---|---|
| `render.yaml` | Render Blueprint: Node service in `server/`, `npm ci`, `npm start`, health check `/api/health`, production env defaults |
| `client/vercel.json` | Vite build settings, SPA rewrite for deep links, security and cache headers |
| `client/vite.config.js` | Fails a Vercel build when `VITE_API_BASE_URL` is missing |
| `server/src/config/env.js` | Production guard already existed; now also requires `API_PUBLIC_URL` when SSLCommerz is configured |
| `server/.env.example` | Correct SSLCommerz and API public URL variable names |
| `scripts/verify-deployment.mjs` | Public smoke checks for a deployed API and client |

Existing production behaviour that matters:

- `JWT_SECRET`, `MONGODB_URI` and `CLIENT_URL` are validated at boot; a bad value exits with a
  readable error instead of starting insecurely.
- The session cookie is `httpOnly`, `secure` and `SameSite=None` in production, which is required
  because Vercel and Render are different sites.
- `trust proxy` is enabled so rate limiting sees the real client IP behind Render's proxy.
- CORS allows only the exact origins listed in `CLIENT_URL`, with credentials.
- A state-changing request that carries the session cookie must also carry a trusted `Origin`.
- The production database failure path exits rather than serving a half-working API.

---

## 2. Step 1 — MongoDB Atlas

1. Create a free Atlas account and an **M0** cluster (region close to Render Singapore, e.g.
   AWS Singapore).
2. **Database Access** → add a database user with a strong password (not the Atlas login).
3. **Network Access** → add an IP entry.
   - Render free services do not have fixed outbound IPs, so use `0.0.0.0/0`.
   - Atlas is still protected by the database username and password; the API never exposes them.
4. **Connect → Drivers → Node.js** and copy the `mongodb+srv://…` string.
5. Add the database name before the query string:
   `…mongodb.net/busbook?retryWrites=true&w=majority`
6. Create indexes, settings and the first admin by running the seed **from your own machine**
   against Atlas:

   ```bash
   cd server
   MONGODB_URI="mongodb+srv://USER:PASSWORD@cluster.mongodb.net/busbook?retryWrites=true&w=majority" \
   ADMIN_NAME="Your Name" \
   ADMIN_EMAIL="you@example.com" \
   ADMIN_PHONE="01712345678" \
   ADMIN_PASSWORD="a-long-unique-password" \
   SEED_DEMO_DATA=false \
   npm run seed
   ```

   `SEED_DEMO_DATA=false` is essential: the demo fleet must not exist in production.

7. Never put this URI in `client/`, in Git, or in a chat message.

---

## 3. Step 2 — Render (API)

1. Push the repository to GitHub.
2. Render → **New +** → **Blueprint** → select the repository. Render reads `render.yaml`.
3. Fill the values marked `sync: false`:

   | Variable | Value |
   |---|---|
   | `MONGODB_URI` | the Atlas connection string |
   | `CLIENT_URL` | `https://your-app.vercel.app` (add the preview domain too if you use one, comma separated, no trailing slash) |
   | `API_PUBLIC_URL` | `https://busbook-api.onrender.com` (your Render URL, after it is assigned) |

   Optional integrations stay empty unless you have real credentials:
   `RESEND_API_KEY`, `MAIL_FROM`, `SSL_WIRELESS_API_TOKEN`, `SSL_WIRELESS_SID`,
   `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`.
   Keep `SSLCOMMERZ_SANDBOX=true` until the live gateway is deliberately enabled.

4. Deploy. The first request after idle can take ~30–60 seconds on the free plan.
5. Check `https://busbook-api.onrender.com/api/health`.
   Expected: HTTP 200, `environment: "production"`, `database.connected: true`.
6. If it fails, read Render logs for the `[FATAL] Unsafe production configuration:` block; it
   names the missing variable without printing its value.

**Do not** run `npm run seed` on Render for demo data. The seed against Atlas above already
created the admin. To rotate the admin password later, run seed again locally with new values
and `SEED_DEMO_DATA=false`; it updates the existing admin rather than creating a second one.

---

## 4. Step 3 — Vercel (client)

1. Vercel → **Add New → Project** → import the same repository.
2. Set **Root Directory** to `client`. Vercel then reads `client/vercel.json`.
3. Add an environment variable for Production (and Preview if desired):

   `VITE_API_BASE_URL = https://busbook-api.onrender.com/api`

   This is public configuration, not a secret. Never add server secrets to Vercel.
4. Deploy.
5. If the build fails with `VITE_API_BASE_URL is required on Vercel`, add the variable and
   redeploy. This guard exists so a broken frontend is never published.
6. Copy the final Vercel domain into Render's `CLIENT_URL` and redeploy the API so CORS and the
   cookie origin match exactly.

Order matters: API first (to know its URL), then client, then update `CLIENT_URL`.

---

## 5. Step 4 — Production verification

Run the included script from the repository root:

```bash
PROD_API_URL=https://busbook-api.onrender.com \
PROD_CLIENT_URL=https://your-app.vercel.app \
node scripts/verify-deployment.mjs
```

It checks, without logging in:

- API `/api/health` returns 200 and reports `production` with a connected database
- `x-powered-by` is absent and `nosniff` is set
- `/api/public/settings` works without a session
- CORS allows exactly the deployed client origin, with credentials
- CORS refuses an unrelated origin
- the client returns the React shell
- a deep link such as `/booking/BB-TEST01` returns the SPA instead of a 404

Then verify the flows manually, in this order:

1. Sign in as the seeded admin; the dashboard loads real (empty) data.
2. Create a bus, route, driver, counter and trip through the admin UI.
3. Open the public search, pick a trip and hold seats.
4. Complete a pay-at-counter reservation and open the ticket.
5. Sell a ticket from the counter with cash; open it in admin cancellations and reports.
6. Cancel it, approve and process the refund; confirm the ticket shows `refunded` and the report
   net drops.
7. Sign in as a driver (create a driver login through the admin panel first), start the trip,
   report a location, and confirm the map marker and manifest.
8. Switch to Bangla and repeat one screen to confirm the language and fonts.
9. Check browser devtools: the session cookie must be `Secure`, `HttpOnly`, `SameSite=None`.
10. Confirm an unpaid online reservation still shows as unpaid — no fake success.

If SSLCommerz credentials were added, also test the sandbox round trip and confirm the IPN
reaches `API_PUBLIC_URL`. Until then, online payment stays unavailable by design.

---

## 6. Common production failures

| Symptom | Cause / fix |
|---|---|
| Render exits at boot with `[FATAL]` | One of `JWT_SECRET`, `MONGODB_URI`, `CLIENT_URL` is missing, short, or uses `http://` |
| `/api/health` returns 503 | Atlas unreachable: check the password, database name and Network Access |
| Browser login appears to succeed but the session is lost | `CLIENT_URL` does not exactly match the Vercel origin, or the API is opened over `http://` |
| CORS error on every call | Update `CLIENT_URL` in Render and redeploy; no trailing slash |
| Vercel build fails on `VITE_API_BASE_URL` | Add the variable in Vercel project settings and redeploy |
| Deep links 404 on refresh | `client/vercel.json` was not deployed; confirm Root Directory is `client` |
| Render free instance is slow after idle | Expected cold start; upgrade the plan or add a paid uptime pinger |

---

## 7. Rollback

- Render keeps previous deploys: **Deploys → select a previous deploy → Rollback**.
- Vercel keeps every deployment: **Deployments → … → Promote to Production**.
- A rollback does not roll back the database. Schema changes should stay backward compatible;
  index creation is idempotent via `npm run seed`.

---

## 8. Remaining limitations

- No deployment was performed here; all URLs above are placeholders for the owner's accounts.
- Email/SMS remain in mock mode until provider credentials are supplied and verified.
- SSLCommerz live mode is not verified; sandbox credentials were never available.
- Render's free plan sleeps after inactivity and has no fixed outbound IP, hence `0.0.0.0/0`
  in Atlas.
- No automated uptime monitoring, log aggregation or backup schedule is configured.
- Server messages remain English only.
