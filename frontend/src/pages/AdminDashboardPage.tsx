import { useState } from 'react';
import Spinner from '@/components/ui/Spinner';
import {
  useAdminOverview,
  useAdminDailyByModel,
  useProviderDistribution,
  useRecentRequests,
  useActiveUsers,
  useTopUsers,
  useRecentTopUps,
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

// Per-request fees are tiny (the unit is 1/10000 yuan), so 2 decimals collapse
// almost everything to ¥0.00. Show the full 4-decimal resolution instead.
function formatYuanPrecise(cents: number): string {
  return `¥${(cents / 10000).toFixed(4)}`;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Compact relative time for the recent-activity / recent-topup lists.
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

const METHOD_LABEL: Record<string, string> = {
  alipay: '支付宝',
  wxpay: '微信',
  wechat: '微信',
  manual: '手动',
};

export default function AdminDashboardPage() {
  const { data: overview } = useAdminOverview();
  const { data: providers = [] } = useProviderDistribution();
  const { data: recent = [], isLoading: recentLoading } = useRecentRequests(10);
  const { data: groups = [] } = useGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const { data: daily = [] } = useAdminDailyByModel(7, selectedGroupId);
  const { data: activeUsers = [], isLoading: activeLoading } = useActiveUsers(8);
  const { data: topUsers = [], isLoading: topLoading } = useTopUsers(7, 8);
  const { data: recentTopUps = [], isLoading: topUpLoading } = useRecentTopUps(8);

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 最近活跃用户 */}
        <div className="stat-card rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">最近活跃用户</h3>
          <div className="space-y-2.5">
            {activeLoading && (
              <div className="py-6 text-center text-gray-600 text-xs">
                <Spinner className="mr-2" /> 加载中...
              </div>
            )}
            {!activeLoading && activeUsers.length === 0 && (
              <div className="py-6 text-center text-gray-600 text-xs">暂无数据</div>
            )}
            {activeUsers.map((u) => (
              <div
                key={u.user_id}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-gray-300 truncate mr-2">{u.username}</span>
                <span className="flex items-center gap-2 shrink-0 font-mono text-gray-500">
                  <span>{u.requests.toLocaleString()} 次</span>
                  <span className="text-gray-600">{timeAgo(u.last_active)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 用户使用排行榜 */}
        <div className="stat-card rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">
            用户使用排行榜{' '}
            <span className="text-[10px] text-gray-600 font-normal">近 7 天 · 消费</span>
          </h3>
          <div className="space-y-2.5">
            {topLoading && (
              <div className="py-6 text-center text-gray-600 text-xs">
                <Spinner className="mr-2" /> 加载中...
              </div>
            )}
            {!topLoading && topUsers.length === 0 && (
              <div className="py-6 text-center text-gray-600 text-xs">暂无数据</div>
            )}
            {topUsers.map((u, i) => (
              <div
                key={u.user_id}
                className="flex items-center justify-between text-xs"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-4 text-center font-mono ${
                      i < 3 ? 'text-amber-400' : 'text-gray-600'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="text-gray-300 truncate">{u.username}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0 font-mono">
                  <span className="text-emerald-400">{formatYuan(u.cost_cents)}</span>
                  <span className="text-gray-600">{formatCompact(u.tokens)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 最近充值 */}
        <div className="stat-card rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">最近充值</h3>
          <div className="space-y-2.5">
            {topUpLoading && (
              <div className="py-6 text-center text-gray-600 text-xs">
                <Spinner className="mr-2" /> 加载中...
              </div>
            )}
            {!topUpLoading && recentTopUps.length === 0 && (
              <div className="py-6 text-center text-gray-600 text-xs">暂无数据</div>
            )}
            {recentTopUps.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-gray-300 truncate">{t.username}</span>
                  <span className="text-[10px] text-gray-600 shrink-0">
                    {METHOD_LABEL[t.method] ?? t.method}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0 font-mono">
                  <span className="text-emerald-400">
                    {formatYuan(t.amount_cents)}
                    {t.bonus_cents > 0 && (
                      <span className="text-amber-400/70">
                        {' '}
                        +{formatYuan(t.bonus_cents)}
                      </span>
                    )}
                  </span>
                  <span className="text-gray-600">{timeAgo(t.created_at)}</span>
                </span>
              </div>
            ))}
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
                  {new Date(r.created_at).toLocaleString('zh-CN')}
                </td>
                <td className="py-2.5 text-gray-300">{r.username}</td>
                <td className="py-2.5 font-mono text-amber-400/80">{r.model_name}</td>
                <td className="py-2.5 text-right font-mono text-gray-300">
                  {r.tokens.toLocaleString()}
                </td>
                <td className="py-2.5 text-right font-mono text-gray-300">
                  {formatYuanPrecise(r.total_cost_cents)}
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
