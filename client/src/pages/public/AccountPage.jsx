import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import FormField from '../../components/ui/FormField.jsx';
import { authApi } from '../../services/auth.api.js';
import { bookingApi } from '../../services/booking.api.js';
import { createChangePasswordSchema } from '../../schemas/auth.schemas.js';
import { useAuthStore } from '../../store/authStore.js';
import { toast } from '../../store/toastStore.js';
import { formatDateTime } from '../../utils/format.js';
import { formatMoney } from '../../utils/datetime.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink" dir="auto">
        {value || '—'}
      </dd>
    </div>
  );
}

export default function AccountPage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  const schema = useMemo(() => createChangePasswordSchema(t), [t]);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const [formError, setFormError] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    bookingApi
      .getMyBookings()
      .then((response) => {
        if (!cancelled) setTickets(response.data.bookings);
      })
      .catch(() => {
        if (!cancelled) setTickets([]);
      })
      .finally(() => {
        if (!cancelled) setTicketsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(values) {
    setFormError(null);
    try {
      const response = await authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      setUser(response.data.user);
      reset();
      toast.success(t('account.passwordChanged'));
    } catch (error) {
      const appliedToFields = applyServerErrors(error, setError);
      if (!appliedToFields) setFormError(errorMessage(error, t('errors.generic')));
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('account.title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('account.subtitle')}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{t('account.profileTitle')}</h2>
            <Badge tone="brand">{t(`role.${user.role}`)}</Badge>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Detail label={t('auth.fields.name')} value={user.name} />
            <Detail label={t('auth.fields.email')} value={user.email} />
            <Detail label={t('auth.fields.phone')} value={user.phone} />
            <Detail label={t('account.status')} value={t(`status.${user.status}`)} />
            <Detail
              label={t('account.memberSince')}
              value={formatDateTime(user.createdAt, i18n.language)}
            />
            <Detail
              label={t('account.lastLogin')}
              value={user.lastLoginAt ? formatDateTime(user.lastLoginAt, i18n.language) : '—'}
            />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold">{t('account.changePasswordTitle')}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('account.changePasswordSubtitle')}</p>

          {formError && (
            <Alert tone="error" className="mt-4">
              {formError}
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-4 space-y-3">
            <FormField
              id="currentPassword"
              type="password"
              label={t('auth.fields.currentPassword')}
              autoComplete="current-password"
              error={errors.currentPassword?.message}
              {...register('currentPassword')}
            />
            <FormField
              id="newPassword"
              type="password"
              label={t('auth.fields.newPassword')}
              autoComplete="new-password"
              hint={t('auth.hints.password')}
              error={errors.newPassword?.message}
              {...register('newPassword')}
            />
            <FormField
              id="confirmPassword"
              type="password"
              label={t('auth.fields.confirmPassword')}
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('common.working') : t('account.changePasswordSubmit')}
            </Button>
          </form>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{t('account.ticketsTitle')}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t('account.ticketsSubtitle')}</p>
          </div>
          <Link to="/booking/lookup" className="text-sm text-brand-700 hover:underline">
            {t('account.lookupLink')}
          </Link>
        </div>

        {ticketsLoading ? (
          <p className="mt-4 text-sm text-ink-muted">{t('common.loading')}</p>
        ) : tickets.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">{t('account.noTickets')}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {tickets.map((ticket) => (
              <li key={ticket.code} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold" dir="ltr">
                    {ticket.code}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {ticket.trip?.route?.name} · {formatDateTime(ticket.trip?.departureAt, i18n.language)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ticket.paid ? 'success' : 'warning'}>
                    {ticket.paid ? t('account.ticketPaid') : t('account.ticketDue')}
                  </Badge>
                  <span className="text-sm tabular-nums">
                    {formatMoney(ticket.payableAmount, i18n.language)}
                  </span>
                  <Link
                    to={`/booking/${ticket.code}?phone=${encodeURIComponent(ticket.passenger.phone)}`}
                    className="text-sm text-brand-700 hover:underline"
                  >
                    {t('account.openTicket')}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Alert tone="info" title={t('account.comingTitle')}>
        {t('account.comingBody')}
      </Alert>
    </div>
  );
}
