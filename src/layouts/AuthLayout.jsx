import { Outlet } from 'react-router-dom';
import Brand from '../components/common/Brand.jsx';
import LanguageSwitcher from '../components/common/LanguageSwitcher.jsx';

/**
 * Login, register, forgot and reset pages share this shell: one narrow card,
 * brand at the top, language switch always reachable.
 */
export default function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Brand />
        <LanguageSwitcher />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-soft sm:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
