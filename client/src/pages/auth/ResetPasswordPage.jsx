import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import FormField from '../../components/ui/FormField.jsx';
import { authApi } from '../../services/auth.api.js';
import { createResetPasswordSchema } from '../../schemas/auth.schemas.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const { token } = useParams();

  const schema = useMemo(() => createResetPasswordSchema(t), [t]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState(null);

  async function onSubmit(values) {
    setFormError(null);
    try {
      await authApi.resetPassword(token, values.password);
      setDone(true);
    } catch (error) {
      const appliedToFields = applyServerErrors(error, setError);
      if (!appliedToFields) setFormError(errorMessage(error, t('errors.generic')));
    }
  }

  if (done) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t('auth.reset.successTitle')}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t('auth.reset.successBody')}</p>
        <Link
          to="/login"
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          {t('auth.reset.goToSignIn')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
        {t('auth.reset.title')}
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">{t('auth.reset.subtitle')}</p>

      {formError && (
        <Alert tone="error" className="mt-4">
          {formError}{' '}
          <Link to="/forgot-password" className="font-medium underline">
            {t('auth.forgot.title')}
          </Link>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 space-y-4">
        <FormField
          id="password"
          type="password"
          label={t('auth.fields.newPassword')}
          autoComplete="new-password"
          placeholder="••••••••"
          hint={t('auth.hints.password')}
          error={errors.password?.message}
          {...register('password')}
        />

        <FormField
          id="confirmPassword"
          type="password"
          label={t('auth.fields.confirmPassword')}
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t('common.working') : t('auth.reset.submit')}
        </Button>
      </form>
    </div>
  );
}
