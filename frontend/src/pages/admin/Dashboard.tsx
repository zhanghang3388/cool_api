import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Coins, Key, Users, ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { adminApi } from '@/api/admin';
import type { TodayStats, DailyData, ModelRanking, RequestLog } from '@/api/admin';

const BAR_COLORS = ['#00D4FF', '#00B4D8', '#0096C7', '#0077B6', '#006DA4', '#005E93', '#005082', '#004271', '#003560', '#002850'];

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
      background: 'rgba(22, 22, 42, 0.95)',
      border: '1px solid rgba(0, 212, 255, 0.15)',
      borderRadius: '10px',
      fontSize: '11px',
      fontFamily: 'JetBrains Mono, monospace',
      padding: '8px 12px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(12px)',
    },
    labelStyle: { color: '#8888A0', marginBottom: '4px' },
    cursor: { stroke: 'rgba(0, 212, 255, 0.2)', strokeWidth: 1 },
  };

  const DaysToggle = ({ value, onChange }: { value: 7 | 30; onChange: (d: 7 | 30) => void }) => (
    <div className="flex gap-0.5 bg-bg-primary/60 rounded-lg p-0.5">
      {([7, 30] as const).map(d => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`px-3 py-1 text-[10px] rounded-md font-display transition-all duration-200 ${
            value === d
              ? 'bg-accent/15 text-accent shadow-[0_0_8px_rgba(0,212,255,0.1)]'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {t(`admin.dashboard.days${d}`)}
        </button>
      ))}
    </div>
  );

  const cardConfigs = [
    { key: 'todayRequests', icon: BarChart3, color: '#00D4FF', bg: 'rgba(0, 212, 255, 0.08)', hasChange: true },
    { key: 'todayCost', icon: Coins, color: '#FFB800', bg: 'rgba(255, 184, 0, 0.08)', hasChange: true },
    { key: 'activeTokens', icon: Key, color: '#00E676', bg: 'rgba(0, 230, 118, 0.08)', hasChange: false },
    { key: 'onlineUsers', icon: Users, color: '#B388FF', bg: 'rgba(179, 136, 255, 0.08)', hasChange: false },
  ];

  const statValues = today ? [
    { value: today.today_requests.toLocaleString(), change: today.requests_change },
    { value: `$${(today.today_cost / 1_000_000).toFixed(2)}`, change: today.cost_change },
    { value: today.active_tokens.toLocaleString(), change: undefined },
    { value: today.online_users.toLocaleString(), change: undefined },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="w-5 h-5 text-accent" />
        <h1 className="text-2xl font-display font-bold">{t('admin.dashboard.title')}</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card animate-pulse h-[120px]" />
            ))
          : cardConfigs.map((cfg, i) => {
              const stat = statValues[i];
              if (!stat) return null;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={cfg.key}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className="card card-glow group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                      style={{ background: cfg.bg }}
                    >
                      <Icon className="w-4.5 h-4.5" style={{ color: cfg.color }} />
                    </div>
                    {cfg.hasChange && stat.change !== undefined && (
                      <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-display font-medium ${
                        stat.change >= 0
                          ? 'bg-success/10 text-success'
                          : 'bg-danger/10 text-danger'
                      }`}>
                        {stat.change >= 0
                          ? <ArrowUpRight className="w-3 h-3" />
                          : <ArrowDownRight className="w-3 h-3" />
                        }
                        {Math.abs(stat.change).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <p className="text-2xl font-display font-bold tracking-tight">{stat.value}</p>
                  <p className="text-[10px] text-text-secondary font-display uppercase tracking-wider mt-1">
                    {t(`admin.dashboard.${cfg.key}`)}
                  </p>
                </motion.div>
              );
            })}
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-sm font-semibold">{t('admin.dashboard.requestTrend')}</h3>
            <DaysToggle value={requestDays} onChange={setRequestDays} />
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={filteredDaily(requestDays)} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00D4FF" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#00D4FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(42, 42, 64, 0.6)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8888A0' }} tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#8888A0' }} axisLine={false} tickLine={false} />
              <Tooltip {...chartTooltipStyle} />
              <Area type="monotone" dataKey="requests" stroke="#00D4FF" fill="url(#reqGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#00D4FF', stroke: '#16162A', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-sm font-semibold">{t('admin.dashboard.costTrend')}</h3>
            <DaysToggle value={costDays} onChange={setCostDays} />
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={filteredDaily(costDays).map(d => ({ ...d, cost: d.cost / 1_000_000 }))} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFB800" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#FFB800" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(42, 42, 64, 0.6)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#8888A0' }} tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#8888A0' }} tickFormatter={v => `$${v}`} axisLine={false} tickLine={false} />
              <Tooltip {...chartTooltipStyle} formatter={(v: unknown) => [`$${Number(v).toFixed(4)}`, 'Cost']} />
              <Area type="monotone" dataKey="cost" stroke="#FFB800" fill="url(#costGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#FFB800', stroke: '#16162A', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Bottom row: Model ranking + Recent requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.4 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-sm font-semibold">{t('admin.dashboard.modelRanking')}</h3>
            <DaysToggle value={modelDays} onChange={loadModelRanking} />
          </div>
          {modelRanking.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-text-secondary">
              <p className="text-xs">{t('admin.dashboard.noData')}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, modelRanking.length * 36)}>
              <BarChart data={modelRanking} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(42, 42, 64, 0.6)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#8888A0' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="model" tick={{ fontSize: 10, fill: '#8888A0' }} width={130} axisLine={false} tickLine={false} />
                <Tooltip {...chartTooltipStyle} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>
                  {modelRanking.map((_, idx) => (
                    <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.4 }}
          className="card"
        >
          <h3 className="font-display text-sm font-semibold mb-5">{t('admin.dashboard.recentRequests')}</h3>
          {recentLogs.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-text-secondary">
              <p className="text-xs">{t('admin.dashboard.noData')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1.5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-text-secondary text-left">
                    <th className="pb-3 px-1.5 font-display font-medium text-[10px] uppercase tracking-wider">{t('admin.dashboard.model')}</th>
                    <th className="pb-3 px-1.5 font-display font-medium text-[10px] uppercase tracking-wider">{t('admin.dashboard.tokens')}</th>
                    <th className="pb-3 px-1.5 font-display font-medium text-[10px] uppercase tracking-wider">{t('admin.dashboard.cost')}</th>
                    <th className="pb-3 px-1.5 font-display font-medium text-[10px] uppercase tracking-wider">{t('admin.dashboard.status')}</th>
                    <th className="pb-3 px-1.5 font-display font-medium text-[10px] uppercase tracking-wider">{t('admin.dashboard.time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((log, i) => (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.65 + i * 0.03 }}
                      className="glass-row rounded-lg"
                    >
                      <td className="py-2.5 px-1.5 font-code truncate max-w-[140px]">{log.model}</td>
                      <td className="py-2.5 px-1.5 text-text-secondary tabular-nums">{log.total_tokens.toLocaleString()}</td>
                      <td className="py-2.5 px-1.5 text-accent-amber tabular-nums">${(log.cost / 1_000_000).toFixed(4)}</td>
                      <td className="py-2.5 px-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-display font-medium ${
                          log.status_code === 200
                            ? 'bg-success/10 text-success'
                            : 'bg-danger/10 text-danger'
                        }`}>
                          {log.status_code}
                        </span>
                      </td>
                      <td className="py-2.5 px-1.5 text-text-secondary whitespace-nowrap tabular-nums">
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
