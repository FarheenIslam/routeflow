import { useTranslation } from 'react-i18next';

import Badge from '../ui/Badge.jsx';
import Card from '../ui/Card.jsx';
import { formatDate, formatMoney, formatNumber, formatTime } from '../../utils/datetime.js';

const BOOKING_TONES = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'brand',
  cancelled: 'danger',
  expired: 'danger',
};

const PAYMENT_TONES = {
  paid: 'success',
  pending: 'warning',
  unpaid: 'warning',
  failed: 'danger',
  refunded: 'neutral',
  partially_refunded: 'neutral',
};

/**
 * The ticket itself.
 *
 * One component renders a ticket everywhere: right after payment, from the
 * lookup page, and at the counter. The verification code is printed only when
 * the API decided this viewer may see it — a shared screenshot never reveals a
 * code to someone who merely guessed a ticket number.
 */
export default function TicketCard({ booking, showVerification = true, className = '' }) {
  const { t, i18n } = useTranslation('booking');
  const language = i18n.language;
  const trip = booking.trip;
  const seats = booking.seats.map((seat) => seat.label).join(', ');

  return (
    <Card className={`ticket-print overflow-hidden p-0 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-brand-600 px-5 py-4 text-white">
        <div>
          <p className="text-xs uppercase tracking-widest text-brand-100">
            {t('ticket.brand')}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-wider" dir="ltr">
            {booking.code}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge tone={BOOKING_TONES[booking.status] ?? 'neutral'} className="border-white/30 bg-white/15 text-white">
            {t(`ticket.status.${booking.status}`)}
          </Badge>
          <Badge
            tone={PAYMENT_TONES[booking.paymentStatus] ?? 'neutral'}
            className="border-white/30 bg-white/15 text-white"
          >
            {t(`ticket.paymentStatus.${booking.paymentStatus}`)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t('ticket.journey')}
          </p>
          <p className="mt-1 text-lg font-semibold">
            {trip?.route?.origin?.city || trip?.route?.origin?.name || '—'}
            <span className="mx-2 text-ink-muted" aria-hidden="true">
              →
            </span>
            {trip?.route?.destination?.city || trip?.route?.destination?.name || '—'}
          </p>
          {trip?.route?.name && <p className="text-sm text-ink-muted">{trip.route.name}</p>}
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t('ticket.departure')}
          </p>
          <p className="mt-1 text-sm font-medium">
            {trip?.departureAt
              ? `${formatDate(trip.departureAt, language)} · ${formatTime(trip.departureAt, language)}`
              : '—'}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t('ticket.bus')}
          </p>
          <p className="mt-1 text-sm font-medium">
            {trip?.bus?.operatorName || '—'}
            {trip?.bus?.busNumber ? ` · ${trip.bus.busNumber}` : ''}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t('ticket.passenger')}
          </p>
          <p className="mt-1 text-sm font-medium">{booking.passenger.name}</p>
          <p className="text-sm text-ink-muted" dir="ltr">
            {booking.passenger.phone}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t('ticket.seats')}
          </p>
          <p className="mt-1 text-sm font-medium">{seats}</p>
          <p className="text-sm text-ink-muted">
            {t('ticket.seatCount', {
              count: booking.seatCount,
              seats: formatNumber(booking.seatCount, language),
            })}
          </p>
        </div>

        {showVerification && booking.verificationCode && (
          <div className="rounded-lg border border-dashed border-line bg-canvas px-3 py-2 sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              {t('ticket.verificationCode')}
            </p>
            <p className="mt-0.5 text-xl font-semibold tracking-[0.3em]" dir="ltr">
              {booking.verificationCode}
            </p>
            <p className="mt-1 text-xs text-ink-muted">{t('ticket.verificationHint')}</p>
          </div>
        )}

        <div className="sm:col-span-2">
          <dl className="space-y-1.5 border-t border-line pt-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">{t('ticket.fareLine', { fare: formatMoney(booking.farePerSeat, language) })}</dt>
              <dd className="tabular-nums">{formatMoney(booking.totalAmount, language)}</dd>
            </div>
            {booking.discount > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">{t('ticket.discount')}</dt>
                <dd className="tabular-nums">− {formatMoney(booking.discount, language)}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 text-base font-semibold">
              <dt>{t('ticket.total')}</dt>
              <dd className="tabular-nums">{formatMoney(booking.payableAmount, language)}</dd>
            </div>
            {booking.amountDue > 0 && (
              <div className="flex items-center justify-between gap-3 font-medium text-amber-700">
                <dt>{t('ticket.amountDue')}</dt>
                <dd className="tabular-nums">{formatMoney(booking.amountDue, language)}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="border-t border-line bg-canvas px-5 py-3 text-xs text-ink-muted">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {t('ticket.paidWith', { method: t(`ticket.method.${booking.paymentMethod}`) })}
          </span>
          <span>{t('ticket.bookedAt', { time: formatDate(booking.bookedAt, language) })}</span>
        </div>
        <p className="mt-1">{t('ticket.terms')}</p>
        {booking.cancellation && (
          <div className="mt-3 border-t border-line pt-2">
            <p className="font-medium text-ink">
              {t('ticket.cancellation.refundLine', {
                amount: formatMoney(booking.cancellation.refundAmount, language),
                status: t(`ticket.cancellation.status.${booking.cancellation.refundStatus}`),
              })}
            </p>
            <p className="mt-0.5">{booking.cancellation.reason}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
