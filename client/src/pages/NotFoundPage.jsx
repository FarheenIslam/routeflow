import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-start px-4 py-20 sm:px-6">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {t('notFound.title')}
      </h1>
      <p className="mt-2 text-base text-ink-muted">{t('notFound.subtitle')}</p>
      <Link
        to="/"
        className="mt-6 inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
      >
        {t('notFound.backHome')}
      </Link>
    </div>
  );
}
