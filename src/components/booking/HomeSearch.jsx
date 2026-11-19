import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Card from '../ui/Card.jsx';
import SearchForm from './SearchForm.jsx';
import { bookingApi } from '../../services/booking.api.js';
import { formatMoney, formatNumber, toDateInputValue } from '../../utils/datetime.js';

/**
 * Search panel plus the routes that actually have departures this week.
 * The chips are built from real timetable data; when there is nothing scheduled
 * the block simply does not render.
 */
export default function HomeSearch() {
  const { t, i18n } = useTranslation('booking');
  const [routes, setRoutes] = useState([]);

  useEffect(() => {
    let alive = true;

    bookingApi
      .getPopularRoutes()
      .then((response) => {
        if (alive) setRoutes(response.data.routes ?? []);
      })
      // A homepage should never break because a secondary block failed.
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  const today = toDateInputValue(new Date());

  return (
    <Card className="p-5 shadow-soft sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight">{t('search.title')}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('search.subtitle')}</p>

      <div className="mt-5">
        <SearchForm />
      </div>

      {routes.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t('search.popular')}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {routes.map((route) => {
              const params = new URLSearchParams({
                origin: route.origin?.city || route.origin?.name || '',
                destination: route.destination?.city || route.destination?.name || '',
                date: today,
              });

              return (
                <li key={route.id}>
                  <Link
                    to={`/trips?${params.toString()}`}
                    className="inline-flex flex-col rounded-lg border border-line bg-canvas px-3 py-2 text-xs transition-colors hover:border-brand-200 hover:bg-brand-50"
                  >
                    <span className="font-medium text-ink">
                      {route.origin?.city || route.origin?.name} →{' '}
                      {route.destination?.city || route.destination?.name}
                    </span>
                    <span className="mt-0.5 text-ink-muted">
                      {t('search.fromFare', { fare: formatMoney(route.fromFare, i18n.language) })} ·{' '}
                      {t('search.popularTrips', {
                        count: route.trips,
                        trips: formatNumber(route.trips, i18n.language),
                      })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
