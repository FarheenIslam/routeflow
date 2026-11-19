import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function BusMark({ className = 'size-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5V15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M5 9.5h14" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8.5" cy="17.5" r="1.6" fill="currentColor" />
      <circle cx="15.5" cy="17.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** Brand lock-up: mark + name (+ tagline unless compact). */
export default function Brand({ to = '/', compact = false, className = '' }) {
  const { t } = useTranslation();

  return (
    <Link to={to} className={`flex min-w-0 items-center gap-3 ${className}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-soft">
        <BusMark />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-base font-semibold tracking-tight">
          {t('brand.name')}
        </span>
        {!compact && (
          <span className="hidden truncate text-xs text-ink-muted sm:block">
            {t('brand.tagline')}
          </span>
        )}
      </span>
    </Link>
  );
}
