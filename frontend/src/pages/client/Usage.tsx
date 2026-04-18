import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import api from '@/api/client';

interface RequestLog {
  id: string;
  model: string;
  status_code: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  latency_ms: number;
  is_stream: boolean;
  created_at: string;
}

export default function UsagePage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<RequestLog[]>('/client/usage/logs', { params: { page, per_page: 20 } });
      setLogs(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);

  const totalCost = logs.reduce((sum, l) => sum + l.cost, 0);
  const totalTokens = logs.reduce((sum, l) => sum + l.total_tokens, 0);

  return (
    <div>
      <h1 className="text-2xl font-display font-bold mb-6">{t('client.usage.title')}</h1>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card card-glow">
          <p className="text-xs text-text-secondary font-display mb-1">{t('client.usage.pageTotalCost')}</p>
          <p className="text-2xl font-display font-bold text-accent-amber">${(totalCost / 1_000_000).toFixed(6)}</p>
        </div>
        <div className="card card-glow">
          <p className="text-xs text-text-secondary font-display mb-1">{t('client.usage.pageTotalTokens')}</p>
          <p className="text-2xl font-display font-bold text-accent">{totalTokens.toLocaleString()}</p>
        </div>
      </div>

      <div className="card overflow-hidden p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary font-display">
              <th className="px-3 py-3">{t('client.usage.time')}</th>
              <th className="px-3 py-3">{t('client.usage.model')}</th>
              <th className="px-3 py-3">{t('client.usage.status')}</th>
              <th className="px-3 py-3">{t('client.usage.tokens')}</th>
              <th className="px-3 py-3">{t('client.usage.cost')}</th>
              <th className="px-3 py-3">{t('client.usage.latency')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-text-secondary">{t('common.loading')}</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-text-secondary">{t('client.usage.noUsage')}</td></tr>
            ) : (
              logs.map((log, i) => (
                <motion.tr
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="glass-row border-b border-border/50"
                >
                  <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-code text-xs">{log.model}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-code ${log.status_code === 200 ? 'text-success' : 'text-danger'}`}>
                      {log.status_code}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-code text-xs">{log.total_tokens}</td>
                  <td className="px-3 py-2 font-code text-xs text-accent-amber">${(log.cost / 1_000_000).toFixed(6)}</td>
                  <td className="px-3 py-2 font-code text-xs">{log.latency_ms}ms</td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-2 mt-4">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-xs disabled:opacity-30">Prev</button>
        <span className="text-xs text-text-secondary font-code">Page {page}</span>
        <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 20} className="btn-secondary text-xs disabled:opacity-30">Next</button>
      </div>
    </div>
  );
}
