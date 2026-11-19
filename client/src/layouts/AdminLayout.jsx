import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Brand from '../components/common/Brand.jsx';
import LanguageSwitcher from '../components/common/LanguageSwitcher.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import { useAuthStore } from '../store/authStore.js';
import { toast } from '../store/toastStore.js';

const ICONS = {
  dashboard: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  buses: 'M6 17V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11M6 11h12M8 21v-2M16 21v-2M6 17h12',
  drivers: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 20a7 7 0 0 1 14 0',
  routes: 'M7 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7 8v3a3 3 0 0 0 3 3h4a3 3 0 0 1 3 3',
  trips: 'M8 3v4M16 3v4M4 9h16M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9',
  refunds: 'M3 7h18v10H3zM7 12h.01M17 12h.01M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  reports: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  counters: 'M4 10h16M6 10V6h12v4M5 10v8h14v-8M9 22v-4h6v4',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 6M17 20a6 6 0 0 0-2-4.5',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
};

const NAV_ITEMS = [
  { to: '/admin', end: true, labelKey: 'nav.dashboard', icon: 'dashboard' },
  { to: '/admin/buses', labelKey: 'nav.buses', icon: 'buses' },
  { to: '/admin/drivers', labelKey: 'nav.drivers', icon: 'drivers' },
  { to: '/admin/routes', labelKey: 'nav.routes', icon: 'routes' },
  { to: '/admin/trips', labelKey: 'nav.trips', icon: 'trips' },
  { to: '/admin/cancellations', labelKey: 'nav.cancellations', icon: 'refunds' },
  { to: '/admin/counters', labelKey: 'nav.counters', icon: 'counters' },
  { to: '/admin/users', labelKey: 'nav.users', icon: 'users' },
  { to: '/admin/reports', labelKey: 'nav.reports', icon: 'reports' },
  { to: '/admin/settings', labelKey: 'nav.settings', icon: 'settings' },
];

function Icon({ name, className = 'size-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

function SidebarContent({ onNavigate, onLogout, signingOut }) {
  const { t } = useTranslation(['admin', 'common']);
  const user = useAuthStore((state) => state.user);

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Brand to="/admin" compact />

      <nav aria-label={t('admin:title')} className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-ink-muted hover:bg-canvas hover:text-ink'
              }`
            }
          >
            <Icon name={item.icon} className="size-[18px]" />
            {t(`admin:${item.labelKey}`)}
          </NavLink>
        ))}
      </nav>

      <div className="rounded-lg border border-line bg-canvas/60 p-3">
        <p className="truncate text-sm font-medium">{user?.name}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <Badge tone="brand">{t('common:role.ADMIN')}</Badge>
          <NavLink
            to="/account"
            onClick={onNavigate}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            {t('admin:accountLink')}
          </NavLink>
        </div>
        <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={onLogout} disabled={signingOut}>
          {signingOut ? t('common:common.working') : t('common:auth.logout')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Admin shell: a persistent sidebar on desktop, a slide-over on phones. It is a
 * separate layout from DashboardLayout because the admin area needs full width
 * and its own navigation, not the public header.
 */
export default function AdminLayout() {
  const { t } = useTranslation(['admin', 'common']);
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
      toast.success(t('common:auth.signedOut'));
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="no-print sticky top-0 hidden h-dvh overflow-y-auto border-r border-line bg-surface lg:block">
        <SidebarContent
          onLogout={handleLogout}
          signingOut={signingOut}
          onNavigate={() => setDrawerOpen(false)}
        />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg p-2 text-ink-muted hover:bg-canvas hover:text-ink"
              aria-label={t('admin:openMenu')}
              aria-expanded={drawerOpen}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            </button>
            <Brand to="/admin" compact />
          </div>
          <LanguageSwitcher />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t('admin:closeMenu')}
            className="absolute inset-0 h-full w-full bg-ink/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative z-10 h-full w-72 max-w-[85vw] border-r border-line bg-surface shadow-soft">
            <SidebarContent
              onNavigate={() => setDrawerOpen(false)}
              onLogout={handleLogout}
              signingOut={signingOut}
            />
          </div>
        </div>
      )}
    </div>
  );
}
