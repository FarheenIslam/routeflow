import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import SearchForm from '../../components/booking/SearchForm.jsx';
import { bookingApi } from '../../services/booking.api.js';
import {
  formatDate,
  formatDuration,
  formatMoney,
  formatNumber,
  formatTime,
} from '../../utils/datetime.js';

/**
 * Search results.
 *
 * The URL is the state: every filter lives in the query string, so refreshing,
 * sharing or pressing Back shows exactly the same search. No trip data is kept
 * in the browser, which is why a seat count here is only ever a hint — the seat
 * map re-reads availability from the server.
 */
export default function TripResultsPage() {
  const { t, i18n } = useTranslation('booking');
  const [params] = useSearchParams();

  const query = useMemo(
    () => ({
      origin: params.get('origin')?.trim() ?? '',
      destination: params.get('destination')?.trim() ?? '',
      date: params.get('date') ?? '',
      busType: params.get('busType') ?? '',
    }),
    [params],
  );

  const [result, setResult] = useState({ loading: true, error: null, data: null });
  const [attempt, setAttempt] = useState(0);
  const language = i18n.language;

  const missingQuery = !query.origin || !query.destination;

  useEffect(() => {
    if (missingQuery) return undefined;

    let alive = true;
    setResult((current) => ({ ...current, loading: true, error: null }));

    const filters = { origin: query.origin, destination: query.destination };
    if (query.date) filters.date = query.date;
    if (query.busType) filters.busType = query.busType;

    bookingApi
      .searchTrips(filters)
      .then((response) => {
        if (alive) setResult({ loading: false, error: null, data: response.data });
      })
      .catch((error) => {
        if (alive) setResult({ loading: false, error, data: null });
      });

    return () => {
      alive = false;
    };
  }, [query, missingQuery, attempt]);

  const trips = result.data?.items ?? [];
  const total = result.data?.pagination?.total ?? 0;

  return (
    <>
      <section className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {t('results.title')}
              </h1>
              {query.origin && query.destination && (
                <p className="mt-1 text-sm text-ink-muted">
                  {t('results.subtitle', {
                    origin: query.origin,
                    destination: query.destination,
                    date: query.date ? formatDate(query.date, language) : t('search.today'),
                  })}
                </p>
              )}
            </div>
            {!result.loading && result.data && (
              <Badge tone="brand" dot>
                {t('results.found', {
                  count: total,
                  seats: formatNumber(total, language),
                })}
              </Badge>
            )}
          </div>

          <div className="mt-6 rounded-card border border-line bg-canvas p-4 sm:p-5">
            <SearchForm initial={query} compact />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {result.loading && !missingQuery && (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-ink-muted">
            <Spinner className="size-5 text-brand-600" label={t('results.loading')} />
            {t('results.loading')}
          </div>
        )}

        {!missingQuery && !result.loading && result.error && (
          <Alert tone="error" title={t('common:errors.generic')}>
            <p>{result.error.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
                {t('common:common.retry')}
              </Button>
              <Link
                to="/"
                className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:border-brand-200"
              >
                {t('results.changeSearch')}
              </Link>
            </div>
          </Alert>
        )}

        {missingQuery && (
          <Alert tone="info" title={t('search.required')}>
            <Link to="/" className="font-medium underline">
              {t('results.changeSearch')}
            </Link>
          </Alert>
        )}

        {!missingQuery && !result.loading && !result.error && trips.length === 0 && (
          <Card className="px-6 py-12 text-center">
            <h2 className="text-base font-semibold">{t('results.none')}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
              {t('results.noneHint')}
            </p>
            <Link
              to="/"
              className="mt-5 inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:border-brand-200"
            >
              {t('results.changeSearch')}
            </Link>
          </Card>
        )}

        {!missingQuery && !result.loading && !result.error && trips.length > 0 && (
          <ul className="space-y-4">
            {trips.map((trip) => (
              <li key={trip.id}>
                <Card className="overflow-hidden">
                  <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          {trip.bus.operatorName}
                        </span>
                        <Badge>{t(`types.${trip.bus.busType}`)}</Badge>
                        <Badge tone="neutral">{trip.bus.busNumber}</Badge>
                        {trip.status === 'delayed' && (
                          <Badge tone="warning" dot>
                            {t('results.delayed')}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-4 flex items-center gap-3 sm:gap-5">
                        <div>
                          <p className="text-xl font-semibold tabular-nums">
                            {formatTime(trip.departureAt, language)}
                          </p>
                          <p className="text-xs text-ink-muted">{trip.route.origin?.city}</p>
                        </div>

                        <div className="flex flex-1 flex-col items-center text-center">
                          <span className="text-[11px] text-ink-muted">
                            {t('results.duration')} ·{' '}
                            {formatDuration(trip.route.estimatedDurationMinutes, language)}
                          </span>
                          <span className="mt-1 flex w-full items-center gap-1" aria-hidden="true">
                            <span className="size-1.5 rounded-full bg-brand-300" />
                            <span className="h-px flex-1 bg-line" />
                            <span className="size-1.5 rounded-full bg-brand-300" />
                          </span>
                        </div>

                        <div className="text-right">
                          <p className="text-xl font-semibold tabular-nums">
                            {formatTime(trip.arrivalEstimateAt, language)}
                          </p>
                          <p className="text-xs text-ink-muted">{trip.route.destination?.city}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                        <span>{trip.route.name}</span>
                        {trip.boardingPoints.length > 0 && (
                          <span>
                            {t('seat.boarding')}: {trip.boardingPoints.join(' · ')}
                          </span>
                        )}
                        {trip.bus.amenities.length > 0 && (
                          <span>
                            {t('results.amenities')}: {trip.bus.amenities.join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-end justify-between gap-4 border-t border-line pt-4 sm:min-w-44 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
                      <div className="sm:text-right">
                        <p className="text-lg font-semibold text-brand-700">
                          {formatMoney(trip.fare, language)}
                        </p>
                        <p className="text-xs text-ink-muted">{t('results.perSeat')}</p>
                        <p
                          className={`mt-1 text-xs font-medium ${
                            trip.seats.available > 0 ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {trip.seats.available > 0                              ? t('results.seatsLeft', {
                                count: trip.seats.available,
                                seats: formatNumber(trip.seats.available, language),
                              })
                            : t('results.soldOut')}
                        </p>
                      </div>

                      {trip.bookable && trip.seats.available > 0 ? (
                        <Link
                          to={`/trips/${trip.id}/seats`}
                          className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
                        >
                          {t('results.viewSeats')}
                        </Link>
                      ) : (
                        <span className="inline-flex h-11 shrink-0 items-center rounded-lg border border-line bg-canvas px-4 text-sm font-medium text-ink-muted">
                          {trip.bookable ? t('results.soldOut') : t('results.notBookable')}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
