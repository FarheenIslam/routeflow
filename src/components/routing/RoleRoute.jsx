import { Outlet } from 'react-router-dom';
import ForbiddenPage from '../../pages/ForbiddenPage.jsx';
import { useAuthStore } from '../../store/authStore.js';

/**
 * Role gate for a branch of the router.
 *
 *   <Route element={<RoleRoute allowed={['ADMIN']} />}> … </Route>
 *
 * A wrong role gets a clear 403 screen with a way back — not a blank page and
 * not a redirect loop. The server enforces the same rule on every endpoint.
 */
export default function RoleRoute({ allowed = [] }) {
  const user = useAuthStore((state) => state.user);

  if (!user || !allowed.includes(user.role)) {
    return <ForbiddenPage allowed={allowed} />;
  }

  return <Outlet />;
}
