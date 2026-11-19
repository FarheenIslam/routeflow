import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import FormField from '../../components/ui/FormField.jsx';
import { createLoginSchema } from '../../schemas/auth.schemas.js';
import { roleHomePath, useAuthStore } from '../../store/authStore.js';
import { toast } from '../../store/toastStore.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);

  const schema = useMemo(() => createLoginSchema(t), [t]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { identifier: '', password: '' } });

  const [formError, setFormError] = useState(null);

  async function onSubmit(values) {
    setFormError(null);
    try {
      const user = await login(values);
      toast.success(t('auth.login.welcome', { name: user.name }));

      // Return the user where they were headed, otherwise to their role's home.
      const destination = location.state?.from || roleHomePath(user.role);
      navigate(destination, { replace: true });
    } catch (error) {
      const appliedToFields = applyServerErrors(error, setError);
      if (!appliedToFields) setFormError(errorMessage(error, t('errors.generic')));
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
        {t('auth.login.title')}
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">{t('auth.login.subtitle')}</p>

      {formError && (
        <Alert tone="error" className="mt-4">
          {formError}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 space-y-4">
        <FormField
          id="identifier"
          label={t('auth.fields.identifier')}
          autoComplete="username"
          placeholder="you@example.com"
          error={errors.identifier?.message}
          {...register('identifier')}
        />

        <FormField
          id="password"
          type="password"
          label={t('auth.fields.password')}
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            {t('auth.login.forgot')}
          </Link>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t('common.working') : t('auth.login.submit')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        {t('auth.login.noAccount')}{' '}
        <Link to="/register" className="font-medium text-brand-700 hover:underline">
          {t('auth.login.createOne')}
        </Link>
      </p>
    </div>
  );
}
