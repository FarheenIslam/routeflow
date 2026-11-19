import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import SystemSetting from '../models/SystemSetting.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * SSLCommerz client.
 *
 * Two rules shape this file:
 *   1. A browser redirect NEVER confirms a payment. Only the gateway's own
 *      validation API (called from our server) can do that.
 *   2. When credentials are missing we say so. We do not invent a "success"
 *      page, and we do not silently switch to a fake sandbox.
 */

const SANDBOX_BASE = 'https://sandbox.sslcommerz.com';
const LIVE_BASE = 'https://securepay.sslcommerz.com';
const TIMEOUT_MS = 15_000;

function gatewayBase() {
  return env.sslcommerz.sandbox ? SANDBOX_BASE : LIVE_BASE;
}

export function isSslcommerzConfigured() {
  return env.sslcommerz.configured;
}

/**
 * Online payment needs credentials AND the admin toggle. The toggle exists so an
 * operator can stop card payments during an incident without deleting keys.
 */
export async function isOnlinePaymentAvailable() {
  if (!env.sslcommerz.configured) return false;
  const settings = await SystemSetting.findOne({ key: 'global' })
    .select('payments')
    .lean();
  return settings?.payments?.onlineEnabled === true;
}

/** The public base URL the gateway should call back on (no trailing slash). */
export function callbackBase(req) {
  if (env.publicApiUrl) return env.publicApiUrl;
  return `${req.protocol}://${req.get('host')}`;
}

async function postForm(url, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new ApiError(
      502,
      'The payment gateway did not respond correctly. Please try again.',
    );
  }
  return response.json();
}

/**
 * Creates a hosted checkout session and returns its URL.
 * `tran_id` is our Payment document id — unique, stable, and never guessed from
 * the ticket number.
 */
export async function createPaymentSession({ payment, booking, base }) {
  if (!env.sslcommerz.configured) {
    throw new ApiError(503, 'Online payment is not configured on this server');
  }

  const amount = Number(booking.payableAmount).toFixed(2);
  const passenger = booking.passenger;
  const seatLabels = booking.seats.map((seat) => seat.seatLabel).join(', ');

  const payload = await postForm(`${gatewayBase()}/gwprocess/v4/api.php`, {
    store_id: env.sslcommerz.storeId,
    store_passwd: env.sslcommerz.storePassword,
    total_amount: amount,
    currency: 'BDT',
    tran_id: payment.providerTranId,

    success_url: `${base}/api/payments/callback/success`,
    fail_url: `${base}/api/payments/callback/fail`,
    cancel_url: `${base}/api/payments/callback/cancel`,
    ipn_url: `${base}/api/payments/ipn`,

    cus_name: passenger.name,
    cus_email: passenger.email || 'guest@busbook.local',
    cus_add1: 'Bangladesh',
    cus_city: passenger.city || 'Dhaka',
    cus_country: 'Bangladesh',
    cus_phone: passenger.phone,

    shipping_method: 'NO',
    product_name: `Bus ticket ${booking.bookingCode} (${seatLabels})`,
    product_category: 'travel',
    product_profile: 'general',
    num_of_item: String(booking.seatCount),

    // Our own reference, echoed back in the validation response.
    value_a: booking.bookingCode,
  });

  if (payload?.status !== 'SUCCESS' || !payload?.GatewayPageURL) {
    logger.warn(
      `SSLCommerz session rejected for ${booking.bookingCode}: ${payload?.failedreason || payload?.status || 'no reason'}`,
    );
    throw new ApiError(
      502,
      payload?.failedreason
        ? `Payment gateway rejected the request: ${payload.failedreason}`
        : 'The payment gateway rejected the request. Please try again.',
    );
  }

  return payload.GatewayPageURL;
}

/**
 * Server-to-server verification. This is the ONLY source of truth about whether
 * money actually moved.
 */
export async function validatePayment(valId) {
  if (!env.sslcommerz.configured) {
    throw new ApiError(503, 'Online payment is not configured on this server');
  }
  if (!valId) throw ApiError.badRequest('Missing payment validation id');

  const query = new URLSearchParams({
    val_id: String(valId),
    store_id: env.sslcommerz.storeId,
    store_passwd: env.sslcommerz.storePassword,
    format: 'json',
    v: '1',
  });

  const response = await fetch(
    `${gatewayBase()}/validator/api/validationserverAPI.php?${query.toString()}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );

  if (!response.ok) {
    throw new ApiError(502, 'Could not verify the payment with the gateway');
  }

  return response.json();
}

const SAFE_FIELDS = [
  'status',
  'tran_id',
  'val_id',
  'amount',
  'store_amount',
  'currency',
  'bank_tran_id',
  'card_type',
  'card_brand',
  'card_issuer',
  'risk_level',
  'risk_title',
  'error',
  'failedreason',
];

/**
 * Keeps the evidence, drops the sensitive parts. Card numbers and the store
 * password must never reach our database or logs.
 */
export function sanitiseValidation(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const clean = {};
  for (const field of SAFE_FIELDS) {
    if (payload[field] !== undefined) clean[field] = payload[field];
  }
  return clean;
}

export function isValidationSuccessful(payload) {
  return ['VALID', 'VALIDATED'].includes(String(payload?.status ?? '').toUpperCase());
}
