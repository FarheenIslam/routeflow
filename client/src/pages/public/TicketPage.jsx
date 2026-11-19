import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import FormField from '../../components/ui/FormField.jsx';
import FullPageLoader from '../../components/ui/FullPageLoader.jsx';
import TicketCard from '../../components/booking/TicketCard.jsx';
import { bookingApi } from '../../services/booking.api.js';
import { BD_PHONE_PATTERN } from '../../schemas/booking.schemas.js';
import { toast } from '../../store/toastStore.js';
import { formatDateTime, formatMoney } from '../../utils/datetime.js';

/**
 * The ticket page.
 *
 * It never trusts the `?payment=` query string: the banner is derived from the
 * booking stored in our database. A passenger who returns before the IPN has
 * been verified sees "we are checking", not a fake success.
 */
export default function TicketPage() {
  const { code } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, i18n } = useTranslation('booking');
  const language = i18n.language;
  const paymentParam = searchParams.get('payment');
  const phoneFromUrl = searchParams.get('phone') || '';

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState(phoneFromUrl);
  const [phoneError, setPhoneError] = useState(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState(null);

  const [preview, setPreview] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(
    async (phoneValue = '') => {
      setLoading(true);
      setPhoneError(null);
      try {
        const response = await bookingApi.getBooking(code, phoneValue || undefined);
        setBooking(response.data.booking);
        setError(null);
      } catch (loadError) {
        setBooking(null);
        setError(loadError);
      } finally {
        setLoading(false);
      }
    },
    [code],
  );

  useEffect(() => {
    load(phoneFromUrl);
  }, [load, phoneFromUrl]);

  useEffect(() => {
    if (!booking) return undefined;

    let alive = true;
    bookingApi
      .getCancellationPreview(code, phoneFromUrl || undefined)
      .then((response) => {
        if (alive) setPreview(response.data.preview);
      })
      .catch(() => {
        if (alive) setPreview(null);
      });

    return () => {
      alive = false;
    };
  }, [booking, code, phoneFromUrl]);

  async function cancelTicket(event) {
    event.preventDefault();
    setCancelling(true);
    setCancelError(null);
    try {
      const response = await bookingApi.cancelBooking(
        code,
        cancelReason,
        phoneFromUrl || undefined,
      );
      setBooking(response.data.booking);
      setCancelOpen(false);
      setCancelReason('');
      toast.success(t('ticket.cancel.done'));
    } catch (error) {
      setCancelError(error.message);
    } finally {
      setCancelling(false);
    }
  }

  function openWithPhone(event) {
    event.preventDefault();
    if (!BD_PHONE_PATTERN.test(phone.trim())) {
      setPhoneError(t('passenger.errors.phone'));
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('phone', phone.trim());
    setSearchParams(next, { replace: true });
  }

  async function payNow() {
    setPaying(true);
    setPayError(null);
    try {
      const response = await bookingApi.initiatePayment(booking.code);
      window.location.assign(response.data.gatewayPageUrl);
    } catch (paymentError) {
      setPayError(paymentError.message);
      setPaying(false);
    }
  }

  if (loading && !booking) {
    return <FullPageLoader label={t('ticket.loading')} />;
  }

  if (!booking) {
    const forbidden = error?.status === 403;
    return (
      <section className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">
            {forbidden ? t('ticket.forbiddenTitle') : t('ticket.notFoundTitle')}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {forbidden ? t('ticket.forbiddenBody') : error?.message}
          </p>

          {forbidden && (
            <form onSubmit={openWithPhone} className="mt-5 flex flex-wrap items-end gap-3">
              <FormField
                id="ticketPhone"
                type="tel"
                label={t('ticket.phoneLabel')}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                error={phoneError}
                dir="ltr"
                className="min-w-[14rem] flex-1"
              />
              <Button type="submit">{t('ticket.open')}</Button>
            </form>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/booking/lookup">
              <Button variant="secondary" size="sm">
                {t('ticket.openLookup')}
              </Button>
            </Link>
            <Link to="/">
              <Button variant="ghost" size="sm">
                {t('ticket.backHome')}
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    );
  }

  const canPay =
    booking.paymentMethod === 'sslcommerz' &&
    booking.status === 'pending' &&
    booking.amountDue > 0 &&
    (!booking.paymentDeadlineAt || new Date(booking.paymentDeadlineAt) > new Date());

  const notice = (() => {
    if (booking.paymentStatus === 'paid' && booking.status === 'confirmed') {
      return { tone: 'success', title: t('ticket.notice.paidTitle'), text: t('ticket.notice.paidBody') };
    }
    if (booking.status === 'expired') {
      return { tone: 'error', title: t('ticket.notice.expiredTitle'), text: t('ticket.notice.expiredBody') };
    }
    if (booking.status === 'cancelled') {
      return { tone: 'error', title: t('ticket.notice.cancelledTitle'), text: t('ticket.notice.cancelledBody') };
    }
    if (paymentParam === 'success') {
      return { tone: 'info', title: t('ticket.notice.verifyingTitle'), text: t('ticket.notice.verifyingBody') };
    }
    if (paymentParam === 'failed') {
      return { tone: 'error', title: t('ticket.notice.failedTitle'), text: t('ticket.notice.failedBody') };
    }
    if (paymentParam === 'cancelled') {
      return { tone: 'warning', title: t('ticket.notice.cancelledCheckoutTitle'), text: t('ticket.notice.cancelledCheckoutBody') };
    }
    if (paymentParam === 'unavailable') {
      return { tone: 'warning', title: t('ticket.notice.unavailableTitle'), text: t('ticket.notice.unavailableBody') };
    }
    if (booking.paymentMethod === 'cash' && booking.amountDue > 0) {
      return {
        tone: 'info',
        title: t('ticket.notice.cashTitle'),
        text: t('ticket.notice.cashBody', {
          total: formatMoney(booking.amountDue, language),
        }),
      };
    }
    return null;
  })();

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('ticket.title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('ticket.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => load(phoneFromUrl)}>
            {t('ticket.refresh')}
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            {t('ticket.print')}
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {notice && (
          <Alert tone={notice.tone} title={notice.title} className="no-print">
            {notice.text}
          </Alert>
        )}

        {payError && (
          <Alert tone="error" className="no-print">
            {payError}
          </Alert>
        )}

        {booking.paymentMethod === 'sslcommerz' && booking.paymentDeadlineAt && booking.amountDue > 0 && (
          <Alert tone="warning" title={t('ticket.deadlineTitle')} className="no-print">
            {t('ticket.deadlineBody', {
              time: formatDateTime(booking.paymentDeadlineAt, language),
            })}
          </Alert>
        )}

        <TicketCard booking={booking} />

        {preview && (
          <Card className="no-print p-5">
            <h2 className="text-base font-semibold">{t('ticket.cancel.title')}</h2>

            {preview.allowed ? (
              <>
                <p className="mt-1 text-sm text-ink-muted">{t('ticket.cancel.subtitle')}</p>
                <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm">
                  {!preview.paid
                    ? t('ticket.cancel.unpaid')
                    : preview.refund.refundAmount > 0
                      ? t('ticket.cancel.refundLine', {
                          amount: formatMoney(preview.refund.refundAmount, language),
                          percent: preview.refund.refundPercent,
                        })
                      : t('ticket.cancel.noRefund')}
                </p>

                {cancelError && (
                  <Alert tone="error" className="mt-3">
                    {cancelError}
                  </Alert>
                )}

                {!cancelOpen ? (
                  <Button
                    variant="danger"
                    className="mt-3"
                    onClick={() => setCancelOpen(true)}
                  >
                    {t('ticket.cancel.open')}
                  </Button>
                ) : (
                  <form onSubmit={cancelTicket} className="mt-3 space-y-3">
                    <label htmlFor="cancelReason" className="block text-sm font-medium">
                      {t('ticket.cancel.reason')}
                    </label>
                    <textarea
                      id="cancelReason"
                      value={cancelReason}
                      onChange={(event) => setCancelReason(event.target.value)}
                      rows={3}
                      minLength={3}
                      maxLength={300}
                      required
                      placeholder={t('ticket.cancel.reasonPlaceholder')}
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        variant="danger"
                        disabled={cancelling || cancelReason.trim().length < 3}
                      >
                        {cancelling ? t('ticket.cancel.cancelling') : t('ticket.cancel.confirm')}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setCancelOpen(false);
                          setCancelError(null);
                        }}
                        disabled={cancelling}
                      >
                        {t('ticket.cancel.keep')}
                      </Button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">
                {preview.reason === 'already_cancelled'
                  ? t('ticket.cancel.already')
                  : preview.reason === 'departed'
                    ? t('ticket.cancel.departed')
                    : preview.reason === 'self_cancel_disabled'
                      ? t('ticket.cancel.selfCancelOff')
                      : t('ticket.cancel.notPossible')}
              </p>
            )}

            {booking.cancellation && (
              <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm">
                {t('ticket.cancel.pendingNote', {
                  status: t(`ticket.cancel.status.${booking.cancellation.refundStatus}`),
                })}
              </p>
            )}
          </Card>
        )}

        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <Link to="/booking/lookup" className="text-sm text-brand-700 hover:underline">
            {t('ticket.openLookup')}
          </Link>

          {canPay && (
            <Button onClick={payNow} disabled={paying}>
              {paying
                ? t('ticket.paying')
                : t('ticket.payNow', { total: formatMoney(booking.amountDue, language) })}
            </Button>
          )}
        </div>

        <p className="no-print text-xs text-ink-muted">{t('ticket.printHint')}</p>
      </div>
    </section>
  );
}
