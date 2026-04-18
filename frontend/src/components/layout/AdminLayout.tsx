import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, GitBranch, Shield, FileText,
  CreditCard, Settings, ChevronLeft, ChevronRight, LogOut, Zap, DollarSign, KeyRound
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import LangSwitch from '@/components/ui/LangSwitch';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, key: 'nav.dashboard' },
  { to: '/admin/users', icon: Users, key: 'nav.users' },
  { to: '/admin/tokens', icon: KeyRound, key: 'nav.tokens' },
  { to: '/admin/channels', icon: GitBranch, key: 'nav.channels' },
  { to: '/admin/rate-limits', icon: Shield, key: 'nav.rateLimits' },
  { to: '/admin/logs', icon: FileText, key: 'nav.logs' },
  { to: '/admin/billing', icon: CreditCard, key: 'nav.billing' },
  { to: '/admin/pricing', icon: DollarSign, key: 'nav.pricing' },
  { to: '/admin/settings', icon: Settings, key: 'nav.settings' },
];

export default function AdminLayout() {
  const { user, isAdmin, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useTranslation();

  if (!isAdmin()) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex h-screen overflow-hidden">
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="flex flex-col border-r border-border bg-bg-secondary shrink-0"
      >
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
          <Zap className="w-5 h-5 text-accent shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="font-display text-sm font-bold text-accent whitespace-nowrap overflow-hidden"
              >
                COOL API
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex-1 py-3 space-y-1 px-2 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, key }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {t(key)}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-2 space-y-1">
          {!collapsed && <div className="px-3 py-1"><LangSwitch /></div>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary w-full transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && <span>{t('nav.collapse')}</span>}
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger/10 w-full transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{t('nav.logout')}</span>}
          </button>
        </div>
      </motion.aside>

      <main className="flex-1 overflow-y-auto bg-bg-primary">
        <header className="sticky top-0 z-10 flex items-center justify-between h-14 px-6 border-b border-border bg-bg-primary/80 backdrop-blur-md">
          <h2 className="font-display text-sm text-text-secondary">{t('nav.adminPanel')}</h2>
          <span className="text-xs text-text-secondary font-code">{user?.username}</span>
        </header>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
