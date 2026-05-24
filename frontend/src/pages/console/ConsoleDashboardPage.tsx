import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  useUsageSummary,
  useDailyByModel,
  useGroupHealth,
  type GroupHealth,
  type GroupHealthStatus,
} from '@/hooks/useUsage';
import { useUserGroups } from '@/hooks/useUserGroups';
import { DailyByModelChart, GroupTabs } from '@/components/DailyByModelChart';

function formatYuan(cents: number): string {
  return `¥${(cents / 10000).toFixed(2)}`;
}

export default function ConsoleDashboardPage() {
  const { data: user } = useCurrentUser();
  const { data: summary, isLoading } = useUsageSummary();
  const { data: groups = [] } = useUserGroups();
  // null = "all groups" (server merges identical model names)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const { data: daily = [] } = useDailyByModel(7, selectedGroupId);
  const { data: health = [] } = useGroupHealth(60);

  if (!user) return null;

  const balance = (user.balance_cents / 10000).toFixed(2);

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-semibold">仪表盘</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-2">账户余额</p>
          <p className="text-2xl font-mono font-bold text-emerald-400">¥{balance}</p>
          <p className="text-[10px] text-gray-600 mt-2">
            不足时请到 <Link to="/console/topup" className="text-amber-400 hover:underline">用户钱包</Link> 页面补充
          </p>
        </div>
        <div className="stat-card rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-2">今日消耗</p>
          <p className="text-2xl font-mono font-bold text-amber-400">
            {summary ? formatYuan(summary.today_cost_cents) : isLoading ? '—' : '¥0.00'}
          </p>
          <p className="text-[10px] text-gray-600 mt-2">
            今日请求 {summary?.today_requests ?? 0} 次 · {summary?.today_tokens.toLocaleString() ?? 0} tokens
          </p>
        </div>
        <div className="stat-card rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-2">累计消耗</p>
          <p className="text-2xl font-mono font-bold text-gray-200">
            {summary ? formatYuan(summary.total_cost_cents) : isLoading ? '—' : '¥0.00'}
          </p>
          <p className="text-[10px] text-gray-600 mt-2">
            累计请求 {summary?.total_requests.toLocaleString() ?? 0} 次
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 stat-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <h3 className="text-sm font-medium text-gray-300">近 7 天分组用量</h3>
            <span className="text-[10px] text-gray-600 font-mono tracking-wider">tokens / day</span>
          </div>
          <p className="text-[10px] text-gray-500 mb-3">
            顶部按分组切换；下方按该分组下的模型展开 token 消耗。「全部分组」会把不同分组里同名的模型合并成一条线。
          </p>
          <GroupTabs groups={groups} value={selectedGroupId} onChange={setSelectedGroupId} />
          <div className="mt-3">
            <DailyByModelChart
              points={daily}
              emptyState={
                <span>
                  近 7 天还没有用量数据。先去
                  <Link to="/console/keys" className="mx-1 text-amber-400 hover:underline">创建令牌</Link>
                  发起请求吧。
                </span>
              }
            />
          </div>
        </div>

        <div className="stat-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-300">分组健康状态</h3>
            <span className="text-[10px] text-gray-600 font-mono">/ 1h</span>
          </div>
          <p className="text-[10px] text-gray-500 mb-3">
            最近 1 小时该分组下的请求成功率与延迟。30s 自动刷新。
          </p>
          <GroupHealthList items={health} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const STATUS_META: Record<GroupHealthStatus, { label: string; dot: string; text: string }> = {
  healthy: { label: '正常', dot: 'bg-emerald-500', text: 'text-emerald-400' },
  degraded: { label: '降级', dot: 'bg-amber-500', text: 'text-amber-400' },
  down: { label: '异常', dot: 'bg-rose-500', text: 'text-rose-400' },
  idle: { label: '空闲', dot: 'bg-gray-500', text: 'text-gray-500' },
};

function GroupHealthList({ items }: { items: GroupHealth[] }) {
  if (items.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-[11px] text-gray-500">
        近 1 小时没有请求记录
      </div>
    );
  }
  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin pr-1">
      {items.map((g) => {
        const meta = STATUS_META[g.status] ?? STATUS_META.idle;
        const successRate = g.total === 0 ? 0 : (g.success / g.total) * 100;
        return (
          <div
            key={g.group_id}
            className="rounded-lg border border-base-300 bg-base-200/40 p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-200 font-mono truncate" title={g.group_label}>
                {g.group_label || g.group_name || `#${g.group_id}`}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px]">
                <span className={`w-2 h-2 rounded-full ${meta.dot} pulse-dot`} />
                <span className={meta.text}>{meta.label}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-y-1 text-[10px] font-mono text-gray-400">
              <span>请求</span>
              <span className="text-right text-gray-200">{g.total.toLocaleString()}</span>
              <span>成功率</span>
              <span
                className={`text-right ${
                  successRate >= 95
                    ? 'text-emerald-400'
                    : successRate >= 70
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }`}
              >
                {g.total === 0 ? '—' : `${successRate.toFixed(1)}%`}
              </span>
              <span>平均延迟</span>
              <span className="text-right text-gray-200">
                {g.total === 0 ? '—' : `${g.avg_latency_ms} ms`}
              </span>
              {g.error > 0 && (
                <>
                  <span className="text-rose-400/80">错误</span>
                  <span className="text-right text-rose-400">{g.error}</span>
                </>
              )}
              {g.cached > 0 && (
                <>
                  <span className="text-cyan-400/80">缓存命中</span>
                  <span className="text-right text-cyan-400">{g.cached}</span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
