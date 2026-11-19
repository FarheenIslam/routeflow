#!/usr/bin/env node
/**
 * Post-deployment smoke checks.
 *
 * Usage:
 *   PROD_API_URL=https://busbook-api.onrender.com \
 *   PROD_CLIENT_URL=https://busbook.vercel.app \
 *   node scripts/verify-deployment.mjs
 *
 * It only makes public GET/OPTIONS requests. It never logs in, never prints a
 * secret, and never writes data. Exit code 1 means at least one check failed.
 */

const apiUrl = (process.env.PROD_API_URL || '').replace(/\/$/, '');
const clientUrl = (process.env.PROD_CLIENT_URL || '').replace(/\/$/, '');

if (!apiUrl || !clientUrl) {
  console.error('Set PROD_API_URL and PROD_CLIENT_URL first.');
  process.exit(1);
}

let failures = 0;

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function get(url, options = {}) {
  try {
    const response = await fetch(url, { redirect: 'follow', ...options });
    return { response, text: await response.text() };
  } catch (error) {
    return { response: null, error };
  }
}

console.log(`API:    ${apiUrl}`);
console.log(`Client: ${clientUrl}\n`);

// 1. API health and database state
const health = await get(`${apiUrl}/api/health`);
if (!health.response) {
  check('API is reachable', false, health.error?.message);
} else {
  const body = (() => {
    try {
      return JSON.parse(health.text);
    } catch {
      return {};
    }
  })();
  check('API /health responds 200', health.response.status === 200, `status ${health.response.status}`);
  check('API reports production', body.data?.environment === 'production', body.data?.environment);
  check('Database is connected', body.data?.database?.connected === true, body.data?.database?.status);
  check('Server header is hidden', !health.response.headers.get('x-powered-by'));
  check(
    'API sets nosniff',
    health.response.headers.get('x-content-type-options') === 'nosniff',
  );
}

// 2. Public route works without a session
const settings = await get(`${apiUrl}/api/public/settings`);
check('Public settings responds 200', settings.response?.status === 200, `status ${settings.response?.status}`);

// 3. CORS: the deployed frontend is allowed, with credentials
const allowed = await get(`${apiUrl}/api/health`, {
  method: 'OPTIONS',
  headers: {
    Origin: clientUrl,
    'Access-Control-Request-Method': 'GET',
  },
});
check(
  'CORS allows the deployed client origin',
  allowed.response?.headers.get('access-control-allow-origin') === clientUrl,
  allowed.response?.headers.get('access-control-allow-origin') ?? 'no header',
);
check(
  'CORS allows credentials',
  allowed.response?.headers.get('access-control-allow-credentials') === 'true',
);
check(
  'CORS preflight is not a server error',
  allowed.response && allowed.response.status < 500,
  `status ${allowed.response?.status}`,
);

// 4. CORS: an unrelated origin is refused
const foreign = await get(`${apiUrl}/api/health`, {
  method: 'OPTIONS',
  headers: {
    Origin: 'https://not-this-app.example',
    'Access-Control-Request-Method': 'GET',
  },
});
const foreignAllow = foreign.response?.headers.get('access-control-allow-origin');
check('CORS refuses an unknown origin', foreignAllow !== 'https://not-this-app.example', foreignAllow ?? 'no header');

// 5. Frontend is served and is the SPA (rewrites work)
const home = await get(clientUrl);
check('Client responds 200', home.response?.status === 200, `status ${home.response?.status}`);
check('Client returns the React shell', home.text?.includes('id="root"'));
check(
  'Client sets nosniff',
  home.response?.headers.get('x-content-type-options') === 'nosniff',
);

const deepLink = await get(`${clientUrl}/booking/BB-TEST01`);
check(
  'SPA deep link returns HTML, not 404',
  deepLink.response?.status === 200 && deepLink.text?.includes('id="root"'),
  `status ${deepLink.response?.status}`,
);

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
