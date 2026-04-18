import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Key, GitBranch, Activity, BarChart3, Coins } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTranslation } from 'react-i18next';
import { adminApi } from '@/api/admin';
import api from '@/api/client';

interface StatCard {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}

interface DailyData {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
}

interface Overview {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  active_users: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<StatCard[]>([]);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    async function load() {
      try {
        const [, keysRes, channelsRes, overviewRes, dailyRes] = await Promise.all([
          adminApi.listUsers(1, 1),
          adminApi.listProviderKeys(),
          adminApi.listChannels(),
          api.get<Overview>('/admin/stats/overview'),
          api.get<DailyData[]>('/admin/stats/daily'),
        ]);

        const ov = overviewRes.data;
        setStats([
          { label: t('admin.dashboard.totalRequests'), value: ov.total_requests.toLocaleString(), icon: BarChart3, color: 'text-accent' },
          { label: t('admin.dashboard.totalTokens'), value: ov.total_tokens.toLocaleString(), icon: Activity, color: 'text-success' },
          { label: t('admin.dashboard.totalRevenue'), value: `$${(ov.total_cost / 1_000_000).toFixed(2)}`, icon: Coins, color: 'text-accent-amber' },
          { label: t('admin.dashboard.activeUsers'), value: ov.active_users, icon: Users, color: 'text-accent' },
          { label: t('admin.dashboard.providerKeys'), value: keysRes.data.length, icon: Key, color: 'text-accent-amber' },
          { label: t('admin.dashboard.channels'), value: channelsRes.data.length, icon: GitBranch, color: 'text-success' },
        ]);

        setDaily(dailyRes.data.map(d => ({
          ...d,
          cost: d.cost / 1_000_000,
        })));
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const chartTooltipStyle = {
    contentStyle: {
      background: '#16162A',
      border: '1px solid #2A2A40',
      borderRadius: '8px',
      fontSize: '12px',
      fontFamily: 'JetBrains Mono, monospace',
    },
    labelStyle: { color: '#8888A0' },
  };

  return (
    <div>
      <h1 className="text-2xl font-display font-bold mb-6">{t('admin.dashboard.title')}</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="card animate-pulse h-24" />)
          : stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="card card-glow"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-text-secondary font-display uppercase tracking-wider">{stat.label}</span>
                  <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                </div>
                <p className="text-xl font-display font-bold">{stat.value}</p>
              </motion.div>
            ))}
      </div>

      {/* Charts */}
      {daily.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card"
          >
            <h3 className="font-display text-sm font-semibold mb-4">{t('admin.dashboard.requests30d')}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A40" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8888A0' }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: '#8888A0' }} />
                <Tooltip {...chartTooltipStyle} />
                <Area type="monotone" dataKey="requests" stroke="#00D4FF" fill="url(#reqGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="card"
          >
            <h3 className="font-display text-sm font-semibold mb-4">{t('admin.dashboard.revenue30d')}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFB800" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#FFB800" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A40" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8888A0' }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: '#8888A0' }} tickFormatter={v => `$${v}`} />
                <Tooltip {...chartTooltipStyle} formatter={(v: unknown) => [`$${Number(v).toFixed(4)}`, 'Revenue']} />
                <Area type="monotone" dataKey="cost" stroke="#FFB800" fill="url(#costGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      )}
    </div>
  );
}
