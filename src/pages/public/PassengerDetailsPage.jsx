import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import FormField from '../../components/ui/FormField.jsx';
import FullPageLoader from '../../components/ui/FullPageLoader.jsx';
import SelectField from '../../components/ui/SelectField.jsx';
import { bookingApi } from '../../services/booking.api.js';
import { createPassengerSchema } from '../../schemas/booking.schemas.js';
import { useBookingDraftStore } from '../../store/bookingDraftStore.js';
import { useAuthStore } from '../../store/authStore.js';
import { formatDate, formatMoney, formatTime } from '../../utils/datetime.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

/**
 * Passenger details + payment choice.
 *
 * The seats are already held for this browser, so this page only collects who
 * is travelling and how they will pay:
 *   cash     → a real reservation, unpaid, collected at any counter
 *   sslcommerz → a hosted checkout, only offered when the server says the
 *                gateway is configured and enabled by the admin
 */
export default function PassengerDetailsPage() {
  const { tripId } = useParams();
  const { t, i18n } = useTranslation(['booking', 'common']);
  const language = i18n.language;
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const clearStoredHold = useBookingDraftStore((state) => state.clearHold);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [method, setMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);

  const schema = useMemo(() => createPassengerSchema(t), [t]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      email: user?.email ?? '',
      gender: '',
      age: '',
    },
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await bookingApi.getSeatMap(tripId);
        if (!cancelled) {
          setData(response.data);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) setLoadError(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (loading) return <FullPageLoader label={t('seat.loading')} />;

  const heldSeats = data?.sessionHold?.seats ?? [];
  if (!data || heldSeats.length === 0) {
    return (
      <section className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
        <Alert tone="warning" title={t('passenger.holdExpiredTitle')}>
          <p>{loadError?.message || t('passenger.holdExpiredBody')}</p>
          <div className="mt-3">
            <Link to={`/trips/${tripId}/seats`}>
              <Button size="sm">{t('passenger.backToSeats')}</Button>
            </Link>
          </div>
        </Alert>
      </section>
    );
  }

  const { trip, seats: seatRows, paymentOptions, maxSeatsPerBooking } = data;
  const seatLabel = (number) => seatRows.find((seat) => seat.number === number)?.label ?? number;
  const total = trip.fare * heldSeats.length;
  const onlineAvailable = Boolean(paymentOptions?.online);

  async function onSubmit(values) {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await bookingApi.createBooking({
        tripId,
        seatNumbers: heldSeats,
        paymentMethod: method,
        passenger: values,
      });
      const booking = response.data.booking;
      clearStoredHold(tripId);

      if (method === 'sslcommerz') {
        try {
          const payment = await bookingApi.initiatePayment(booking.code);
          window.location.assign(payment.data.gatewayPageUrl);
          return;
        } catch {
          // The ticket exists and is unpaid. The ticket page can retry payment.
          navigate(`/booking/${booking.code}?payment=unavailable`, { replace: true });
          return;
        }
      }

      navigate(`/booking/${booking.code}`, { replace: true });
    } catch (error) {
      const applied = applyServerErrors(error, setError);
      if (!applied) setSubmitError(errorMessage(error, t('common:errors.generic')));
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link
        to={`/trips/${tripId}/seats`}
        className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <span aria-hidden="true">←</span>
        {t('passenger.backToSeats')}
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        {t('passenger.title')}
      </h1>
      <p className="mt-1 text-sm text-ink-muted">{t('passenger.subtitle')}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-semibold">{t('passenger.detailsTitle')}</h2>

          {submitError && (
            <Alert tone="error" className="mt-4">
              {submitError}
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="name"
                label={t('passenger.fields.name')}
                autoComplete="name"
                error={errors.name?.message}
                {...register('name')}
              />
              <FormField
                id="phone"
                type="tel"
                label={t('passenger.fields.phone')}
                hint={t('passenger.fields.phoneHint')}
                autoComplete="tel"
                dir="ltr"
                error={errors.phone?.message}
                {...register('phone')}
              />
              <FormField
                id="email"
                type="email"
                label={t('passenger.fields.email')}
                autoComplete="email"
                dir="ltr"
                error={errors.email?.message}
                {...register('email')}
              />
              <SelectField
                id="gender"
                label={t('passenger.fields.gender')}
                error={errors.gender?.message}
                {...register('gender')}
              >
                <option value="">{t('passenger.fields.genderEmpty')}</option>
                <option value="male">{t('passenger.fields.male')}</option>
                <option value="female">{t('passenger.fields.female')}</option>
                <option value="other">{t('passenger.fields.other')}</option>
              </SelectField>
              <FormField
                id="age"
                type="number"
                inputMode="numeric"
                min="0"
                max="120"
                label={t('passenger.fields.age')}
                error={errors.age?.message}
                {...register('age')}
              />
            </div>

            <fieldset className="rounded-lg border border-line p-4">
              <legend className="px-1 text-sm font-medium">{t('passenger.paymentTitle')}</legend>

              <div className="mt-2 space-y-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 transition-colors hover:border-brand-200">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="cash"
                    checked={method === 'cash'}
                    onChange={() => setMethod('cash')}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium">{t('passenger.cashTitle')}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                      {t('passenger.cashBody')}
                    </span>
                  </span>
                </label>

                <label
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                    onlineAvailable
                      ? 'cursor-pointer border-line hover:border-brand-200'
                      : 'cursor-not-allowed border-dashed border-line bg-canvas'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="sslcommerz"
                    checked={method === 'sslcommerz'}
                    onChange={() => setMethod('sslcommerz')}
                    disabled={!onlineAvailable}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium">{t('passenger.onlineTitle')}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                      {onlineAvailable ? t('passenger.onlineBody') : t('passenger.onlineUnavailable')}
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? t('passenger.submitting')
                : method === 'sslcommerz'
                  ? t('passenger.payOnlineCta', { total: formatMoney(total, language) })
                  : t('passenger.reserveCta')}
            </Button>
            <p className="text-xs leading-relaxed text-ink-muted">{t('passenger.holdNote')}</p>
          </form>
        </Card>

        <Card className="h-fit p-5 lg:sticky lg:top-24">
          <h2 className="text-base font-semibold">{t('passenger.summaryTitle')}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {trip.route.name} · {formatDate(trip.departureAt, language)} ·{' '}
            {formatTime(trip.departureAt, language)}
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {heldSeats.map((number) => (
              <span
                key={number}
                className="rounded-md border border-brand-100 bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700"
              >
                {seatLabel(number)}
              </span>
            ))}
          </div>

          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">{t('results.fare')}</dt>
              <dd className="tabular-nums">{formatMoney(trip.fare, language)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">
                {t('seat.seatCount', {
                  count: heldSeats.length,
                  seats: heldSeats.length,
                })}
              </dt>
              <dd className="tabular-nums">× {heldSeats.length}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-base font-semibold">
              <dt>{t('seat.total')}</dt>
              <dd className="tabular-nums text-brand-700">{formatMoney(total, language)}</dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-ink-muted">
            {t('passenger.maxSeats', { count: maxSeatsPerBooking })}
          </p>
          {trip.bus?.busNumber && (
            <p className="mt-3 border-t border-line pt-3 text-xs text-ink-muted">
              {trip.bus.operatorName} · {trip.bus.busNumber}
            </p>
          )}
        </Card>
      </div>
    </section>
  );
}
