import { useState } from 'react';
import Spinner from '@/components/ui/Spinner';
import {
  useAdminOverview,
  useAdminDailyByModel,
  useProviderDistribution,
  useRecentRequests,
  type RecentRequest,
} from '@/hooks/useAdminStats';
import { useGroups } from '@/hooks/useGroups';
import { DailyByModelChart, GroupTabs } from '@/components/DailyByModelChart';

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
  return `¥${(cents / 10000).toFixed(2)}`;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function AdminDashboardPage() {
  const { data: overview } = useAdminOverview();
  const { data: providers = [] } = useProviderDistribution();
  const { data: recent = [], isLoading: recentLoading } = useRecentRequests(10);
  const { data: groups = [] } = useGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const { data: daily = [] } = useAdminDailyByModel(7, selectedGroupId);

  // Admin can see every group; only enabled ones are useful in the picker.
  const enabledGroups = groups.filter((g) => g.enabled);
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
          label="今日充值"
          value={overview ? formatYuan(overview.today_topup_cents) : '—'}
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
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <h3 className="text-sm font-medium text-gray-300">近 7 天分组用量</h3>
            <span className="text-[10px] text-gray-600 font-mono tracking-wider">tokens / day</span>
          </div>
          <p className="text-[10px] text-gray-500 mb-3">
            全站维度。顶部按分组切换；下方按该分组下的模型展开 token 消耗。「全部分组」会把不同分组里同名的模型合并成一条线。
          </p>
          <GroupTabs
            groups={enabledGroups}
            value={selectedGroupId}
            onChange={setSelectedGroupId}
          />
          <div className="mt-3">
            <DailyByModelChart
              points={daily}
              emptyState={<span>近 7 天还没有任何请求记录。</span>}
            />
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
