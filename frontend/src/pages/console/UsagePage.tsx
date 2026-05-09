import { useState } from 'react';
import Spinner from '@/components/ui/Spinner';
import {
  useUsageLogs,
  useUsageSummary,
  type RequestStatus,
  type UsageLogsFilter,
} from '@/hooks/useUsage';

const PAGE_SIZE = 20;

const STATUS_STYLE: Record<RequestStatus, { label: string; className: string }> = {
  success: { label: '成功', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  cached: { label: '缓存', className: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  error: { label: '失败', className: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
};

function formatCost(cents: number): string {
  return `¥${(cents / 100).toFixed(4)}`;
}

export default function UsagePage() {
  const [page, setPage] = useState(1);
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<RequestStatus | ''>('');

  const filter: UsageLogsFilter = {
    page,
    page_size: PAGE_SIZE,
    model: model.trim() || undefined,
    status: status || undefined,
  };
  const { data, isLoading, isFetching } = useUsageLogs(filter);
  const { data: summary } = useUsageSummary();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const resetPage = () => setPage(1);

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-semibold">用量日志</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard
          label="今日请求"
          value={summary ? summary.today_requests.toLocaleString() : '—'}
        />
        <SummaryCard
          label="今日消耗"
          value={summary ? formatCost(summary.today_cost_cents) : '—'}
          accent="text-amber-400"
        />
        <SummaryCard
          label="今日 Token"
          value={summary ? summary.today_tokens.toLocaleString() : '—'}
          accent="text-cyan-400"
        />
        <SummaryCard
          label="累计请求"
          value={summary ? summary.total_requests.toLocaleString() : '—'}
        />
        <SummaryCard
          label="累计消耗"
          value={summary ? formatCost(summary.total_cost_cents) : '—'}
          accent="text-emerald-400"
        />
        <SummaryCard
          label="累计 Token"
          value={summary ? summary.total_tokens.toLocaleString() : '—'}
          accent="text-cyan-400"
        />
      </div>

      <div className="stat-card rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-500">模型名</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={resetPage}
            onKeyDown={(e) => {
              if (e.key === 'Enter') resetPage();
            }}
            placeholder="gpt-4o"
            className="bg-base-200 border border-base-300 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 focus:outline-none focus:border-amber-500 w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-500">状态</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as RequestStatus | '');
              resetPage();
            }}
            className="bg-base-200 border border-base-300 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
          >
            <option value="">全部</option>
            <option value="success">成功</option>
            <option value="cached">缓存</option>
            <option value="error">失败</option>
          </select>
        </div>
        {(model || status) && (
          <button
            onClick={() => {
              setModel('');
              setStatus('');
              resetPage();
            }}
            className="ml-auto text-xs text-gray-400 hover:text-gray-200"
          >
            清除筛选
          </button>
        )}
      </div>

      <div className="stat-card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-base-300 bg-base-200/50">
              <th className="text-left p-4 font-medium">时间</th>
              <th className="text-left p-4 font-medium">模型</th>
              <th className="text-right p-4 font-medium">输入</th>
              <th className="text-right p-4 font-medium">输出</th>
              <th className="text-right p-4 font-medium">缓存</th>
              <th className="text-right p-4 font-medium">延迟</th>
              <th className="text-right p-4 font-medium">费用</th>
              <th className="text-center p-4 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-500 text-xs">
                  <Spinner className="mr-2" /> 加载中...
                </td>
              </tr>
            )}
            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-500 text-xs">
                  暂无记录
                </td>
              </tr>
            )}
            {data?.items.map((r) => {
              const style = STATUS_STYLE[r.status];
              return (
                <tr
                  key={r.id}
                  className="border-b border-base-300/50 hover:bg-base-200/30 transition-colors"
                >
                  <td className="p-4 text-xs text-gray-500 font-mono">
                    {new Date(r.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td className="p-4 font-mono text-xs text-amber-400/90">{r.model_name}</td>
                  <td className="p-4 text-right font-mono text-gray-300 text-xs">
                    {r.prompt_tokens.toLocaleString()}
                  </td>
                  <td className="p-4 text-right font-mono text-gray-300 text-xs">
                    {r.completion_tokens.toLocaleString()}
                  </td>
                  <td className="p-4 text-right font-mono text-gray-500 text-xs">
                    {r.cached_tokens.toLocaleString()}
                  </td>
                  <td className="p-4 text-right font-mono text-gray-500 text-xs">
                    {r.latency_ms}ms
                  </td>
                  <td className="p-4 text-right font-mono text-gray-300 text-xs">
                    {formatCost(r.total_cost_cents)}
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] border ${style.className}`}
                      title={r.error_message ?? undefined}
                    >
                      {style.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div>
          共 {data?.total ?? 0} 条
          {isFetching && !isLoading && <span className="ml-2 text-gray-600">刷新中...</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded bg-base-200 border border-base-300 text-gray-300 hover:bg-base-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            上一页
          </button>
          <span className="font-mono text-gray-400">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1 rounded bg-base-200 border border-base-300 text-gray-300 hover:bg-base-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="stat-card rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-mono font-bold ${accent ?? 'text-gray-200'}`}>{value}</p>
    </div>
  );
}
