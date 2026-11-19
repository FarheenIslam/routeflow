import { Route, Routes } from 'react-router-dom';

import AuthLayout from '../layouts/AuthLayout.jsx';
import AdminLayout from '../layouts/AdminLayout.jsx';
import DashboardLayout from '../layouts/DashboardLayout.jsx';
import PublicLayout from '../layouts/PublicLayout.jsx';
import ProtectedRoute from '../components/routing/ProtectedRoute.jsx';
import RoleRoute from '../components/routing/RoleRoute.jsx';

import HomePage from '../pages/public/HomePage.jsx';
import TripResultsPage from '../pages/public/TripResultsPage.jsx';
import SeatSelectionPage from '../pages/public/SeatSelectionPage.jsx';
import PassengerDetailsPage from '../pages/public/PassengerDetailsPage.jsx';
import TicketPage from '../pages/public/TicketPage.jsx';
import TicketLookupPage from '../pages/public/TicketLookupPage.jsx';
import AccountPage from '../pages/public/AccountPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import LoginPage from '../pages/auth/LoginPage.jsx';
import RegisterPage from '../pages/auth/RegisterPage.jsx';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage.jsx';
import ResetPasswordPage from '../pages/auth/ResetPasswordPage.jsx';
import DriverDashboardPage from '../pages/roles/DriverDashboardPage.jsx';

import AdminDashboardPage from '../pages/admin/AdminDashboardPage.jsx';
import BusesPage from '../pages/admin/BusesPage.jsx';
import DriversPage from '../pages/admin/DriversPage.jsx';
import CancellationsPage from '../pages/admin/CancellationsPage.jsx';
import ReportsPage from '../pages/admin/ReportsPage.jsx';
import RoutesPage from '../pages/admin/RoutesPage.jsx';
import TripsPage from '../pages/admin/TripsPage.jsx';
import CountersPage from '../pages/admin/CountersPage.jsx';
import UsersPage from '../pages/admin/UsersPage.jsx';
import SettingsPage from '../pages/admin/SettingsPage.jsx';
import CounterDashboardPage from '../pages/roles/CounterDashboardPage.jsx';

/**
 * Route structure
 *
 * PublicLayout   → anything a visitor can see
 * AuthLayout     → sign in / sign up / password recovery
 * ProtectedRoute → requires a valid session (redirects to /login)
 * RoleRoute      → requires one of the listed roles (otherwise a 403 page)
 *
 * The admin area has its own full-width layout with a sidebar. Counter and
 * driver dashboards keep the shared layout; the counter one is live since Phase 6.
 */
export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="trips" element={<TripResultsPage />} />
        <Route path="trips/:id/seats" element={<SeatSelectionPage />} />
        <Route path="booking/lookup" element={<TicketLookupPage />} />
        <Route path="booking/:tripId/passenger" element={<PassengerDetailsPage />} />
        <Route path="booking/:code" element={<TicketPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Authentication */}
      <Route element={<AuthLayout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password/:token" element={<ResetPasswordPage />} />
      </Route>

      {/* Signed-in areas */}
      <Route element={<ProtectedRoute />}>
        {/* Admin panel — ADMIN only, sidebar layout */}
        <Route element={<RoleRoute allowed={['ADMIN']} />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="buses" element={<BusesPage />} />
            <Route path="drivers" element={<DriversPage />} />
            <Route path="routes" element={<RoutesPage />} />
            <Route path="trips" element={<TripsPage />} />
            <Route path="cancellations" element={<CancellationsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="counters" element={<CountersPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route element={<DashboardLayout />}>
          <Route path="account" element={<AccountPage />} />

          <Route element={<RoleRoute allowed={['COUNTER', 'ADMIN']} />}>
            <Route path="counter" element={<CounterDashboardPage />} />
          </Route>

          <Route element={<RoleRoute allowed={['DRIVER']} />}>
            <Route path="driver" element={<DriverDashboardPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
