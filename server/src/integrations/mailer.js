import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Email adapter.
 *
 * Phase 3 only needs password-reset emails. Full notification templates,
 * retries and the notification log arrive in Phase 7.
 *
 * When RESEND_API_KEY is empty we do NOT pretend to send: the call returns
 * { delivered: false, mode: 'mock' }, the caller logs it, and in development the
 * reset link is surfaced in the response so you can still finish the flow.
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!env.resendApiKey) {
    logger.warn(`[MOCK EMAIL] not sent to ${to} — subject: "${subject}"`);
    if (text && !env.isProduction) logger.info(`[MOCK EMAIL] body:\n${text}`);
    return { delivered: false, mode: 'mock' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.mailFrom,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      logger.error(`Resend rejected the email (${response.status}): ${detail.slice(0, 300)}`);
      return { delivered: false, mode: 'error' };
    }

    const body = await response.json().catch(() => ({}));
    logger.info(`Email queued with Resend (id: ${body.id ?? 'unknown'})`);
    return { delivered: true, mode: 'resend', id: body.id ?? null };
  } catch (error) {
    logger.error('Resend request failed:', error.message);
    return { delivered: false, mode: 'error' };
  }
}

/** Password reset email, in plain English and simple HTML. */
export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const subject = 'Reset your BusBook password';
  const text = [
    `Hello ${name},`,
    '',
    'We received a request to reset your BusBook password.',
    `Open this link to choose a new password (valid for 30 minutes):`,
    resetUrl,
    '',
    'If you did not request this, you can ignore this email — your password stays unchanged.',
  ].join('\n');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#10202a;line-height:1.6">
      <h2 style="margin:0 0 12px">Reset your password</h2>
      <p>Hello ${name},</p>
      <p>We received a request to reset your BusBook password.</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#0c6d66;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Choose a new password</a></p>
      <p style="color:#5b6b75;font-size:14px">This link is valid for 30 minutes. If you did not request it, ignore this email.</p>
    </div>
  `;

  return sendEmail({ to, subject, html, text });
}
