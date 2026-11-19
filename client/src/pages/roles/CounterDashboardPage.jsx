import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import FormField from '../../components/ui/FormField.jsx';
import SelectField from '../../components/ui/SelectField.jsx';
import SeatMap from '../../components/booking/SeatMap.jsx';
import TicketCard from '../../components/booking/TicketCard.jsx';
import { bookingApi } from '../../services/booking.api.js';
import { counterApi } from '../../services/counter.api.js';
import { createPassengerSchema } from '../../schemas/booking.schemas.js';
import { toast } from '../../store/toastStore.js';
import {
  formatDate,
  formatMoney,
  formatTime,
  toDateInputValue,
} from '../../utils/datetime.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

const STATUS_TONES = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'brand',
  cancelled: 'danger',
  expired: 'danger',
};

/**
 * Counter dashboard (Phase 6).
 *
 * Two jobs, both real:
 *   1. Sell a seat for cash right now — no online hold, no fake payment row.
 *   2. Find a reservation and collect its cash, which confirms the ticket.
 *
 * The seat claim uses the same server rule as the online checkout, so a seat an
 * online passenger is holding cannot be double-sold here: the API answers 409.
 */
export default function CounterDashboardPage() {
  const { t, i18n } = useTranslation(['booking', 'common']);
  const language = i18n.language;

  const [context, setContext] = useState(null);
  const [filters, setFilters] = useState({
    origin: '',
    destination: '',
    date: toDateInputValue(new Date()),
  });
  const [trips, setTrips] = useState([]);
  const [searchingTrips, setSearchingTrips] = useState(false);
  const [tripError, setTripError] = useState(null);

  const [trip, setTrip] = useState(null);
  const [seatMap, setSeatMap] = useState(null);
  const [selected, setSelected] = useState([]);
  const [saleError, setSaleError] = useState(null);
  const [selling, setSelling] = useState(false);
  const [sale, setSale] = useState(null);

  const [query, setQuery] = useState('');
  const [bookings, setBookings] = useState([]);
  const [searchingBookings, setSearchingBookings] = useState(false);
  const [collecting, setCollecting] = useState(null);

  const schema = useMemo(() => createPassengerSchema(t), [t]);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '', email: '', gender: '', age: '' },
  });

  useEffect(() => {
    counterApi
      .getContext()
      .then((response) => setContext(response.data))
      .catch(() => setContext(null));
  }, []);

  const loadSeatMap = useCallback(async (tripId) => {
    const response = await bookingApi.getSeatMap(tripId);
    setSeatMap(response.data);
    setSelected([]);
  }, []);

  async function searchTrips(event) {
    event.preventDefault();
    setSearchingTrips(true);
    setTripError(null);

    try {
      const response = await bookingApi.searchTrips(filters);
      setTrips(response.data.items);
    } catch (error) {
      setTrips([]);
      setTripError(errorMessage(error, t('common:errors.generic')));
    } finally {
      setSearchingTrips(false);
    }
  }

  async function chooseTrip(row) {
    setTrip(row);
    setSale(null);
    setSaleError(null);
    try {
      await loadSeatMap(row.id);
    } catch (error) {
      setSeatMap(null);
      setSaleError(errorMessage(error, t('common:errors.generic')));
    }
  }

  function toggleSeat(number) {
    setSaleError(null);
    setSelected((current) =>
      current.includes(number)
        ? current.filter((seat) => seat !== number)
        : [...current, number].sort((a, b) => a - b),
    );
  }

  async function sellTicket(values) {
    if (selected.length === 0) {
      setSaleError(t('counter.selectSeatsFirst'));
      return;
    }
    setSelling(true);
    setSaleError(null);

    try {
      const response = await counterApi.sell({
        tripId: trip.id,
        seatNumbers: selected,
        passenger: values,
      });
      setSale(response.data.booking);
      reset({ name: '', phone: '', email: '', gender: '', age: '' });
      await loadSeatMap(trip.id);
      toast.success(t('counter.saleSuccess', { code: response.data.booking.code }));
    } catch (error) {
      const applied = applyServerErrors(error, setError);
      if (!applied) setSaleError(errorMessage(error, t('counter.saleFailed')));
    } finally {
      setSelling(false);
    }
  }

  async function findBookings(event) {
    event.preventDefault();
    setSearchingBookings(true);
    try {
      const response = await counterApi.searchBookings(query);
      setBookings(response.data.bookings);
    } catch (error) {
      setBookings([]);
      toast.error(errorMessage(error, t('common:errors.generic')));
    } finally {
      setSearchingBookings(false);
    }
  }

  async function collect(booking) {
    setCollecting(booking.code);
    try {
      const response = await counterApi.collectCash(booking.code);
      const updated = response.data.booking;
      setBookings((current) =>
        current.map((item) => (item.code === updated.code ? updated : item)),
      );
      toast.success(t('counter.collectSuccess', { code: updated.code }));
    } catch (error) {
      toast.error(errorMessage(error, t('counter.collectFailed')));
    } finally {
      setCollecting(null);
    }
  }

  const seatLabel = (number) =>
    seatMap?.seats.find((seat) => seat.number === number)?.label ?? number;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('counter.title')}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t('counter.subtitle')}</p>
        </div>
        <Badge tone={context?.counter ? 'brand' : 'warning'}>
          {context?.counter
            ? t('counter.counterLabel', {
                name: context.counter.name,
                code: context.counter.code,
              })
            : t('counter.noCounter')}
        </Badge>
      </header>

      {!context?.counter && (
        <Alert tone="info">{t('counter.noCounterHint')}</Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        {/* ---------------------------------------------------------- sale */}
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-base font-semibold">{t('counter.searchTripsTitle')}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t('counter.searchTripsSubtitle')}</p>

            <form onSubmit={searchTrips} className="mt-4 grid gap-3 sm:grid-cols-2">
              <FormField
                id="counterOrigin"
                label={t('counter.fields.origin')}
                value={filters.origin}
                onChange={(event) => setFilters({ ...filters, origin: event.target.value })}
                required
              />
              <FormField
                id="counterDestination"
                label={t('counter.fields.destination')}
                value={filters.destination}
                onChange={(event) => setFilters({ ...filters, destination: event.target.value })}
                required
              />
              <FormField
                id="counterDate"
                type="date"
                label={t('counter.fields.date')}
                value={filters.date}
                onChange={(event) => setFilters({ ...filters, date: event.target.value })}
                required
              />
              <div className="flex items-end">
                <Button type="submit" disabled={searchingTrips} className="w-full">
                  {searchingTrips ? t('counter.searchingTrips') : t('counter.searchTrips')}
                </Button>
              </div>
            </form>

            {tripError && (
              <Alert tone="error" className="mt-4">
                {tripError}
              </Alert>
            )}

            {trips.length > 0 && (
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {trips.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium">
                        {row.route.name} · {formatTime(row.departureAt, language)}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {row.bus.busNumber} · {formatDate(row.departureAt, language)} ·{' '}
                        {t('counter.seatsAvailable', { count: row.seats.available })} ·{' '}
                        {formatMoney(row.fare, language)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={trip?.id === row.id ? 'secondary' : 'primary'}
                      onClick={() => chooseTrip(row)}
                    >
                      {trip?.id === row.id ? t('counter.selected') : t('counter.select')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {!searchingTrips && trips.length === 0 && !tripError && (
              <p className="mt-4 text-sm text-ink-muted">{t('counter.searchTripsHint')}</p>
            )}
          </Card>

          {trip && seatMap && (
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{t('counter.seatsTitle')}</h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {trip.route.name} · {formatTime(trip.departureAt, language)} ·{' '}
                    {seatMap.seatSummary.available} {t('counter.available')}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setTrip(null); setSeatMap(null); }}>
                  {t('counter.changeTrip')}
                </Button>
              </div>

              <div className="mt-4">
                <SeatMap
                  layout={seatMap.layout}
                  seats={seatMap.seats}
                  selected={selected}
                  locked={false}
                  onToggle={toggleSeat}
                />
              </div>

              <p className="mt-3 text-sm text-ink-muted">
                {selected.length > 0
                  ? t('counter.selectedSeats', {
                      seats: selected.map(seatLabel).join(', '),
                      total: formatMoney(trip.fare * selected.length, language),
                    })
                  : t('counter.selectSeatsHint')}
              </p>
            </Card>
          )}

          {trip && seatMap && (
            <Card className="p-5">
              <h2 className="text-base font-semibold">{t('counter.passengerTitle')}</h2>

              {saleError && (
                <Alert tone="error" className="mt-3">
                  {saleError}
                </Alert>
              )}

              <form onSubmit={handleSubmit(sellTicket)} noValidate className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    id="counterName"
                    label={t('counter.fields.name')}
                    error={errors.name?.message}
                    {...register('name')}
                  />
                  <FormField
                    id="counterPhone"
                    type="tel"
                    label={t('counter.fields.phone')}
                    dir="ltr"
                    error={errors.phone?.message}
                    {...register('phone')}
                  />
                  <FormField
                    id="counterEmail"
                    type="email"
                    label={t('counter.fields.email')}
                    dir="ltr"
                    error={errors.email?.message}
                    {...register('email')}
                  />
                  <SelectField
                    id="counterGender"
                    label={t('counter.fields.gender')}
                    error={errors.gender?.message}
                    {...register('gender')}
                  >
                    <option value="">{t('counter.fields.genderEmpty')}</option>
                    <option value="male">{t('counter.fields.male')}</option>
                    <option value="female">{t('counter.fields.female')}</option>
                    <option value="other">{t('counter.fields.other')}</option>
                  </SelectField>
                  <FormField
                    id="counterAge"
                    type="number"
                    min="0"
                    max="120"
                    label={t('counter.fields.age')}
                    error={errors.age?.message}
                    {...register('age')}
                  />
                </div>

                <Button type="submit" disabled={selling || selected.length === 0} className="w-full">
                  {selling
                    ? t('counter.selling')
                    : t('counter.sellCta', {
                        total: formatMoney(trip.fare * selected.length, language),
                      })}
                </Button>
                <p className="text-xs text-ink-muted">{t('counter.cashNote')}</p>
              </form>

              {sale && (
                <div className="mt-6 space-y-3 border-t border-line pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold">{t('counter.saleTitle')}</h3>
                      <p className="text-sm text-ink-muted">{t('counter.saleSubtitle')}</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => window.print()}>
                      {t('ticket.print')}
                    </Button>
                  </div>
                  <TicketCard booking={sale} />
                </div>
              )}
            </Card>
          )}
        </div>

        {/* ------------------------------------------------ find & collect */}
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-base font-semibold">{t('counter.bookingsTitle')}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t('counter.bookingsSubtitle')}</p>

            <form onSubmit={findBookings} className="mt-4 flex flex-wrap items-end gap-3">
              <FormField
                id="counterQuery"
                label={t('counter.searchLabel')}
                placeholder={t('counter.searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-[12rem] flex-1"
              />
              <Button type="submit" variant="secondary" disabled={searchingBookings}>
                {searchingBookings ? t('counter.searchingTrips') : t('counter.search')}
              </Button>
            </form>

            {bookings.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">{t('counter.noBookings')}</p>
            ) : (
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {bookings.map((booking) => (
                  <li key={booking.code} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold" dir="ltr">
                          {booking.code}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {booking.passenger.name} · {booking.passenger.phone}
                        </p>
                        <p className="mt-1 text-xs text-ink-muted">
                          {booking.trip?.route?.name} ·{' '}
                          {booking.trip?.departureAt
                            ? `${formatDate(booking.trip.departureAt, language)} ${formatTime(
                                booking.trip.departureAt,
                                language,
                              )}`
                            : '—'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <Badge tone={STATUS_TONES[booking.status] ?? 'neutral'}>
                          {t(`ticket.status.${booking.status}`)}
                        </Badge>
                        {booking.amountDue > 0 ? (
                          <span className="text-xs font-medium text-amber-700">
                            {t('counter.due', {
                              amount: formatMoney(booking.amountDue, language),
                            })}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-muted">{t('counter.paidLabel')}</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xs text-ink-muted">
                        {booking.seats.map((seat) => seat.label).join(', ')}
                      </span>
                      {booking.canPayAtCounter && (
                        <Button
                          size="sm"
                          onClick={() => collect(booking)}
                          disabled={collecting === booking.code}
                        >
                          {collecting === booking.code
                            ? t('counter.collecting')
                            : t('counter.collect')}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Alert tone="info" title={t('counter.rulesTitle')}>
            {t('counter.rulesBody')}
          </Alert>
        </div>
      </div>
    </div>
  );
}
