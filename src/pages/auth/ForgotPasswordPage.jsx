import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import FormField from '../../components/ui/FormField.jsx';
import { authApi } from '../../services/auth.api.js';
import { createForgotPasswordSchema } from '../../schemas/auth.schemas.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const schema = useMemo(() => createForgotPasswordSchema(t), [t]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const [sent, setSent] = useState(null);
  const [formError, setFormError] = useState(null);

  async function onSubmit(values) {
    setFormError(null);
    try {
      const response = await authApi.forgotPassword(values.email);
      setSent({ message: response.message, devResetUrl: response.data?.devResetUrl ?? null });
    } catch (error) {
      const appliedToFields = applyServerErrors(error, setError);
      if (!appliedToFields) setFormError(errorMessage(error, t('errors.generic')));
    }
  }

  if (sent) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t('auth.forgot.sentTitle')}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t('auth.forgot.sentBody')}</p>

        {sent.devResetUrl && (
          <Alert tone="warning" title={t('auth.forgot.devTitle')} className="mt-5">
            <p>{t('auth.forgot.devBody')}</p>
            <a
              href={sent.devResetUrl}
              className="mt-2 inline-block break-all font-medium text-amber-900 underline"
            >
              {t('auth.forgot.openLink')}
            </a>
          </Alert>
        )}

        <Link
          to="/login"
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          {t('auth.forgot.backToSignIn')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
        {t('auth.forgot.title')}
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">{t('auth.forgot.subtitle')}</p>

      {formError && (
        <Alert tone="error" className="mt-4">
          {formError}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 space-y-4">
        <FormField
          id="email"
          type="email"
          label={t('auth.fields.email')}
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t('common.working') : t('auth.forgot.submit')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          {t('auth.forgot.backToSignIn')}
        </Link>
      </p>
    </div>
  );
}
