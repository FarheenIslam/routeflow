# BusBook — শুরু এখান থেকে (বাংলা গাইড)

এই ফাইলটি একদম শুরুর ধাপ থেকে ল্যাপটপে চালানো, MongoDB Atlas-এ connect করা এবং
Vercel + Render-এ deploy করার সম্পূর্ণ গাইড। প্রতিটি কমান্ড কপি করে টার্মিনালে চালাতে পারবেন।

---

## 0. প্রথমে একটি গুরুত্বপূর্ণ কথা

এই প্রজেক্টে **দুইটি আলাদা অংশ** আছে:

| অংশ | ফোল্ডার | কোথায় deploy হবে |
|---|---|---|
| Frontend (React) | `client/` | **Vercel** |
| Backend API (Express) | `server/` | **Render** (Vercel-এ Express সার্ভার চলে না) |
| Database | — | **MongoDB Atlas** |

অর্থাৎ Vercel-এ শুধু ওয়েবসাইট (frontend) যাবে, আর API যাবে Render-এ। দুটি URL আলাদা হবে।
এটাই স্বাভাবিক এবং নিরাপদ। Vercel-এ শুধু backend চালানোর কোনো উপায় এই প্রজেক্টে নেই।

---

## 1. কোন কোন phase শেষ, কী বাকি

| Phase | কাজ | অবস্থা |
|---|---|---|
| 1 | আর্কিটেকচার, ডেটাবেস ডিজাইন, API ম্যাপ | ✅ শেষ |
| 2 | প্রজেক্ট সেটআপ, Atlas, health API, seed | ✅ শেষ |
| 3 | লগইন/রেজিস্টার, ৪টি রোল, JWT cookie, নিরাপত্তা | ✅ শেষ |
| 4 | অ্যাডমিন: বাস, ড্রাইভার, রুট, ট্রিপ, কাউন্টার, ইউজার, সেটিংস | ✅ শেষ |
| 5 | ট্রিপ সার্চ, সিট ম্যাপ, ২ মিনিটের সিট হোল্ড | ✅ শেষ |
| 6 | বুকিং, টিকিট, কাউন্টার ক্যাশ, SSLCommerz স্যান্ডবক্স | ✅ শেষ |
| 7 | বাতিল, রিফান্ড ট্র্যাকিং, ইমেইল/SMS mock, ড্রাইভার কনসোল | ✅ শেষ |
| 8 | বিক্রয় রিপোর্ট, CSV এক্সপোর্ট, ড্রাইভার ম্যাপ, বাংলা কভারেজ | ✅ শেষ |
| 9 | Atlas + Render + Vercel ডিপ্লয়মেন্টের কনফিগ ও যাচাই স্ক্রিপ্ট | ✅ প্রস্তুত, শুধু আপনার অ্যাকাউন্টে চালাতে হবে |

**আর নতুন কোনো কোডিং phase নেই।** বাকি কাজ শুধু আপনার নিজের অ্যাকাউন্টে ডিপ্লয় করা।

---

## 2. ল্যাপটপে যা যা লাগবে

1. **Node.js 20 বা তার বেশি** (22 LTS সবচেয়ে ভালো) — https://nodejs.org
   ইনস্টল করে টার্মিনালে চেক করুন:

   ```bash
   node -v
   npm -v
   ```

2. **Git** (ঐচ্ছিক, কোড রাখতে) — https://git-scm.com
3. একটি **MongoDB Atlas** অ্যাকাউন্ট (ফ্রি) — https://cloud.mongodb.com
4. একটি **Render** অ্যাকাউন্ট — https://render.com
5. একটি **Vercel** অ্যাকাউন্ট — https://vercel.com
6. কোড এডিটর (VS Code) — https://code.visualstudio.com

---

## 3. প্রজেক্ট নামিয়ে খুলুন

1. `busbook-complete.zip` ফাইলটি ডাউনলোড করুন।
2. একটি ফোল্ডারে extract করুন, যেমন `Documents/busbook`।
3. টার্মিনাল/Command Prompt খুলে সেই ফোল্ডারে যান:

   ```bash
   cd path/to/busbook
   ```

4. ফোল্ডারে এই জিনিসগুলো দেখা উচিত: `client/`, `server/`, `docs/`, `render.yaml`,
   `README.md`, `START-HERE.md`।

> `node_modules` জিপে নেই — এটা স্বাভাবিক। নিচের ধাপে `npm ci` দিয়ে ইনস্টল হবে।

---

## 4. MongoDB Atlas তৈরি করুন

1. https://cloud.mongodb.com এ লগইন করে **Create** → **M0 Free** cluster বানান
   (region: Singapore বা আপনার কাছের)।
2. **Database Access** → **Add New Database User**
   - username: যেমন `busbook_user`
   - password: শক্ত পাসওয়ার্ড (মনে রাখুন)
3. **Network Access** → **Add IP Address**
   - ল্যাপটপ থেকে চালানোর জন্য আপনার বর্তমান IP, অথবা সহজ পথে `0.0.0.0/0`
   - Render থেকে connect করতে পরে `0.0.0.0/0` লাগবে।
