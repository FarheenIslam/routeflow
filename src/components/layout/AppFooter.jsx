import { useTranslation } from 'react-i18next';
import { site } from '../../config/site.js';

// Computed once per page load instead of on every render.
const CURRENT_YEAR = new Date().getFullYear();

export default function AppFooter() {
  const { t } = useTranslation();

  return (
    <footer className="no-print border-t border-line bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-ink-muted sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-ink">
            {t('brand.name')} · {CURRENT_YEAR}
          </p>
          <p>{t('footer.builtWith')}</p>
        </div>
        <div className="space-y-1 md:max-w-sm md:text-right">
          <p>{t('footer.note')}</p>
          <p dir="ltr">{site.supportPhone}</p>
        </div>
      </div>
    </footer>
  );
}
