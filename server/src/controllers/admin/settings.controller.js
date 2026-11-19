import SystemSetting from '../../models/SystemSetting.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';

async function loadOrCreateSettings() {
  const existing = await SystemSetting.findOne({ key: 'global' });
  if (existing) return existing;
  return SystemSetting.create({ key: 'global' });
}

export const getSettings = asyncHandler(async (_req, res) => {
  const settings = await loadOrCreateSettings();
  res.json({ success: true, message: 'System settings', data: { settings } });
});

/**
 * Updates only the sections sent. Merging into the existing document (instead of
 * a blind $set) lets us validate cross-field rules such as
 * "full-refund window must be longer than the half-refund window".
 */
export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await loadOrCreateSettings();

  for (const [section, values] of Object.entries(req.body)) {
    if (!values || typeof values !== 'object') continue;
    if (!settings[section]) continue;
    Object.assign(settings[section], values);
  }

  const policy = settings.cancellationPolicy;
  if (policy.freeCancelHours <= policy.halfRefundHours) {
    throw new ApiError(400, 'The full-refund window must be longer than the partial-refund window', [
      { field: 'cancellationPolicy.freeCancelHours', message: 'Must be greater than the partial-refund hours' },
    ]);
  }

  settings.updatedBy = req.userId;
  await settings.save();

  res.json({ success: true, message: 'Settings saved', data: { settings } });
});