4. **Connect** → **Drivers** → **Node.js** → connection string কপি করুন।
5. স্ট্রিংয়ের মাঝে ডেটাবেসের নাম যোগ করুন:

   ```
   mongodb+srv://busbook_user:PASSWORD@cluster0.xxxxx.mongodb.net/busbook?retryWrites=true&w=majority
   ```

   `PASSWORD`-এর জায়গায় আসল পাসওয়ার্ড দিন। এই স্ট্রিং **কোথাও পাবলিকভাবে শেয়ার করবেন না**।

---

## 5. Backend চালু করুন

### ৫.১ env ফাইল তৈরি

`server/.env.example` কপি করে `server/.env` বানান:

```bash
cd server
cp .env.example .env
```

(Windows PowerShell-এ: `Copy-Item .env.example .env`)

তারপর `server/.env` খুলে কমপক্ষে এগুলো পূরণ করুন:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://.../busbook?retryWrites=true&w=majority
CLIENT_URL=http://localhost:3000
JWT_SECRET=এখানে-অন্তত-৩২-অক্ষরের-এলোমেলো-স্ট্রিং
JWT_EXPIRES_IN=7d

ADMIN_NAME=Your Name
ADMIN_EMAIL=you@example.com
ADMIN_PHONE=01712345678
ADMIN_PASSWORD=একটি-শক্ত-পাসওয়ার্ড

SEED_DEMO_DATA=true
```

`JWT_SECRET` বানানোর সহজ উপায়:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> লোকাল টেস্টে `SEED_DEMO_DATA=true` রাখলে ডেমো বাস/রুট/ট্রিপ ও ডেমো লগইন তৈরি হবে।
> প্রোডাকশনে এটি অবশ্যই `false` হবে।

### ৫.২ ইনস্টল ও seed

```bash
cd server
npm ci
npm run seed
```

সফল হলে শেষে `Seed finished successfully` দেখবেন।

### ৫.৩ চালু করুন

```bash
npm run dev
```

এই টার্মিনাল খোলা রাখুন। চেক করুন: http://localhost:5000/api/health
`database.connected: true` দেখলে ডেটাবেস ঠিক আছে।

---

## 6. Frontend চালু করুন (নতুন টার্মিনাল)

```bash
cd client
npm ci
npm run dev
```

ব্রাউজারে খুলুন: **http://localhost:3000**

লোকালি `VITE_API_BASE_URL` খালি থাকবে — Vite নিজেই `/api` কে 5000 পোর্টে পাঠায়।

### ডেমো লগইন (SEED_DEMO_DATA=true হলে)

| রোল | ইমেইল | পাসওয়ার্ড |
|---|---|---|
| অ্যাডমিন | আপনার `ADMIN_EMAIL` | আপনার `ADMIN_PASSWORD` |
| কাউন্টার | `counter@busbook.local` | `Counter@12345` |
| ড্রাইভার | `driver@busbook.local` | `Driver@12345` |

> এই ডেমো পাসওয়ার্ড শুধু লোকাল টেস্টের জন্য। প্রোডাকশনে ডেমো ডেটা seed করবেন না।

---

## 7. চালু হয়েছে কি না বুঝবেন কীভাবে

1. হোম পেজে ট্রিপ সার্চ করুন (ঢাকা → চট্টগ্রাম)।
2. একটি ট্রিপে সিট সিলেক্ট করে hold করুন (২ মিনিট)।
3. বুকিং সম্পন্ন করে টিকিট দেখুন।
4. কাউন্টার লগইন করে ক্যাশে টিকিট বিক্রি করুন।
5. অ্যাডমিনে `/admin/reports` ও `/admin/cancellations` দেখুন।
6. ড্রাইভার লগইনে `/driver` গিয়ে ট্রিপ শুরু করে ম্যানুয়াল লোকেশন দিন।

---

## 8. Vercel + Render-এ deploy (ধাপে ধাপে)

### ৮.১ কোড GitHub-এ তুলুন

Vercel ও Render দুটোই GitHub রিপো থেকে কোড নেয়।

```bash
cd path/to/busbook
git init
git add .
git commit -m "BusBook complete"
```

GitHub-এ নতুন repository বানিয়ে push করুন (GitHub দেখানো কমান্ড ব্যবহার করুন)।
`.env` ফাইল যেন push না হয় — প্রজেক্টের `.gitignore` এটা আগেই বাদ দেয়।

### ৮.২ প্রথমে backend → Render

1. Render → **New +** → **Blueprint** → আপনার GitHub repo সিলেক্ট করুন।
2. Render `render.yaml` পড়ে সার্ভিস বানাবে। জিজ্ঞাসা করলে দিন:
   - `MONGODB_URI` = Atlas connection string
   - `CLIENT_URL` = আপাতত `https://example.vercel.app` (পরে আসল URL বসাবেন)
   - `API_PUBLIC_URL` = Render যে URL দেবে, যেমন `https://busbook-api.onrender.com`
3. Deploy শেষ হলে খুলুন: `https://<your-api>.onrender.com/api/health`
   - HTTP 200
   - `environment: "production"`
   - `database.connected: true`
