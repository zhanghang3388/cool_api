import { NavLink, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Key,
  Activity,
  Coins,
  Wallet,
  UserCircle,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout, type UserInfo } from '@/lib/auth';
import { CURRENT_USER_KEY } from '@/hooks/useCurrentUser';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/console', label: '仪表盘', icon: LayoutDashboard },
  { to: '/console/keys', label: '令牌', icon: Key },
  { to: '/console/usage', label: '用量日志', icon: Activity },
  { to: '/console/models', label: '模型价格', icon: Coins },
  { to: '/console/topup', label: '充值', icon: Wallet },
  { to: '/console/profile', label: '个人资料', icon: UserCircle },
];

export default function ConsoleSidebar({ user }: { user: UserInfo }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    queryClient.setQueryData(CURRENT_USER_KEY, null);
    navigate('/login', { replace: true });
  };

  const balance = (user.balance_cents / 100).toFixed(2);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-base-100 border-r border-base-300 flex flex-col z-40">
      <div className="p-5 border-b border-base-300">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
            <span className="text-black font-bold text-sm">AG</span>
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-wide">AetherGate</h1>
            <p className="text-[10px] text-gray-500 font-mono">USER CONSOLE</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-b border-base-300">
        <p className="text-[10px] text-gray-500 mb-1">账户余额</p>
        <p className="font-mono text-lg text-emerald-400">¥{balance}</p>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/console'}
            className={({ isActive }) =>
              cn(
                'w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-all',
                isActive
                  ? 'nav-item-active text-amber-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-base-200'
              )
            }
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-base-300 space-y-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-xs text-gray-300 truncate">{user.username}</div>
            <div className="text-[10px] text-gray-600 font-mono truncate">
              {user.email || '未绑定邮箱'}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-rose-400 transition-colors"
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
