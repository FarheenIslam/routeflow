import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import FormField from '../../components/ui/FormField.jsx';
import SelectField from '../../components/ui/SelectField.jsx';
import PageHeader from '../../components/admin/PageHeader.jsx';
import ConfirmDialog from '../../components/admin/ConfirmDialog.jsx';
import { adminApi } from '../../services/admin.api.js';
import { toast } from '../../store/toastStore.js';
import { formatDateTime } from '../../utils/format.js';
import { formatMoney } from '../../utils/datetime.js';
import { errorMessage } from '../../utils/formErrors.js';

const REFUND_TONES = {
  pending: 'warning',
  approved: 'brand',
  processed: 'success',
  rejected: 'danger',
};

/**
 * Admin cancellation & refund desk.
 *
 * A refund is approved, then marked processed once the money has actually been
 * returned outside the system. Nothing here calls a gateway refund API, and the
 * page says so rather than implying an automatic refund.
 */
export default function CancellationsPage() {
  const { t, i18n } = useTranslation(['admin', 'common']);

  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [rejectTarget, setRejectTarget] = useState(null);
  const [processTarget, setProcessTarget] = useState(null);
  const [processForm, setProcessForm] = useState({
    refundMethod: 'cash',
    refundTranId: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminApi.cancellations.list({
        page,
        limit: 10,
        ...(filter ? { refundStatus: filter } : {}),
      });
      setItems(response.data.items);
      setCounts(response.data.counts);
      setPagination(response.data.pagination);
      setError(null);
    } catch (loadError) {
      setError(loadError);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(id, body) {
    setBusy(true);
    try {
      await adminApi.cancellations.reviewRefund(id, body);
      toast.success(t('cancellations.refundUpdated'));
      setRejectTarget(null);
      setProcessTarget(null);
      await load();
    } catch (reviewError) {
      toast.error(errorMessage(reviewError, t('common:errors.generic')));
    } finally {
      setBusy(false);
    }
  }

  function openProcess(item) {
    setProcessTarget(item);
    setProcessForm({
      refundMethod: item.bookingId?.paymentStatus === 'paid' ? 'cash' : 'cash',
      refundTranId: '',
      notes: '',
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('cancellations.title')}
        subtitle={t('cancellations.subtitle')}
        actions={
          <SelectField
            id="refundFilter"
            label={t('cancellations.filterLabel')}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('filters.all')}</option>
            <option value="pending">{t('cancellations.refundStatus.pending')}</option>
            <option value="approved">{t('cancellations.refundStatus.approved')}</option>
            <option value="processed">{t('cancellations.refundStatus.processed')}</option>
            <option value="rejected">{t('cancellations.refundStatus.rejected')}</option>
          </SelectField>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {['pending', 'approved', 'processed', 'rejected'].map((status) => (
          <Card key={status} className="p-4">
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              {t(`cancellations.refundStatus.${status}`)}
            </p>
            <p className="mt-1 text-2xl font-semibold">{counts[status] ?? 0}</p>
          </Card>
        ))}
      </div>

      <Alert tone="info">{t('cancellations.manualRefundNote')}</Alert>

      {error && (
        <Alert tone="error" title={t('common:errors.generic')}>
          {error.message}
        </Alert>
      )}

      {loading ? (
        <p className="text-sm text-ink-muted">{t('common:common.loading')}</p>
      ) : items.length === 0 ? (
        <Card className="p-6 text-sm text-ink-muted">{t('cancellations.empty')}</Card>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const booking = item.bookingId ?? {};
            const canApprove = item.refundStatus === 'pending';
            const canReject = ['pending', 'approved'].includes(item.refundStatus);
            const canProcess = item.refundStatus === 'approved';

            return (
              <li key={item.cancellationId}>
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" dir="ltr">
                        {item.bookingCode}
                      </p>
                      <p className="mt-0.5 text-sm">
                        {booking.passenger?.name ?? item.passenger?.name ?? '—'} ·{' '}
                        <span dir="ltr">{booking.passenger?.phone}</span>
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {t('cancellations.cancelledBy', {
                          name: item.cancelledByUserId?.name ?? t('cancellations.guest'),
                          role: item.cancelledByRole ?? '—',
                        })}{' '}
                        · {formatDateTime(item.createdAt, i18n.language)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge tone={REFUND_TONES[item.refundStatus] ?? 'neutral'}>
                        {t(`cancellations.refundStatus.${item.refundStatus}`)}
                      </Badge>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(item.refundAmount, i18n.language)}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {item.policyApplied?.refundPercent ?? 0}% ·{' '}
                        {t(`cancellations.rule.${item.policyApplied?.ruleLabel ?? 'no_refund'}`, {
                          defaultValue: item.policyApplied?.ruleLabel ?? '—',
                        })}
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm">
                    {item.reason}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-ink-muted">
                      {t('cancellations.paidAmount', {
                        amount: formatMoney(booking.payableAmount ?? 0, i18n.language),
                        status: booking.paymentStatus ?? '—',
                      })}
                      {item.refundTranId ? ` · ${item.refundTranId}` : ''}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {canApprove && (
                        <Button
                          size="sm"
                          onClick={() => review(item.cancellationId, { action: 'approve' })}
                          disabled={busy}
                        >
                          {t('cancellations.actions.approve')}
                        </Button>
                      )}
                      {canReject && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setRejectTarget(item)}
                          disabled={busy}
                        >
                          {t('cancellations.actions.reject')}
                        </Button>
                      )}
                      {canProcess && (
                        <Button
                          size="sm"
                          onClick={() =>
                            processTarget?.cancellationId === item.cancellationId
                              ? setProcessTarget(null)
                              : openProcess(item)
                          }
                          disabled={busy}
                        >
                          {t('cancellations.actions.process')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {processTarget?.cancellationId === item.cancellationId && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        review(item.cancellationId, {
                          action: 'process',
                          refundMethod: processForm.refundMethod,
                          refundTranId: processForm.refundTranId || undefined,
                          notes: processForm.notes || undefined,
                        });
                      }}
                      className="mt-4 grid gap-3 rounded-lg border border-line bg-canvas/60 p-3 sm:grid-cols-2"
                    >
                      <SelectField
                        id={`method-${item.cancellationId}`}
                        label={t('cancellations.fields.method')}
                        value={processForm.refundMethod}
                        onChange={(event) =>
                          setProcessForm({ ...processForm, refundMethod: event.target.value })
                        }
                      >
                        <option value="cash">{t('cancellations.method.cash')}</option>
                        <option value="sslcommerz">{t('cancellations.method.sslcommerz')}</option>
                        <option value="bank">{t('cancellations.method.bank')}</option>
                        <option value="other">{t('cancellations.method.other')}</option>
                      </SelectField>
                      <FormField
                        id={`tran-${item.cancellationId}`}
                        label={t('cancellations.fields.reference')}
                        hint={t('cancellations.fields.referenceHint')}
                        value={processForm.refundTranId}
                        onChange={(event) =>
                          setProcessForm({ ...processForm, refundTranId: event.target.value })
                        }
                        maxLength={120}
                      />
                      <FormField
                        id={`notes-${item.cancellationId}`}
                        label={t('cancellations.fields.notes')}
                        value={processForm.notes}
                        onChange={(event) =>
                          setProcessForm({ ...processForm, notes: event.target.value })
                        }
                        maxLength={300}
                        className="sm:col-span-2"
                      />
                      <div className="sm:col-span-2">
                        <Button type="submit" size="sm" disabled={busy}>
                          {busy
                            ? t('cancellations.actions.saving')
                            : t('cancellations.actions.confirmProcess')}
                        </Button>
                      </div>
                    </form>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-muted">
            {t('pagination.pageOf', {
              page: pagination.page,
              totalPages: pagination.totalPages,
            })}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={pagination.page <= 1}
            >
              {t('pagination.previous')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setPage((current) => Math.min(pagination.totalPages, current + 1))
              }
              disabled={pagination.page >= pagination.totalPages}
            >
              {t('pagination.next')}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(rejectTarget)}
        title={t('cancellations.rejectTitle')}
        message={t('cancellations.rejectBody', { code: rejectTarget?.bookingCode ?? '' })}
        confirmLabel={t('cancellations.actions.reject')}
        busy={busy}
        onCancel={() => setRejectTarget(null)}
        onConfirm={() =>
          rejectTarget &&
          review(rejectTarget.cancellationId, { action: 'reject', notes: 'Rejected by admin' })
        }
      />
    </div>
  );
}
