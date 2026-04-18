import { useEffect, useState } from 'react';
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
  error_message: string | null;
  created_at: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<RequestLog[]>('/admin/stats/logs', { params: { page, per_page: 50 } });
      setLogs(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);

  return (
    <div>
      <h1 className="text-2xl font-display font-bold mb-6">Request Logs</h1>

      <div className="card overflow-hidden p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary font-display">
              <th className="px-3 py-3">Time</th>
              <th className="px-3 py-3">Model</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Tokens</th>
              <th className="px-3 py-3">Cost</th>
              <th className="px-3 py-3">Latency</th>
              <th className="px-3 py-3">Stream</th>
              <th className="px-3 py-3">Error</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-text-secondary">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-text-secondary">No logs yet</td></tr>
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
                  <td className="px-3 py-2 font-code text-xs">
                    <span className="text-text-secondary">{log.prompt_tokens}</span>
                    <span className="text-text-secondary mx-1">/</span>
                    <span>{log.completion_tokens}</span>
                  </td>
                  <td className="px-3 py-2 font-code text-xs text-accent-amber">
                    ${(log.cost / 1_000_000).toFixed(6)}
                  </td>
                  <td className="px-3 py-2 font-code text-xs">{log.latency_ms}ms</td>
                  <td className="px-3 py-2 text-xs">{log.is_stream ? 'SSE' : 'Sync'}</td>
                  <td className="px-3 py-2 text-xs text-danger truncate max-w-[200px]">{log.error_message || '-'}</td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-2 mt-4">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-xs disabled:opacity-30">Prev</button>
        <span className="text-xs text-text-secondary font-code">Page {page}</span>
        <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 50} className="btn-secondary text-xs disabled:opacity-30">Next</button>
      </div>
    </div>
  );
}
