import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import FullPageLoader from '../../components/ui/FullPageLoader.jsx';
import SeatMap from '../../components/booking/SeatMap.jsx';
import { bookingApi } from '../../services/booking.api.js';
import { useBookingDraftStore } from '../../store/bookingDraftStore.js';
import {
  formatCountdown,
  formatDate,
  formatMoney,
  formatNumber,
  formatTime,
  toDateInputValue,
} from '../../utils/datetime.js';

/**
 * Seat map + hold.
 *
 * A seat is not reserved by clicking it: `POST /api/holds` is what takes it off
 * sale, for two minutes, for this browser. The countdown is driven by the
 * server's `expiresAt`, and when it reaches zero the map reloads so expired
 * seats show as available again instead of pretending to be ours.
 */
export default function SeatSelectionPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('booking');
  const language = i18n.language;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [hold, setHold] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const setStoredHold = useBookingDraftStore((state) => state.setHold);
  const clearStoredHold = useBookingDraftStore((state) => state.clearHold);
  const expiredFor = useRef(null);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);

      try {
        const response = await bookingApi.getSeatMap(id);
        const seatMap = response.data;
        const draft = useBookingDraftStore.getState().holds[id];
        const serverSeats = seatMap.sessionHold?.seats ?? [];

        setData(seatMap);
        setError(null);

        if (serverSeats.length > 0) {
          const matchesDraft =
            draft &&
            draft.seatNumbers.length === serverSeats.length &&
            draft.seatNumbers.every((number) => serverSeats.includes(number));

          setSelected(serverSeats);
          setHold({
            seatNumbers: serverSeats,
            holdIds: matchesDraft ? draft.holdIds : [],
            expiresAt: matchesDraft ? draft.expiresAt : null,
          });
        } else {
          setSelected([]);
          setHold(null);
          if (draft) clearStoredHold(id);
        }
      } catch (loadError) {
        setError(loadError);
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [id, clearStoredHold],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!hold?.expiresAt) return undefined;

    const end = new Date(hold.expiresAt).getTime();
    const tick = () => setRemaining(Math.max(0, Math.round((end - Date.now()) / 1000)));

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [hold?.expiresAt]);

  // Expiry is handled once per hold, so a re-render cannot clear a new selection.
  useEffect(() => {
    if (!hold?.expiresAt || remaining !== 0) return;
    if (expiredFor.current === hold.expiresAt) return;

    expiredFor.current = hold.expiresAt;
    clearStoredHold(id);
    setHold(null);
    setSelected([]);
    setNotice({ tone: 'warning', title: t('seat.expired'), text: t('seat.expiredHint') });
    load({ silent: true });
  }, [remaining, hold, id, clearStoredHold, load, t]);

  const maxSeats = data?.maxSeatsPerBooking ?? 6;
  const fare = data?.trip?.fare ?? 0;
  const countdown = hold?.expiresAt && remaining !== null ? remaining : null;

  const toggleSeat = (number) => {
    if (hold) return;
    setNotice(null);

    if (selected.includes(number)) {
      setSelected((current) => current.filter((seat) => seat !== number));
      return;
    }
    if (selected.length >= maxSeats) {
      setNotice({
        tone: 'info',
        text: t('seat.maxSeats', { count: formatNumber(maxSeats, language) }),
      });
      return;
    }
    setSelected((current) => [...current, number].sort((a, b) => a - b));
  };

  const createHold = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    setNotice(null);

    try {
      const response = await bookingApi.createHold({ tripId: id, seatNumbers: selected });
      const created = response.data.hold;

      setStoredHold(id, created);
      expiredFor.current = null;
      await load({ silent: true });
      setNotice({
        tone: 'success',
        text: t('seat.holdCreated', {
          minutes: formatNumber(created.holdMinutes, language),
        }),
      });
    } catch (holdError) {
      if (holdError.status === 409) {
        setNotice({ tone: 'error', title: t('seat.holdFailed'), text: t('seat.seatTaken') });
        await load({ silent: true });
      } else {
        setNotice({
          tone: 'error',
          title: t('seat.holdFailed'),
          text: holdError.message,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    setBusy(true);
    setNotice(null);

    try {
      await bookingApi.releaseTripHolds(id);
      clearStoredHold(id);
      setHold(null);
      setSelected([]);
      await load({ silent: true });
    } catch (releaseError) {
      setNotice({ tone: 'error', title: t('seat.holdFailed'), text: releaseError.message });
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) {
    return <FullPageLoader label={t('seat.loading')} />;
  }

  if (!data) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
        <Alert tone="error" title={t('common:errors.generic')}>
          <p>{error?.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => load()}>
              {t('seat.refresh')}
            </Button>
            <Link
              to="/"
              className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:border-brand-200"
            >
              {t('seat.back')}
            </Link>
          </div>
        </Alert>
      </section>
    );
  }

  const { trip, layout, seats, seatSummary, cancellationPolicy, holdMinutes } = data;
  const seatLabel = (number) => seats.find((seat) => seat.number === number)?.label ?? number;

  const backParams = new URLSearchParams({
    origin: trip.route.origin?.city || trip.route.origin?.name || '',
    destination: trip.route.destination?.city || trip.route.destination?.name || '',
    date: toDateInputValue(trip.departureAt),
  });

  const total = fare * selected.length;

  return (
    <>
      <section className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Link
            to={`/trips?${backParams.toString()}`}
            className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            <span aria-hidden="true">←</span>
            {t('seat.back')}
          </Link>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {t('seat.title')}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                {trip.route.name} · {formatDate(trip.departureAt, language)} ·{' '}
                {formatTime(trip.departureAt, language)}
              </p>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
                {t('seat.subtitle', { minutes: formatNumber(holdMinutes, language) })}
              </p>
            </div>

            <div className="flex flex-col items-start gap-1 sm:items-end">
              <span className="text-xs text-ink-muted">{trip.bus.operatorName}</span>
              <span className="text-sm font-medium">{trip.bus.busNumber}</span>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="brand">{t(`types.${trip.bus.busType}`)}</Badge>
                <Badge tone="success" dot>
                  {t('results.seatsLeft', {
                    count: seatSummary.available,
                    seats: formatNumber(seatSummary.available, language),
                  })}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              {t('seat.mapLabel')}
            </h2>
            <span className="text-xs text-ink-muted">
              {t('seat.maxSeats', { count: formatNumber(maxSeats, language) })}
            </span>
          </div>

          <SeatMap
            layout={layout}
            seats={seats}
            selected={selected}
            locked={Boolean(hold)}
            onToggle={toggleSeat}
          />
        </Card>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {notice && (
            <Alert tone={notice.tone} title={notice.title}>
              {notice.text}
            </Alert>
          )}

          {hold && (
            <Alert
              tone={hold.expiresAt ? 'info' : 'warning'}
              title={t('seat.alreadyHeld')}
            >
              {countdown !== null
                ? t('seat.expiresIn', { time: formatCountdown(countdown, language) })
                : null}
            </Alert>
          )}

          <Card className="p-5">
            <h2 className="text-base font-semibold">
              {t('seat.seatCount', {
                count: selected.length,
                seats: formatNumber(selected.length, language),
              })}
            </h2>

            {selected.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {selected.map((number) => (
                  <li
                    key={number}
                    className="rounded-md border border-brand-100 bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700"
                  >
                    {seatLabel(number)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">{t('seat.noSeats')}</p>
            )}

            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">{t('results.fare')}</dt>
                <dd className="tabular-nums">
                  {formatMoney(fare, language)}{' '}
                  <span className="text-xs text-ink-muted">{t('results.perSeat')}</span>
                </dd>
              </div>
              {selected.length > 1 && (
                <div className="flex items-center justify-between gap-3 text-ink-muted">
                  <dt>
                    {t('seat.seatCount', {
                      count: selected.length,
                      seats: formatNumber(selected.length, language),
                    })}
                  </dt>
                  <dd className="tabular-nums">× {formatNumber(selected.length, language)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 text-base font-semibold">
                <dt>{t('seat.total')}</dt>
                <dd className="tabular-nums text-brand-700">{formatMoney(total, language)}</dd>
              </div>
            </dl>

            {hold ? (
              <>
                <Link to={`/booking/${id}/passenger`} className="mt-4 block">
                  <Button className="w-full">{t('seat.continue')}</Button>
                </Link>
                <Button
                  variant="secondary"
                  className="mt-2 w-full"
                  onClick={release}
                  disabled={busy}
                >
                  {busy ? t('seat.releasing') : t('seat.release')}
                </Button>
              </>
            ) : (
              <Button
                className="mt-4 w-full"
                onClick={createHold}
                disabled={busy || selected.length === 0}
              >
                {busy
                  ? t('seat.holding')
                  : t('seat.holdCta', { minutes: formatNumber(holdMinutes, language) })}
              </Button>
            )}

            <p className="mt-3 text-xs leading-relaxed text-ink-muted">{t('seat.holdNote')}</p>
            {cancellationPolicy && (
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                {t('seat.policy', {
                  hours: formatNumber(cancellationPolicy.freeCancelHours, language),
                })}
              </p>
            )}
          </Card>

          {(trip.boardingPoints.length > 0 || trip.droppingPoints.length > 0) && (
            <Card className="p-5 text-sm">
              {trip.boardingPoints.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {t('seat.boarding')}
                  </p>
                  <p className="mt-1 leading-relaxed">{trip.boardingPoints.join(' · ')}</p>
                </div>
              )}
              {trip.droppingPoints.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {t('seat.dropping')}
                  </p>
                  <p className="mt-1 leading-relaxed">{trip.droppingPoints.join(' · ')}</p>
                </div>
              )}
            </Card>
          )}
        </div>
      </section>
    </>
  );
}
