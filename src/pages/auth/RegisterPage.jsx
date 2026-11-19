import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Alert from '../../components/ui/Alert.jsx';
import Button from '../../components/ui/Button.jsx';
import FormField from '../../components/ui/FormField.jsx';
import { createRegisterSchema } from '../../schemas/auth.schemas.js';
import { useAuthStore } from '../../store/authStore.js';
import { toast } from '../../store/toastStore.js';
import { applyServerErrors, errorMessage } from '../../utils/formErrors.js';

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const registerUser = useAuthStore((state) => state.register);

  const schema = useMemo(() => createRegisterSchema(t), [t]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', phone: '', password: '', confirmPassword: '' },
  });

  const [formError, setFormError] = useState(null);

  async function onSubmit(values) {
    setFormError(null);
    try {
      // confirmPassword is a UI-only field; the API only needs these four.
      const user = await registerUser({
        name: values.name,
        email: values.email,
        phone: values.phone,
        password: values.password,
      });
      toast.success(t('auth.register.created'), user.email);
      navigate('/account', { replace: true });
    } catch (error) {
      const appliedToFields = applyServerErrors(error, setError);
      if (!appliedToFields) setFormError(errorMessage(error, t('errors.generic')));
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
        {t('auth.register.title')}
      </h1>
      <p className="mt-1.5 text-sm text-ink-muted">{t('auth.register.subtitle')}</p>

      {formError && (
        <Alert tone="error" className="mt-4">
          {formError}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 space-y-4">
        <FormField
          id="name"
          label={t('auth.fields.name')}
          autoComplete="name"
          placeholder="Rahim Uddin"
          error={errors.name?.message}
          {...register('name')}
        />

        <FormField
          id="email"
          type="email"
          label={t('auth.fields.email')}
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <FormField
          id="phone"
          type="tel"
          inputMode="numeric"
          label={t('auth.fields.phone')}
          autoComplete="tel"
          placeholder="01712345678"
          hint={t('auth.hints.phone')}
          error={errors.phone?.message}
          {...register('phone')}
        />

        <FormField
          id="password"
          type="password"
          label={t('auth.fields.password')}
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
          {isSubmitting ? t('common.working') : t('auth.register.submit')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        {t('auth.register.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          {t('auth.register.signIn')}
        </Link>
      </p>
    </div>
  );
}
