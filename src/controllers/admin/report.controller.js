import { asyncHandler } from '../../utils/asyncHandler.js';
import { getBookingsCsv, getReportSummary } from '../../services/report.service.js';

/** GET /api/admin/reports/summary — sales, refunds and performance for a date range. */
export const getReportsSummary = asyncHandler(async (req, res) => {
  const report = await getReportSummary(req.query);

  res.json({ success: true, message: 'Sales report', data: report });
});

/** GET /api/admin/reports/bookings.csv — the same range as a spreadsheet export. */
export const getReportsBookingsCsv = asyncHandler(async (req, res) => {
  const file = await getBookingsCsv(req.query);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(file.content);
});
