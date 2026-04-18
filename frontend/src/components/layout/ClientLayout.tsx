import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import {
  LayoutDashboard, Key, BarChart3, CreditCard, BookOpen,
  Terminal, ChevronLeft, ChevronRight, LogOut, Zap, ShieldCheck
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/keys', icon: Key, label: 'API Keys' },
  { to: '/usage', icon: BarChart3, label: 'Usage' },
  { to: '/billing', icon: CreditCard, label: 'Billing' },
  { to: '/docs', icon: BookOpen, label: 'Docs' },
  { to: '/playground', icon: Terminal, label: 'Playground' },
];

export default function ClientLayout() {
  const { user, isAuthenticated, isAdmin, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  if (!isAuthenticated()) return <Navigate to="/login" replace />;

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
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
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
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          ))}

          {isAdmin() && (
            <NavLink
              to="/admin"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-accent-amber hover:bg-accent-amber/10 transition-colors"
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              {!collapsed && <span>Admin Panel</span>}
            </NavLink>
          )}
        </nav>

        <div className="border-t border-border p-2 space-y-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary w-full transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger/10 w-full transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </motion.aside>

      <main className="flex-1 overflow-y-auto bg-bg-primary">
        <header className="sticky top-0 z-10 flex items-center justify-between h-14 px-6 border-b border-border bg-bg-primary/80 backdrop-blur-md">
          <h2 className="font-display text-sm text-text-secondary">Client Portal</h2>
          <div className="flex items-center gap-4">
            <span className="text-xs font-code text-accent-amber">
              Balance: ${((user?.balance ?? 0) / 1_000_000).toFixed(4)}
            </span>
            <span className="text-xs text-text-secondary font-code">{user?.username}</span>
          </div>
        </header>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
