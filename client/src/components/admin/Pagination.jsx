import { useTranslation } from 'react-i18next';

import Button from '../ui/Button.jsx';

/** Prev/next + "Page 2 of 5" + total count. Hidden when there is one page. */
export default function Pagination({ pagination, onPageChange }) {
  const { t, i18n } = useTranslation('admin');
  const { page, totalPages, total } = pagination;
  const formattedTotal = new Intl.NumberFormat(i18n.language === 'bn' ? 'bn-BD' : 'en-GB').format(
    total,
  );

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
      <p>{t('pagination.total', { total: formattedTotal })}</p>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            {t('pagination.previous')}
          </Button>
          <span className="px-1 text-xs font-medium">
            {t('pagination.pageOf', { page, totalPages })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            {t('pagination.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
