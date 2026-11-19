import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { roleHomePath, useAuthStore } from '../store/authStore.js';

export default function ForbiddenPage({ allowed = [] }) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);

  return (
    <div className="mx-auto max-w-xl py-10">
      <p className="text-sm font-semibold text-red-600">403</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t('forbidden.title')}</h1>
      <p className="mt-2 text-ink-muted">{t('forbidden.subtitle')}</p>

      {allowed.length > 0 && (
        <p className="mt-3 text-sm text-ink-muted">
          {t('forbidden.requires')}{' '}
          {allowed.map((role, index) => (
            <span key={role}>
              {index > 0 && ', '}
              <span className="font-medium text-ink">{t(`role.${role}`)}</span>
            </span>
          ))}
        </p>
      )}

      <Link
        to={user ? roleHomePath(user.role) : '/'}
        className="mt-6 inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
      >
        {t('forbidden.backHome')}
      </Link>
    </div>
  );
}
