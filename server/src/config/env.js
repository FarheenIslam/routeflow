import dotenv from 'dotenv';

dotenv.config();

/**
 * Every secret this API needs is read HERE and nowhere else.
 * Controllers and services import `env` instead of touching process.env, so the
 * variable list is documented in exactly one place and nothing leaks into
 * responses or logs.
 */

const PLACEHOLDER_PATTERNS = [/^$/, /^<.*>$/, /YOUR_|CHANGE_ME|PLACEHOLDER/i];

function text(key, fallback = '') {
  const value = process.env[key];
  return (value === undefined ? fallback : String(value)).trim();
}

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function csv(value) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

const mongoUri = text('MONGODB_URI');
const nodeEnv = text('NODE_ENV', 'development');

export const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',

  port: Number(text('PORT', '5000')),
  serviceName: 'bus-booking-api',
  version: '0.2.0',

  mongoUri,
  /** true only when a real connection string is present. */
  mongoConfigured:
    !isPlaceholder(mongoUri) && /^mongodb(\+srv)?:\/\//.test(mongoUri),

  /** One or many allowed browser origins, comma separated. */
  clientUrls: csv(text('CLIENT_URL', 'http://localhost:3000')),
  clientUrl: csv(text('CLIENT_URL', 'http://localhost:3000'))[0],

  jwtSecret: text('JWT_SECRET'),
  jwtExpiresIn: text('JWT_EXPIRES_IN', '7d'),

  /**
   * Public HTTPS address of THIS API, used to build gateway callback URLs.
   * SSLCommerz calls back from its own servers, so "localhost" cannot work here.
   * Empty means "derive from the incoming request", which is fine locally and
   * wrong behind a tunnel unless you also set CLIENT_URL to the tunnel origin.
   */
  publicApiUrl: text('API_PUBLIC_URL').replace(/\/$/, ''),

  /**
   * SSLCommerz sandbox credentials (store id + password from the sandbox panel).
   * When either is missing, online card/bKash payment is simply unavailable and
   * the UI offers the pay-at-counter reservation instead. Nothing is faked.
   */
  sslcommerz: {
    storeId: text('SSLCOMMERZ_STORE_ID'),
    storePassword: text('SSLCOMMERZ_STORE_PASSWORD'),
    /** Sandbox is the default: never point a test key at the live gateway. */
    sandbox: text('SSLCOMMERZ_SANDBOX', 'true').toLowerCase() !== 'false',
    get configured() {
      return Boolean(this.storeId && this.storePassword);
    },
  },

  // Transactional email (password reset, ticket, cancellation, refund).
  resendApiKey: text('RESEND_API_KEY'),
  mailFrom: text('MAIL_FROM', 'BusBook <onboarding@resend.dev>'),

  /**
   * SSL Wireless SMS. Empty credentials mean SMS stays in honest mock mode:
   * Notification rows are written as `skipped`, never as delivered.
   */
  sslwireless: {
    apiToken: text('SSL_WIRELESS_API_TOKEN'),
    sid: text('SSL_WIRELESS_SID'),
    url: text('SSL_WIRELESS_API_URL', 'https://smsplus.sslwireless.com/api/v3/send-sms'),
    get configured() {
      return Boolean(this.apiToken && this.sid);
    },
  },

  /** `npm run seed` adds a small demo fleet unless this is "false". */
  seedDemoData: text('SEED_DEMO_DATA', 'true').toLowerCase() !== 'false',

  // Used by `npm run seed` only — never by request handlers.
  admin: {
    name: text('ADMIN_NAME', 'System Admin'),
    email: text('ADMIN_EMAIL'),
    phone: text('ADMIN_PHONE'),
    password: text('ADMIN_PASSWORD'),
  },
});

/**
 * Prints a readable summary at boot. Secrets are never printed — only whether
 * they look configured, which is what a beginner actually needs to debug.
 */
export function describeConfig() {
  const ok = (value) => (isPlaceholder(value) ? 'missing' : 'set');
  return [
    `NODE_ENV=${env.nodeEnv}`,
    `PORT=${env.port}`,
    `MONGODB_URI=${env.mongoConfigured ? 'set' : 'missing'}`,
    `CLIENT_URL=${env.clientUrls.join(', ') || 'missing'}`,
    `JWT_SECRET=${ok(env.jwtSecret)}`,
    `SSLCOMMERZ=${env.sslcommerz.configured ? (env.sslcommerz.sandbox ? 'sandbox' : 'live') : 'missing'}`,
    `SMS=${env.sslwireless.configured ? 'configured' : 'mock'}`,
  ].join(' | ');
}

/**
 * Refuses to boot production with unsafe configuration.
 * Called from server.js before the database connection, so a deployment with a
 * missing JWT secret fails loudly instead of quietly signing tokens with
 * "undefined" — which would let anyone forge a session.
 */
export function assertRuntimeConfig() {
  if (!env.isProduction) return;

  const problems = [];
  if (!env.jwtSecret || env.jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be set and at least 32 characters long');
  }
  if (!env.mongoConfigured) {
    problems.push('MONGODB_URI must point to your MongoDB Atlas cluster');
  }
  if (env.clientUrls.length === 0) {
    problems.push('CLIENT_URL must list your frontend origin');
  }
  if (env.clientUrls.some((url) => url.startsWith('http://'))) {
    problems.push('CLIENT_URL must use https:// in production');
  }
  if (
    env.sslcommerz.configured &&
    (!env.publicApiUrl || !env.publicApiUrl.startsWith('https://'))
  ) {
    problems.push(
      'API_PUBLIC_URL must be the public https:// API origin when SSLCommerz is configured (the gateway calls it back)',
    );
  }

  if (problems.length > 0) {
    console.error('[FATAL] Unsafe production configuration:');
    problems.forEach((problem) => console.error(`  - ${problem}`));
    process.exit(1);
  }
}
