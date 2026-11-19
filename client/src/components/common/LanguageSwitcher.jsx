import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, changeLanguage } from '../../i18n.js';

/**
 * Segmented language control. The choice is saved to localStorage, so it
 * survives refreshes, and <html lang> is updated for fonts and screen readers.
 */
export default function LanguageSwitcher({ className = '' }) {
  const { i18n } = useTranslation();
  const active = i18n.language?.startsWith('bn') ? 'bn' : 'en';

  return (
    <div
      role="group"
      aria-label="Language / ভাষা"
      className={`inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1 ${className}`}
    >
      {SUPPORTED_LANGUAGES.map((language) => {
        const isActive = active === language.code;
        return (
          <button
            key={language.code}
            type="button"
            onClick={() => changeLanguage(language.code)}
            aria-pressed={isActive}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
              isActive ? 'bg-brand-600 text-white' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {language.label}
          </button>
        );
      })}
    </div>
  );
}
