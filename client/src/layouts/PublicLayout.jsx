import { Outlet } from 'react-router-dom';
import AppHeader from '../components/layout/AppHeader.jsx';
import AppFooter from '../components/layout/AppFooter.jsx';

/** Public shell: header, page content, footer. */
export default function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <AppFooter />
    </div>
  );
}
