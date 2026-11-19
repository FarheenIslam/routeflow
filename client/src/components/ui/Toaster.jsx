import { useTranslation } from 'react-i18next';

import { useToastStore } from '../../store/toastStore.js';

const TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  danger: 'border-red-200 bg-red-50 text-red-900',
  brand: 'border-brand-200 bg-brand-50 text-brand-700',
};

/** Renders the toast stack in a live region so screen readers announce it. */
export default function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  const { t } = useTranslation('common');

  if (toasts.length === 0) return null;

  return (
    <div
      className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
      role="status"
      aria-live="polite"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 shadow-soft ${TONES[item.tone] ?? TONES.brand}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{item.title}</p>
              {item.description && <p className="mt-0.5 text-sm opacity-90">{item.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label={t('common.closeNotification')}
              className="rounded p-1 text-current/70 transition-colors hover:text-current"
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
                <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
