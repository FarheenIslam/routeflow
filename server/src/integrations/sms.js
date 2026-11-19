import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * SMS adapter (SSL Wireless v3).
 *
 * With no credentials the message is NOT sent. The caller records a skipped
 * notification row instead of claiming delivery. If credentials are present the
 * request is attempted once, and a failure is reported as a failure.
 */
export async function sendSms({ to, text }) {
  if (!env.sslwireless.configured) {
    logger.warn(`[MOCK SMS] not sent to ${to} — ${text.slice(0, 80)}`);
    return { delivered: false, mode: 'mock' };
  }

  // SSL Wireless expects the international form without the leading 0.
  const msisdn = String(to).replace(/\D/g, '').replace(/^0/, '880');

  try {
    const response = await fetch(env.sslwireless.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.sslwireless.apiToken}`,
      },
      body: JSON.stringify({
        api_token: env.sslwireless.apiToken,
        sid: env.sslwireless.sid,
        msisdn,
        sms: text,
        csms_id: crypto.randomBytes(8).toString('hex'),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok || String(body.status) !== 'SUCCESS') {
      logger.error(
        `SSL Wireless rejected an SMS (${response.status}): ${JSON.stringify(body).slice(0, 250)}`,
      );
      return { delivered: false, mode: 'error' };
    }

    return { delivered: true, mode: 'sslwireless', id: body.smsinfo?.reference_id ?? null };
  } catch (error) {
    logger.error('SSL Wireless request failed:', error.message);
    return { delivered: false, mode: 'error' };
  }
}
