import { Routes, Route, Navigate } from 'react-router-dom';
import AuthGuard, { RequireRole } from './components/AuthGuard';
import AdminLayout from './components/AdminLayout';
import ConsoleLayout from './components/ConsoleLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import GroupsPage from './pages/GroupsPage';
import ModelsPage from './pages/ModelsPage';
import ChannelsPage from './pages/ChannelsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import UsersPage from './pages/UsersPage';
import CachePage from './pages/CachePage';
import PaymentConfigPage from './pages/PaymentConfigPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import ConsoleDashboardPage from './pages/console/ConsoleDashboardPage';
import ProfilePage from './pages/console/ProfilePage';
import KeysPage from './pages/console/KeysPage';
import UsagePage from './pages/console/UsagePage';
import ModelsPricingPage from './pages/console/ModelsPricingPage';
import TopUpPage from './pages/console/TopUpPage';
import RoleRedirect from './components/RoleRedirect';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<AuthGuard />}>
        <Route index element={<RoleRedirect />} />

        {/* Admin area */}
        <Route element={<RequireRole role="admin" />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="channels" element={<ChannelsPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="models" element={<ModelsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="cache" element={<CachePage />} />
            <Route path="payment" element={<PaymentConfigPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
        </Route>

        {/* User console area (any authenticated user, including admins) */}
        <Route path="console" element={<ConsoleLayout />}>
          <Route index element={<ConsoleDashboardPage />} />
          <Route path="keys" element={<KeysPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="models" element={<ModelsPricingPage />} />
          <Route path="topup" element={<TopUpPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
