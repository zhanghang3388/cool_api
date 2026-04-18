import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Key, BarChart3, CreditCard, Zap } from 'lucide-react';
import api from '@/api/client';
import { useAuthStore } from '@/stores/auth';

export default function ClientDashboard() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [keyCount, setKeyCount] = useState(0);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/client/keys'),
      api.get('/client/usage/logs', { params: { page: 1, per_page: 5 } }),
    ]).then(([keysRes, logsRes]) => {
      setKeyCount(keysRes.data.length);
      setRecentLogs(logsRes.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const totalTokens = recentLogs.reduce((s, l) => s + l.total_tokens, 0);
  const totalCost = recentLogs.reduce((s, l) => s + l.cost, 0);

  const cards = [
    { label: t('client.dashboard.balance'), value: `$${((user?.balance ?? 0) / 1_000_000).toFixed(4)}`, icon: CreditCard, color: 'text-accent-amber' },
    { label: t('client.dashboard.apiKeys'), value: keyCount, icon: Key, color: 'text-accent' },
    { label: t('client.dashboard.recentTokens'), value: totalTokens.toLocaleString(), icon: Zap, color: 'text-success' },
    { label: t('client.dashboard.recentCost'), value: `$${(totalCost / 1_000_000).toFixed(6)}`, icon: BarChart3, color: 'text-accent' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-display font-bold mb-6">
        {t('client.dashboard.welcome')} <span className="text-accent">{user?.username}</span>
      </h1>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="card animate-pulse h-28" />)
          : cards.map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="card card-glow"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-text-secondary font-display">{card.label}</span>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
                <p className="text-2xl font-display font-bold">{card.value}</p>
              </motion.div>
            ))}
      </div>

      {/* Recent activity */}
      <h2 className="font-display text-sm font-semibold mb-3 text-text-secondary">{t('client.dashboard.recentRequests')}</h2>
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary font-display">
              <th className="px-4 py-3">{t('client.dashboard.model')}</th>
              <th className="px-4 py-3">{t('client.dashboard.tokens')}</th>
              <th className="px-4 py-3">{t('client.dashboard.cost')}</th>
              <th className="px-4 py-3">{t('client.dashboard.time')}</th>
            </tr>
          </thead>
          <tbody>
            {recentLogs.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-text-secondary">{t('client.dashboard.noRequests')}</td></tr>
            ) : (
              recentLogs.map((log: any, i: number) => (
                <motion.tr
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-row border-b border-border/50"
                >
                  <td className="px-4 py-2 font-code text-xs">{log.model}</td>
                  <td className="px-4 py-2 font-code text-xs">{log.total_tokens}</td>
                  <td className="px-4 py-2 font-code text-xs text-accent-amber">${(log.cost / 1_000_000).toFixed(6)}</td>
                  <td className="px-4 py-2 text-xs text-text-secondary">{new Date(log.created_at).toLocaleString()}</td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
