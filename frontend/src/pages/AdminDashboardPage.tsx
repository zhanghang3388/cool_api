import Spinner from '@/components/ui/Spinner';
import {
  useAdminOverview,
  useProviderDistribution,
  useRecentRequests,
  useRequestsTrend,
  type RecentRequest,
} from '@/hooks/useAdminStats';

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-emerald-500',
  anthropic: 'bg-amber-500',
  google: 'bg-cyan-500',
  deepseek: 'bg-purple-500',
  unknown: 'bg-gray-500',
};

const STATUS_COLOR: Record<RecentRequest['status'], string> = {
  success: 'bg-emerald-500',
  cached: 'bg-cyan-500',
  error: 'bg-rose-500',
};

function formatYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function AdminDashboardPage() {
  const { data: overview } = useAdminOverview();
  const { data: trend = [] } = useRequestsTrend(7);
  const { data: providers = [] } = useProviderDistribution();
  const { data: recent = [], isLoading: recentLoading } = useRecentRequests(10);

  const maxRequests = Math.max(1, ...trend.map((p) => p.requests));
  const totalRequests = providers.reduce((acc, p) => acc + p.requests, 0);

  return (
    <div className="fade-in space-y-6">
      <h2 className="text-lg font-semibold">仪表盘</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="今日请求"
          value={overview ? overview.today_requests.toLocaleString() : '—'}
        />
        <StatCard
          label="今日 Token"
          value={overview ? formatCompact(overview.today_tokens) : '—'}
          accent="text-cyan-400"
        />
        <StatCard
          label="今日收入"
          value={overview ? formatYuan(overview.today_revenue_cents) : '—'}
          accent="text-emerald-400"
        />
        <StatCard
          label="活跃用户"
          value={overview ? overview.active_users_today.toLocaleString() : '—'}
          accent="text-amber-400"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 stat-card rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">请求趋势 (近 7 天)</h3>
          <div className="flex items-end gap-3 h-40">
            {trend.length === 0 && (
              <div className="flex-1 text-center text-xs text-gray-600 pt-16">暂无数据</div>
            )}
            {trend.map((p) => {
              const heightPct = (p.requests / maxRequests) * 100;
              return (
                <div key={p.day} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className="w-full bg-base-300 rounded-t relative overflow-hidden"
                    style={{ height: '140px' }}
                    title={`${p.requests.toLocaleString()} 请求 · ${formatYuan(p.cost_cents)}`}
                  >
                    <div
                      className="absolute bottom-0 w-full rounded-t bg-gradient-to-t from-amber-600 to-amber-400 transition-all duration-500"
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">
                    {formatDayLabel(p.day)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-3 text-[10px] text-gray-600 font-mono">
            <span>峰值 {maxRequests.toLocaleString()}</span>
            <span>
              合计 {trend.reduce((acc, p) => acc + p.requests, 0).toLocaleString()} 请求
            </span>
          </div>
        </div>

        <div className="stat-card rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">渠道协议分布 (今日)</h3>
          {totalRequests === 0 && (
            <p className="text-xs text-gray-600">暂无数据</p>
          )}
          <div className="space-y-4">
            {providers.map((item) => {
              const pct = (item.requests / totalRequests) * 100;
              const color = PROVIDER_COLORS[item.provider] ?? 'bg-gray-500';
              return (
                <div key={item.provider}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400 capitalize">{item.provider}</span>
                    <span className="font-mono text-gray-300">
                      {item.requests.toLocaleString()} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-base-300 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${color} rounded-full transition-all duration-700`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="stat-card rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-4">最近请求</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-base-300">
              <th className="text-left py-2 font-medium">时间</th>
              <th className="text-left py-2 font-medium">用户</th>
              <th className="text-left py-2 font-medium">模型</th>
              <th className="text-right py-2 font-medium">Token</th>
              <th className="text-right py-2 font-medium">费用</th>
              <th className="text-center py-2 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {recentLoading && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-600">
                  <Spinner className="mr-2" /> 加载中...
                </td>
              </tr>
            )}
            {!recentLoading && recent.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-600">
                  暂无请求记录
                </td>
              </tr>
            )}
            {recent.map((r) => (
              <tr
                key={r.id}
                className="border-b border-base-300/50 hover:bg-base-200/50 transition-colors"
              >
                <td className="py-2.5 font-mono text-gray-400">
                  {new Date(r.created_at).toLocaleTimeString('zh-CN')}
                </td>
                <td className="py-2.5 text-gray-300">{r.username}</td>
                <td className="py-2.5 font-mono text-amber-400/80">{r.model_name}</td>
                <td className="py-2.5 text-right font-mono text-gray-300">
                  {r.tokens.toLocaleString()}
                </td>
                <td className="py-2.5 text-right font-mono text-gray-300">
                  {formatYuan(r.total_cost_cents)}
                </td>
                <td className="py-2.5 text-center">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${STATUS_COLOR[r.status]}`}
                    title={r.status}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="stat-card rounded-xl p-5">
      <p className="text-xs text-gray-500 mb-2">{label}</p>
      <p className={`text-2xl font-mono font-bold ${accent ?? 'text-white'}`}>{value}</p>
    </div>
  );
}
