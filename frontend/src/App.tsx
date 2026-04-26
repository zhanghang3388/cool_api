import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from '@/pages/Home';
import PricingPublic from '@/pages/PricingPublic';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import AdminLayout from '@/components/layout/AdminLayout';
import ClientLayout from '@/components/layout/ClientLayout';
import AdminDashboard from '@/pages/admin/Dashboard';
import UsersPage from '@/pages/admin/Users';
import ChannelsPage from '@/pages/admin/Channels';
import AdminBillingPage from '@/pages/admin/Billing';
import SettingsPage from '@/pages/admin/Settings';
import LogsPage from '@/pages/admin/Logs';
import PricingPage from '@/pages/admin/Pricing';
import AdminTokensPage from '@/pages/admin/Tokens';
import RateLimitsPage from '@/pages/admin/RateLimits';
import ClientDashboard from '@/pages/client/Dashboard';
import ApiKeysPage from '@/pages/client/ApiKeys';
import UsagePage from '@/pages/client/Usage';
import ClientBilling from '@/pages/client/Billing';
import DocsPage from '@/pages/client/Docs';
import PlaygroundPage from '@/pages/client/Playground';
import ProfilePage from '@/pages/client/Profile';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pricing" element={<PricingPublic />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Admin routes */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="channels" element={<ChannelsPage />} />
          <Route path="tokens" element={<AdminTokensPage />} />
          <Route path="rate-limits" element={<RateLimitsPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="billing" element={<AdminBillingPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Client routes */}
        <Route element={<ClientLayout />}>
          <Route path="/dashboard" element={<ClientDashboard />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/keys" element={<ApiKeysPage />} />
          <Route path="/usage" element={<UsagePage />} />
          <Route path="/billing" element={<ClientBilling />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/playground" element={<PlaygroundPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
