import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes.jsx';
import Toaster from './components/ui/Toaster.jsx';
import { useAuthStore } from './store/authStore.js';

/**
 * App composes providers only.
 * On mount we ask the API who we are: the JWT is in an httpOnly cookie, so the
 * browser cannot read it — the server is the only source of truth.
 */
export default function App() {
  const fetchMe = useAuthStore((state) => state.fetchMe);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  return (
    <>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      <Toaster />
    </>
  );
}
