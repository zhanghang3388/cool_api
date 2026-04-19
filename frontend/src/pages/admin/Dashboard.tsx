import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Coins, Key, Users, ArrowUp, ArrowDown } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { adminApi, TodayStats, DailyData, ModelRanking, RequestLog } from '@/api/admin';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<TodayStats | null>(null);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [requestDays, setRequestDays] = useState<7 | 30>(7);
  const [costDays, setCostDays] = useState<7 | 30>(7);
  const [modelRanking, setModelRanking] = useState<ModelRanking[]>([]);
  const [modelDays, setModelDays] = useState<7 | 30>(7);
  const [recentLogs, setRecentLogs] = useState<RequestLog[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [todayRes, dailyRes, rankingRes, logsRes] = await Promise.all([
          adminApi.getTodayStats(),
          adminApi.getDailyStats(30),
          adminApi.getModelRanking(7),
          adminApi.getRecentLogs(10),
        ]);
        setToday(todayRes.data);
        setDaily(dailyRes.data);
        setModelRanking(rankingRes.data);
        setRecentLogs(logsRes.data);
      } catch { /* silently fail */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const loadModelRanking = useCallback(async (days: 7 | 30) => {
    setModelDays(days);
    try {
      const { data } = await adminApi.getModelRanking(days);
      setModelRanking(data);
    } catch { /* ignore */ }
  }, []);

  const filteredDaily = (days: number) => {
    if (days >= 30 || daily.length <= days) return daily;
    return daily.slice(-days);
  };

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

  const DaysToggle = ({ value, onChange }: { value: 7 | 30; onChange: (d: 7 | 30) => void }) => (
    <div className="flex gap-1">
      {([7, 30] as const).map(d => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`px-2 py-0.5 text-[10px] rounded font-display transition-colors ${
            value === d ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {t(`admin.dashboard.days${d}`)}
        </button>
      ))}
    </div>
  );

  const statCards = today ? [
    {
      label: t('admin.dashboard.todayRequests'),
      value: today.today_requests.toLocaleString(),
      icon: BarChart3,
      color: 'text-accent',
      change: today.requests_change,
    },
    {
      label: t('admin.dashboard.todayCost'),
      value: `$${(today.today_cost / 1_000_000).toFixed(2)}`,
      icon: Coins,
      color: 'text-accent-amber',
      change: today.cost_change,
    },
    {
      label: t('admin.dashboard.activeTokens'),
      value: today.active_tokens.toLocaleString(),
      icon: Key,
      color: 'text-success',
    },
    {
      label: t('admin.dashboard.onlineUsers'),
      value: today.online_users.toLocaleString(),
      icon: Users,
      color: 'text-accent',
    },
  ] : [];

  return (
    <div>
      <h1 className="text-2xl font-display font-bold mb-6">{t('admin.dashboard.title')}</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="card animate-pulse h-24" />)
          : statCards.map((stat, i) => (
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
                {'change' in stat && stat.change !== undefined && (
                  <div className={`flex items-center gap-1 mt-1 text-[10px] ${stat.change >= 0 ? 'text-success' : 'text-danger'}`}>
                    {stat.change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    <span>{Math.abs(stat.change).toFixed(1)}%</span>
                  </div>
                )}
              </motion.div>
            ))}
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-semibold">{t('admin.dashboard.requestTrend')}</h3>
            <DaysToggle value={requestDays} onChange={setRequestDays} />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={filteredDaily(requestDays)}>
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

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-semibold">{t('admin.dashboard.costTrend')}</h3>
            <DaysToggle value={costDays} onChange={setCostDays} />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={filteredDaily(costDays).map(d => ({ ...d, cost: d.cost / 1_000_000 }))}>
              <defs>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FFB800" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#FFB800" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A40" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8888A0' }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: '#8888A0' }} tickFormatter={v => `$${v}`} />
              <Tooltip {...chartTooltipStyle} formatter={(v: unknown) => [`$${Number(v).toFixed(4)}`, 'Cost']} />
              <Area type="monotone" dataKey="cost" stroke="#FFB800" fill="url(#costGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Bottom row: Model ranking + Recent requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-semibold">{t('admin.dashboard.modelRanking')}</h3>
            <DaysToggle value={modelDays} onChange={loadModelRanking} />
          </div>
          {modelRanking.length === 0 ? (
            <p className="text-xs text-text-secondary text-center py-8">{t('admin.dashboard.noData')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, modelRanking.length * 32)}>
              <BarChart data={modelRanking} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A40" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#8888A0' }} />
                <YAxis type="category" dataKey="model" tick={{ fontSize: 10, fill: '#8888A0' }} width={120} />
                <Tooltip {...chartTooltipStyle} />
                <Bar dataKey="count" fill="#00D4FF" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="card">
          <h3 className="font-display text-sm font-semibold mb-4">{t('admin.dashboard.recentRequests')}</h3>
          {recentLogs.length === 0 ? (
            <p className="text-xs text-text-secondary text-center py-8">{t('admin.dashboard.noData')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-text-secondary text-left border-b border-border">
                    <th className="pb-2 font-display font-medium">{t('admin.dashboard.model')}</th>
                    <th className="pb-2 font-display font-medium">{t('admin.dashboard.tokens')}</th>
                    <th className="pb-2 font-display font-medium">{t('admin.dashboard.cost')}</th>
                    <th className="pb-2 font-display font-medium">{t('admin.dashboard.status')}</th>
                    <th className="pb-2 font-display font-medium">{t('admin.dashboard.time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((log, i) => (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.55 + i * 0.03 }}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-2 font-code truncate max-w-[140px]">{log.model}</td>
                      <td className="py-2 text-text-secondary">{log.total_tokens.toLocaleString()}</td>
                      <td className="py-2 text-text-secondary">${(log.cost / 1_000_000).toFixed(4)}</td>
                      <td className="py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-display ${
                          log.status_code === 200 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                        }`}>
                          {log.status_code}
                        </span>
                      </td>
                      <td className="py-2 text-text-secondary whitespace-nowrap">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
