import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Brand from '../components/common/Brand.jsx';
import LanguageSwitcher from '../components/common/LanguageSwitcher.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import { roleHomePath, useAuthStore } from '../store/authStore.js';
import { toast } from '../store/toastStore.js';

/**
 * Shell for every signed-in area. Later phases add the sidebar navigation per
 * role; the top bar and session handling stay the same.
 */
export default function DashboardLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
      toast.success(t('auth.signedOut'));
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Brand to={user ? roleHomePath(user.role) : '/'} compact />

          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher className="hidden sm:inline-flex" />

            {user && (
              <div className="hidden items-center gap-2 md:flex">
                <span className="max-w-[14rem] truncate text-sm font-medium">{user.name}</span>
                <Badge tone="brand">{t(`role.${user.role}`)}</Badge>
              </div>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={handleLogout}
              disabled={signingOut}
            >
              {signingOut ? t('common.working') : t('auth.logout')}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
