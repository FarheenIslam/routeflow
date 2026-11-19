import { asyncHandler } from '../utils/asyncHandler.js';
import { readGuestSessionId } from '../middleware/session.js';
import {
  initiatePayment,
  handleGatewayReturn,
  clientBaseUrl,
  clientTicketUrl,
} from '../services/payment.service.js';

/**
 * POST /api/payments/initiate — returns the hosted checkout URL.
 * The browser only ever receives a URL; store credentials stay on the server.
 */
export const postInitiatePayment = asyncHandler(async (req, res) => {
  const result = await initiatePayment({
    code: req.body.bookingCode,
    req,
    user: req.user ?? null,
    sessionId: readGuestSessionId(req),
  });

  res.status(201).json({
    success: true,
    message: 'Payment session created',
    data: result,
  });
});

/** SSLCommerz posts form fields here; the query string is used in local tests. */
function gatewayPayload(req) {
  return { ...req.query, ...req.body };
}

function redirectToTicket(res, result, status, fallbackCode = null) {
  const code = result.bookingCode ?? fallbackCode;
  if (!code) {
    return res.redirect(`${clientBaseUrl()}/booking/lookup?payment=${status}`);
  }
  return res.redirect(clientTicketUrl(code, status));
}

/**
 * The browser lands here after paying (or failing). A redirect is NOT proof of
 * payment: `handleGatewayReturn` calls the validator first, and the page the
 * passenger lands on reads the booking's real status from our database.
 */
export const gatewaySuccess = asyncHandler(async (req, res) => {
  const payload = gatewayPayload(req);
  const result = await handleGatewayReturn({ outcome: 'success', payload });
  return redirectToTicket(res, result, result.ok ? 'success' : 'failed', payload.value_a);
});

export const gatewayFail = asyncHandler(async (req, res) => {
  const payload = gatewayPayload(req);
  const result = await handleGatewayReturn({ outcome: 'fail', payload });
  return redirectToTicket(res, result, 'failed', payload.value_a);
});

export const gatewayCancel = asyncHandler(async (req, res) => {
  const payload = gatewayPayload(req);
  const result = await handleGatewayReturn({ outcome: 'cancel', payload });
  return redirectToTicket(res, result, 'cancelled', payload.value_a);
});

/**
 * IPN: server-to-server. Always answer 200 once we have processed (or safely
 * ignored) the message, otherwise the gateway keeps retrying a transaction that
 * may already be settled.
 */
export const gatewayIpn = asyncHandler(async (req, res) => {
  const result = await handleGatewayReturn({ outcome: 'success', payload: gatewayPayload(req) });
  res.json({ received: true, handled: Boolean(result.ok) });
});
