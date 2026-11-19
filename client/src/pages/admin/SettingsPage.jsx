import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import FormField from '../../components/ui/FormField.jsx';
import SelectField from '../../components/ui/SelectField.jsx';
import PageHeader from '../../components/admin/PageHeader.jsx';
import { adminApi } from '../../services/admin.api.js';
import { createSettingsFormSchema } from '../../schemas/admin.schemas.js';
import { toast } from '../../store/toastStore.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

const defaultValues = {
  cancellationPolicy: {
    freeCancelHours: 24,
    halfRefundHours: 2,
    halfRefundPercent: 50,
    noRefundPercent: 0,
  },
  booking: {
    holdMinutes: 2,
    maxSeatsPerBooking: 6,
    advanceBookingDays: 60,
    passengerSelfCancel: false,
  },
  notifications: { emailEnabled: true, smsEnabled: false, mockMode: true },
  payments: { onlineEnabled: false, sandbox: true },
  localization: { defaultLanguage: 'bn', ticketLanguages: ['bn', 'en'] },
  ticket: { headerText: '', footerText: '', termsEn: '', termsBn: '' },
};

function Section({ title, description, children }) {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && <p className="mt-1 text-xs text-ink-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function CheckboxRow({ id, label, hint, ...props }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2.5 text-sm">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-line"
        {...props}
      />
      <span>
        {label}
        {hint && <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>}
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation('admin');
  const schema = useMemo(() => createSettingsFormSchema(t), [t]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues });

  useEffect(() => {
    let alive = true;
    adminApi
      .settings
      .get()
      .then((response) => {
        if (!alive) return;
        const settings = response.data.settings;
        reset({
          cancellationPolicy: settings.cancellationPolicy,
          booking: settings.booking,
          notifications: settings.notifications,
          payments: settings.payments,
          localization: {
            defaultLanguage: settings.localization?.defaultLanguage ?? 'bn',
            ticketLanguages: settings.localization?.ticketLanguages ?? ['bn', 'en'],
          },
          ticket: settings.ticket,
        });
      })
      .catch((problem) => {
        if (alive) setLoadError(problem.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reset]);

  async function onSubmit(values) {
    setFormError(null);
    try {
      await adminApi.settings.update(values);
      toast.success(t('messages.settingsSaved'));
    } catch (error) {
      applyServerErrors(error, setError);
      setFormError(errorMessage(error, t('messages.failed')));
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
        <Card className="p-6 text-sm text-ink-muted">{t('settings.loading')}</Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
        <Alert tone="error">{loadError}</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      {formError && <Alert tone="error">{formError}</Alert>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Section title={t('settings.cancellationTitle')} description={t('settings.cancellationHint')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FormField
              id="freeCancelHours"
              type="number"
              min="0"
              label={t('settings.freeCancelHours')}
              error={errors.cancellationPolicy?.freeCancelHours?.message}
              {...register('cancellationPolicy.freeCancelHours')}
            />
            <FormField
              id="halfRefundHours"
              type="number"
              min="0"
              label={t('settings.halfRefundHours')}
              error={errors.cancellationPolicy?.halfRefundHours?.message}
              {...register('cancellationPolicy.halfRefundHours')}
            />
            <FormField
              id="halfRefundPercent"
              type="number"
              min="0"
              max="100"
              label={t('settings.halfRefundPercent')}
              error={errors.cancellationPolicy?.halfRefundPercent?.message}
              {...register('cancellationPolicy.halfRefundPercent')}
            />
            <FormField
              id="noRefundPercent"
              type="number"
              min="0"
              max="100"
              label={t('settings.noRefundPercent')}
              error={errors.cancellationPolicy?.noRefundPercent?.message}
              {...register('cancellationPolicy.noRefundPercent')}
            />
          </div>
        </Section>

        <Section title={t('settings.bookingTitle')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FormField
              id="holdMinutes"
              type="number"
              min="1"
              max="15"
              label={t('settings.holdMinutes')}
              hint={t('settings.holdMinutesHint')}
              error={errors.booking?.holdMinutes?.message}
              {...register('booking.holdMinutes')}
            />
            <FormField
              id="maxSeatsPerBooking"
              type="number"
              min="1"
              max="20"
              label={t('settings.maxSeats')}
              error={errors.booking?.maxSeatsPerBooking?.message}
              {...register('booking.maxSeatsPerBooking')}
            />
            <FormField
              id="advanceBookingDays"
              type="number"
              min="1"
              max="365"
              label={t('settings.advanceDays')}
              error={errors.booking?.advanceBookingDays?.message}
              {...register('booking.advanceBookingDays')}
            />
            <div className="flex items-end pb-2">
              <CheckboxRow
                id="passengerSelfCancel"
                label={t('settings.selfCancel')}
                {...register('booking.passengerSelfCancel')}
              />
            </div>
          </div>
        </Section>

        <Section title={t('settings.notificationsTitle')} description={t('settings.notificationsHint')}>
          <div className="grid gap-3 sm:grid-cols-3">
            <CheckboxRow id="emailEnabled" label={t('settings.emailEnabled')} {...register('notifications.emailEnabled')} />
            <CheckboxRow id="smsEnabled" label={t('settings.smsEnabled')} {...register('notifications.smsEnabled')} />
            <CheckboxRow
              id="mockMode"
              label={t('settings.mockMode')}
              hint={t('settings.mockModeHint')}
              {...register('notifications.mockMode')}
            />
          </div>
        </Section>

        <Section title={t('settings.paymentsTitle')} description={t('settings.paymentsHint')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckboxRow id="onlineEnabled" label={t('settings.onlineEnabled')} {...register('payments.onlineEnabled')} />
            <CheckboxRow id="sandbox" label={t('settings.sandbox')} {...register('payments.sandbox')} />
          </div>
        </Section>

        <Section title={t('settings.localizationTitle')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="defaultLanguage"
              label={t('settings.defaultLanguage')}
              error={errors.localization?.defaultLanguage?.message}
              {...register('localization.defaultLanguage')}
            >
              <option value="bn">{t('settings.bangla')}</option>
              <option value="en">{t('settings.english')}</option>
            </SelectField>

            <fieldset>
              <legend className="text-sm font-medium">{t('settings.ticketLanguages')}</legend>
              <div className="mt-2 flex gap-4">
                <CheckboxRow
                  id="ticketLangBn"
                  label={t('settings.bangla')}
                  value="bn"
                  {...register('localization.ticketLanguages')}
                />
                <CheckboxRow
                  id="ticketLangEn"
                  label={t('settings.english')}
                  value="en"
                  {...register('localization.ticketLanguages')}
                />
              </div>
              {errors.localization?.ticketLanguages?.message && (
                <p className="mt-1.5 text-xs font-medium text-red-600">
                  {errors.localization.ticketLanguages.message}
                </p>
              )}
            </fieldset>
          </div>
        </Section>

        <Section title={t('settings.ticketTitle')} description={t('settings.ticketHint')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="headerText"
              label={t('settings.headerText')}
              error={errors.ticket?.headerText?.message}
              {...register('ticket.headerText')}
            />
            <FormField
              id="footerText"
              label={t('settings.footerText')}
              error={errors.ticket?.footerText?.message}
              {...register('ticket.footerText')}
            />
            <FormField
              id="termsEn"
              label={t('settings.termsEn')}
              error={errors.ticket?.termsEn?.message}
              {...register('ticket.termsEn')}
            />
            <FormField
              id="termsBn"
              label={t('settings.termsBn')}
              error={errors.ticket?.termsBn?.message}
              {...register('ticket.termsBn')}
            />
          </div>
        </Section>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('actions.working') : t('actions.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
