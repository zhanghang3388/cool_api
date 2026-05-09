import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  Layers,
  Coins,
  Users,
  Database,
  CreditCard,
  Settings,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { logout, type UserInfo } from '@/lib/auth';
import { CURRENT_USER_KEY } from '@/hooks/useCurrentUser';
import { useNavigate } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: '仪表盘', icon: LayoutDashboard },
  { to: '/admin/channels', label: '渠道管理', icon: Server },
  { to: '/admin/groups', label: '分组管理', icon: Layers },
  { to: '/admin/models', label: '模型价格', icon: Coins },
  { to: '/admin/users', label: '用户管理', icon: Users },
  { to: '/admin/cache', label: '缓存管理', icon: Database },
  { to: '/admin/payment', label: '支付配置', icon: CreditCard },
  { to: '/admin/settings', label: '系统设置', icon: Settings },
];

export default function Sidebar({ user }: { user: UserInfo }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    queryClient.setQueryData(CURRENT_USER_KEY, null);
    navigate('/login', { replace: true });
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-base-100 border-r border-base-300 flex flex-col z-40">
      <div className="p-5 border-b border-base-300">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center">
            <span className="text-black font-bold text-sm">AG</span>
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-wide">AetherGate</h1>
            <p className="text-[10px] text-gray-500 font-mono">AI GATEWAY v0.1</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin'}
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
            <div className="text-[10px] text-gray-600 font-mono">
              {user.role === 'admin' ? '管理员' : '用户'}
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
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-glow" />
          <span>系统运行正常</span>
        </div>
      </div>
    </aside>
  );
}
