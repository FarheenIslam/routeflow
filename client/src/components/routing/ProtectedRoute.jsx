import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import FullPageLoader from '../ui/FullPageLoader.jsx';
import { useAuthStore } from '../../store/authStore.js';

/**
 * Wraps every signed-in area.
 * While the session is still being resolved we show a loader instead of
 * flashing the login page, and we remember where the user wanted to go.
 */
export default function ProtectedRoute() {
  const { t } = useTranslation();
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === 'unknown') {
    return <FullPageLoader label={t('common.loading')} />;
  }

  if (status !== 'authenticated') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}
