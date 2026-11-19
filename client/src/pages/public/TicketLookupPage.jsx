import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import FormField from '../../components/ui/FormField.jsx';
import TicketCard from '../../components/booking/TicketCard.jsx';
import { bookingApi } from '../../services/booking.api.js';
import { createLookupSchema } from '../../schemas/booking.schemas.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

/**
 * Ticket lookup for someone on a new device (or after clearing cookies).
 *
 * Both the ticket number and the booking phone are required, so the short ticket
 * number alone never exposes a passenger's name, phone or seats.
 */
export default function TicketLookupPage() {
  const { t } = useTranslation('booking');
  const [booking, setBooking] = useState(null);
  const [formError, setFormError] = useState(null);

  const schema = useMemo(() => createLookupSchema(t), [t]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { code: '', phone: '' },
  });

  async function onSubmit(values) {
    setFormError(null);
    try {
      const response = await bookingApi.lookupBooking(values);
      setBooking(response.data.booking);
    } catch (error) {
      setBooking(null);
      const applied = applyServerErrors(error, setError);
      if (!applied) setFormError(errorMessage(error, t('lookup.failed')));
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('lookup.title')}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t('lookup.subtitle')}</p>

      <Card className="no-print mt-5 p-5">
        {formError && (
          <Alert tone="error" className="mb-4">
            {formError}
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <FormField
            id="code"
            label={t('lookup.fields.code')}
            placeholder="BB-7K2M9Q"
            dir="ltr"
            error={errors.code?.message}
            {...register('code')}
          />
          <FormField
            id="lookupPhone"
            type="tel"
            label={t('lookup.fields.phone')}
            placeholder="01712345678"
            dir="ltr"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('lookup.searching') : t('lookup.submit')}
          </Button>
        </form>
      </Card>

      {booking && (
        <div className="mt-6 space-y-4">
          <TicketCard booking={booking} />
          <div className="no-print flex flex-wrap items-center gap-3">
            <Link
              to={`/booking/${booking.code}?phone=${encodeURIComponent(booking.passenger.phone)}`}
              className="text-sm text-brand-700 hover:underline"
            >
              {t('lookup.openTicket')}
            </Link>
            <Link to="/" className="text-sm text-ink-muted hover:text-ink">
              {t('lookup.backHome')}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
