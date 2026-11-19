import { asyncHandler } from '../../utils/asyncHandler.js';
import { paginated, parsePagination } from '../../utils/query.js';
import {
  listCancellations,
  reviewRefund,
} from '../../services/cancellation.service.js';

/**
 * Admin cancellation & refund desk.
 *
 * The list is the whole story: what was cancelled, what is owed, and which
 * refunds are still pending. Nothing here contacts a gateway; processing a
 * refund records the reference of the transfer that a human actually made.
 */
export const getCancellations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const result = await listCancellations({
    page,
    limit,
    skip,
    refundStatus: req.validatedQuery?.refundStatus,
  });

  res.json({
    success: true,
    message: 'Cancellations',
    data: {
      ...paginated(result.items, result.total, page, limit),
      counts: result.counts,
    },
  });
});

export const patchCancellationRefund = asyncHandler(async (req, res) => {
  const refund = await reviewRefund({
    cancellationId: req.params.id,
    action: req.body.action,
    user: req.user,
    refundMethod: req.body.refundMethod ?? null,
    refundTranId: req.body.refundTranId ?? null,
    notes: req.body.notes ?? null,
  });

  res.json({ success: true, message: 'Refund updated', data: { refund } });
});
