import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import FormField from '../../components/ui/FormField.jsx';
import PageHeader from '../../components/admin/PageHeader.jsx';
import { adminApi } from '../../services/admin.api.js';
import { toast } from '../../store/toastStore.js';
import { formatDate, formatMoney } from '../../utils/datetime.js';
import { toDateInputValue } from '../../utils/datetime.js';
import { errorMessage } from '../../utils/formErrors.js';

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateInputValue(date);
}

/**
 * Sales report.
 *
 * Every number comes from /admin/reports/summary, which aggregates stored
 * bookings, cancellations and refunds. Refunds subtract only when marked
 * processed; pending requests are shown beside them, not treated as money back.
 */
export default function ReportsPage() {
  const { t, i18n } = useTranslation('admin');
  const language = i18n.language;

  const [filters, setFilters] = useState({ from: daysAgo(29), to: toDateInputValue(new Date()) });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (range) => {
    setLoading(true);
    try {
      const response = await adminApi.reports.summary(range);
      setReport(response.data);
      setError(null);
    } catch (loadError) {
      setError(loadError);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(filters);
    // Only the initial range is loaded here; the form submits later ranges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function exportCsv() {
    setExporting(true);
    try {
      const blob = await adminApi.reports.bookingsCsv(filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `busbook-bookings-${filters.from}-to-${filters.to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(t('reports.exported'));
    } catch (exportError) {
      toast.error(errorMessage(exportError, t('common:errors.generic')));
    } finally {
      setExporting(false);
    }
  }

  const summary = report?.summary;
  const maxDaily = Math.max(1, ...(report?.daily ?? []).map((row) => row.collected));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          <Button onClick={exportCsv} disabled={exporting || loading}>
            {exporting ? t('reports.exporting') : t('reports.export')}
          </Button>
        }
      />

      <Card className="p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            load(filters);
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <FormField
            id="reportFrom"
            type="date"
            label={t('reports.from')}
            value={filters.from}
            max={filters.to}
            onChange={(event) => setFilters({ ...filters, from: event.target.value })}
          />
          <FormField
            id="reportTo"
            type="date"
            label={t('reports.to')}
            value={filters.to}
            min={filters.from}
            onChange={(event) => setFilters({ ...filters, to: event.target.value })}
          />
          <Button type="submit" variant="secondary" disabled={loading}>
            {loading ? t('reports.loading') : t('reports.show')}
          </Button>
        </form>
      </Card>

      {error && (
        <Alert tone="error" title={t('reports.loadFailed')}>
          {error.message}
        </Alert>
      )}

      {loading && !report ? (
        <p className="text-sm text-ink-muted">{t('reports.loading')}</p>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['collected', summary.collected, 'success'],
              ['net', summary.net, 'brand'],
              ['refunded', summary.refunded, 'warning'],
              ['refundsPending', summary.refundsPendingAmount, 'warning'],
              ['tickets', summary.activeTickets, 'neutral'],
              ['passengers', summary.passengers, 'neutral'],
              ['cancelled', summary.cancelled, 'danger'],
              ['outstanding', summary.outstanding, 'warning'],
            ].map(([key, value, tone]) => (
              <Card key={key} className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  {t(`reports.cards.${key}`)}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {['collected', 'net', 'refunded', 'refundsPending', 'outstanding'].includes(key)
                    ? formatMoney(value, language)
                    : value}
                </p>
                <Badge tone={tone} className="mt-2">
                  {t(`reports.cardHint.${key}`)}
                </Badge>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-base font-semibold">{t('reports.dailyTitle')}</h2>
              <p className="mt-1 text-xs text-ink-muted">{t('reports.dailyHint')}</p>
              {report.daily.length === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">{t('reports.empty')}</p>
              ) : (
                <ul className="mt-4 space-y-2.5">
                  {report.daily.map((row) => (
                    <li key={row.date}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span>{formatDate(row.date, language)}</span>
                        <span className="tabular-nums">
                          {formatMoney(row.collected, language)} · {row.seats}{' '}
                          {t('reports.seats')}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-canvas">
                        <div
                          className="h-1.5 rounded-full bg-brand-500"
                          style={{ width: `${Math.max(2, (row.collected / maxDaily) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-base font-semibold">{t('reports.routesTitle')}</h2>
              {report.routes.length === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">{t('reports.empty')}</p>
              ) : (
                <ul className="mt-3 divide-y divide-line border-t border-line">
                  {report.routes.map((row) => (
                    <li key={row.routeId ?? row.route} className="py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{row.route}</span>
                        <span className="text-sm tabular-nums">
                          {formatMoney(row.collected, language)}
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted">
                        {t('reports.routeLine', { bookings: row.bookings, seats: row.seats })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-base font-semibold">{t('reports.countersTitle')}</h2>
              {report.counters.length === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">{t('reports.empty')}</p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="pb-2 font-medium">{t('reports.counter')}</th>
                      <th className="pb-2 text-right font-medium">{t('reports.bookings')}</th>
                      <th className="pb-2 text-right font-medium">{t('reports.collected')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.counters.map((row) => (
                      <tr key={row.counterId ?? row.counter} className="border-b border-line/60">
                        <td className="py-2">
                          {row.counter}
                          {row.code ? ` (${row.code})` : ''}
                        </td>
                        <td className="py-2 text-right tabular-nums">{row.bookings}</td>
                        <td className="py-2 text-right tabular-nums">
                          {formatMoney(row.collected, language)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-base font-semibold">{t('reports.mixTitle')}</h2>
              <p className="mt-1 text-xs text-ink-muted">{t('reports.mixHint')}</p>
              {report.paymentMix.length === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">{t('reports.empty')}</p>
              ) : (
                <ul className="mt-3 divide-y divide-line border-t border-line">
                  {report.paymentMix.map((row) => (
                    <li
                      key={`${row.channel}-${row.method}`}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <span>
                        {t(`reports.channel.${row.channel}`, { defaultValue: row.channel })} ·{' '}
                        {t(`reports.method.${row.method}`, { defaultValue: row.method })}
                      </span>
                      <span className="tabular-nums">
                        {formatMoney(row.amount, language)} · {row.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="text-base font-semibold">{t('reports.refundsTitle')}</h2>
            <p className="mt-1 text-xs text-ink-muted">{t('reports.refundsHint')}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {['pending', 'approved', 'processed', 'rejected'].map((status) => (
                <div key={status} className="rounded-lg border border-line p-3">
                  <p className="text-xs text-ink-muted">
                    {t(`cancellations.refundStatus.${status}`)}
                  </p>
                  <p className="mt-1 font-semibold tabular-nums">
                    {report.refunds[status]?.count ?? 0} ·{' '}
                    {formatMoney(report.refunds[status]?.amount ?? 0, language)}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <p className="text-xs text-ink-muted">
            {t('reports.generatedAt', {
              time: new Date(report.generatedAt).toLocaleString(language === 'bn' ? 'bn-BD' : 'en-GB'),
            })}
          </p>
        </>
      ) : null}
    </div>
  );
}
