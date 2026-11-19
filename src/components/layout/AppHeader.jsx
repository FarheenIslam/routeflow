import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Brand from '../common/Brand.jsx';
import LanguageSwitcher from '../common/LanguageSwitcher.jsx';
import { roleHomePath, useAuthStore } from '../../store/authStore.js';

/**
 * Public header. It shows "Sign in / Create account" to visitors and a single
 * "Dashboard" link once a session exists — never the dashboard links themselves,
 * so a passenger never sees an admin door to knock on.
 */
export default function AppHeader() {
  const { t } = useTranslation();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const signedIn = status === 'authenticated' && Boolean(user);

  return (
    <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Brand />

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher className="hidden sm:inline-flex" />

          {signedIn ? (
            <Link
              to={roleHomePath(user.role)}
              className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              {t('nav.dashboard')}
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink sm:inline-flex"
              >
                {t('nav.signIn')}
              </Link>
              <Link
                to="/register"
                className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                {t('nav.register')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
