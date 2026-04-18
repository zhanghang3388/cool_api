import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from '@/pages/Home';
import PricingPublic from '@/pages/PricingPublic';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import AdminLayout from '@/components/layout/AdminLayout';
import ClientLayout from '@/components/layout/ClientLayout';
import AdminDashboard from '@/pages/admin/Dashboard';
import UsersPage from '@/pages/admin/Users';
import ProviderKeysPage from '@/pages/admin/ProviderKeys';
import ChannelsPage from '@/pages/admin/Channels';
import AdminBillingPage from '@/pages/admin/Billing';
import SettingsPage from '@/pages/admin/Settings';
import LogsPage from '@/pages/admin/Logs';
import PricingPage from '@/pages/admin/Pricing';
import ClientDashboard from '@/pages/client/Dashboard';
import ApiKeysPage from '@/pages/client/ApiKeys';
import UsagePage from '@/pages/client/Usage';
import ClientBilling from '@/pages/client/Billing';
import DocsPage from '@/pages/client/Docs';
import PlaygroundPage from '@/pages/client/Playground';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="card">
      <h1 className="text-lg font-display">{title}</h1>
      <p className="text-text-secondary text-sm mt-2">Coming soon...</p>
    </div>
  );
}

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
          <Route path="provider-keys" element={<ProviderKeysPage />} />
          <Route path="channels" element={<ChannelsPage />} />
          <Route path="rate-limits" element={<Placeholder title="Rate Limits" />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="billing" element={<AdminBillingPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Client routes */}
        <Route element={<ClientLayout />}>
          <Route path="/dashboard" element={<ClientDashboard />} />
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