4. ফ্রি প্ল্যানে প্রথম রিকোয়েস্টে ৩০–৬০ সেকেন্ড লাগতে পারে।

### ৮.৩ প্রোডাকশন ডেটাবেসে অ্যাডমিন বানান (ল্যাপটপ থেকে)

Render-এ demo seed করবেন না। নিজের ল্যাপটপ থেকে Atlas-এ seed করুন:

```bash
cd server
MONGODB_URI="mongodb+srv://.../busbook?retryWrites=true&w=majority" \
ADMIN_NAME="Your Name" \
ADMIN_EMAIL="you@example.com" \
ADMIN_PHONE="01712345678" \
ADMIN_PASSWORD="শক্ত-পাসওয়ার্ড" \
SEED_DEMO_DATA=false \
npm run seed
```

Windows PowerShell-এ env আলাদা লাইনে সেট করতে হবে, অথবা `server/.env`-এ
`SEED_DEMO_DATA=false` দিয়ে `npm run seed` চালান।

### ৮.৪ এরপর frontend → Vercel

1. Vercel → **Add New** → **Project** → একই GitHub repo।
2. **Root Directory** = `client` (খুব গুরুত্বপূর্ণ)।
3. Environment Variable যোগ করুন:
   - Name: `VITE_API_BASE_URL`
   - Value: `https://<your-api>.onrender.com/api`
4. Deploy করুন।
5. Vercel যে URL দেবে (যেমন `https://busbook.vercel.app`), সেটি কপি করুন।

### ৮.৫ CORS ঠিক করুন

Render → আপনার service → **Environment** → `CLIENT_URL`-এ আসল Vercel URL বসান
(কমা দিয়ে একাধিক দেওয়া যায়, শেষে `/` নয়):

```
https://your-app.vercel.app
```

তারপর Render-এ **Manual Deploy → Deploy latest commit** করুন।
এটা না করলে লগইন/API কলে CORS এরর আসবে।

### ৮.৬ যাচাই

ল্যাপটপে প্রজেক্ট ফোল্ডার থেকে:

```bash
PROD_API_URL=https://<your-api>.onrender.com \
PROD_CLIENT_URL=https://your-app.vercel.app \
node scripts/verify-deployment.mjs
```

সব ঠিক থাকলে শেষে `All checks passed.` দেখবেন।

তারপর ব্রাউজারে Vercel সাইট খুলে লগইন, সার্চ, বুকিং, অ্যাডমিন ও ড্রাইভার—কয়েকটি ফ্লো নিজে দেখুন।

---

## 9. যা এখনো করা হয়নি (সৎ তালিকা)

- আসল email/SMS পাঠানো যাচাই হয়নি — Resend ও SSL Wireless credentials লাগবে। ক্রেডেনশিয়াল
  না দিলে সব notification `skipped` (mock) থাকে।
- SSLCommerz আসল sandbox/live পেমেন্ট যাচাই হয়নি — credentials নেই। না থাকলে শুধু
  pay-at-counter অপশন কাজ করে।
- GPS নেই — ড্রাইভার নিজে লোকেশন লিখে জানায়।
- সার্ভারের error/validation বার্তা ইংরেজিতে।
- ৫,০০০ বুকিং-এর বেশি CSV একবারে export হয় না।
- Render ফ্রি প্ল্যান নিষ্ক্রিয় হলে সাইট ধীরে খোলে।

---

## 10. সমস্যা হলে

| সমস্যা | সমাধান |
|---|---|
| `Cannot find module` | `npm ci` চালাননি বা ভুল ফোল্ডারে আছেন |
| `MongooseServerSelectionError` | Atlas password ভুল, DB name নেই, বা IP allowed নয় |
| `Port 5000 already in use` | অন্য সার্ভার বন্ধ করুন, বা `.env`-এ `PORT` বদলান |
| Frontend-এ "Cannot reach the API" | `server` চলছে না, বা `VITE_API_BASE_URL` ভুল |
| লগইনের পর সেশন থাকে না | Render-এ `CLIENT_URL` ঠিক Vercel origin নয় |
| CORS এরর | `CLIENT_URL` আপডেট করে Render redeploy করুন |
| Vercel build fail: `VITE_API_BASE_URL is required` | Vercel env variable যোগ করে redeploy করুন |
| ডিপ লিংকে 404 | Vercel Root Directory `client` কি না দেখুন |

কোনো এরর এলে **পাসওয়ার্ড/connection string ছাড়া** শুধু এররের লেখাটা পাঠাবেন।

---

## 11. দরকারি কমান্ড একসাথে

```bash
# backend
cd server && npm ci && npm run seed && npm run dev

# frontend (আলাদা টার্মিনাল)
cd client && npm ci && npm run dev

# tests
cd server && npx vitest run --maxWorkers=1
cd client && npx vitest run
cd client && npm run build

# production verify
PROD_API_URL=... PROD_CLIENT_URL=... node scripts/verify-deployment.mjs
```

আরও বিস্তারিত: `README.md`, `docs/PHASE-9.md`।
