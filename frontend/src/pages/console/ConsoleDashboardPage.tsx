import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  useUsageSummary,
  useDailyByModel,
  useGroupHealth,
  type GroupHealth,
  type GroupHealthStatus,
  type HealthBucket,
} from '@/hooks/useUsage';
import { useUserGroups } from '@/hooks/useUserGroups';
import { DailyByModelChart, GroupTabs } from '@/components/DailyByModelChart';

function formatYuan(cents: number): string {
  return `¥${(cents / 10000).toFixed(2)}`;
}

const WINDOWS = [
  { minutes: 5, label: '5m' },
  { minutes: 60, label: '1h' },
  { minutes: 1440, label: '24h' },
] as const;

type WindowMinutes = (typeof WINDOWS)[number]['minutes'];

export default function ConsoleDashboardPage() {
  const { data: user } = useCurrentUser();
  const { data: summary, isLoading } = useUsageSummary();
  const { data: groups = [] } = useUserGroups();
  // null = "all groups" (server merges identical model names)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const { data: daily = [] } = useDailyByModel(7, selectedGroupId);

  const [healthWindow, setHealthWindow] = useState<WindowMinutes>(60);
  const { data: health = [] } = useGroupHealth(healthWindow);

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
          <div className="flex items-center justify-between mb-1 gap-2">
            <h3 className="text-sm font-medium text-gray-300">分组健康状态</h3>
            <WindowSelector value={healthWindow} onChange={setHealthWindow} />
          </div>
          <p className="text-[10px] text-gray-500 mb-3">
            最近 {windowLabel(healthWindow)} 各分组的成功率、p95 延迟与错误时间分布。30s 自动刷新，点击卡片查看错误日志。
          </p>
          <GroupHealthList items={health} windowMinutes={healthWindow} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function windowLabel(m: WindowMinutes): string {
  if (m < 60) return `${m} 分钟`;
  if (m < 1440) return `${m / 60} 小时`;
  return `${m / 1440} 天`;
}

function WindowSelector({
  value,
  onChange,
}: {
  value: WindowMinutes;
  onChange: (m: WindowMinutes) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-base-300 bg-base-200/40 p-0.5 text-[10px] font-mono">
      {WINDOWS.map((w) => (
        <button
          key={w.minutes}
          onClick={() => onChange(w.minutes)}
          className={`px-2 py-0.5 rounded transition-colors ${
            value === w.minutes
              ? 'bg-amber-500/20 text-amber-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_META: Record<
  GroupHealthStatus,
  { label: string; badge: string; dot: string }
> = {
  healthy: {
    label: '正常',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  degraded: {
    label: '降级',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  down: {
    label: '异常',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400',
  },
  idle: {
    label: '空闲',
    badge: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    dot: 'bg-gray-500',
  },
};

// Map a success-rate percentage onto the red→yellow→green hue ramp. Lightness
// is kept high (58%) so the number stays legible against the dark card.
function hslForPct(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  return `hsl(${clamped * 1.2} 70% 58%)`;
}

function relativeMinutes(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.round(diffMs / 60_000));
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  if (m < 1440) return `${Math.round(m / 60)} 小时前`;
  return `${Math.round(m / 1440)} 天前`;
}

function GroupHealthList({
  items,
  windowMinutes,
}: {
  items: GroupHealth[];
  windowMinutes: WindowMinutes;
}) {
  if (items.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-[11px] text-gray-500 text-center px-2">
        当前账号没有可访问的分组。请联系管理员开通。
      </div>
    );
  }
  return (
    <div className="space-y-2.5 max-h-[400px] overflow-y-auto scrollbar-thin pr-1">
      {items.map((g) => (
        <GroupHealthCard key={g.group_id} g={g} windowMinutes={windowMinutes} />
      ))}
    </div>
  );
}

function GroupHealthCard({
  g,
  windowMinutes,
}: {
  g: GroupHealth;
  windowMinutes: WindowMinutes;
}) {
  const meta = STATUS_META[g.status] ?? STATUS_META.idle;
  const hasTraffic = g.total > 0;
  const successRate = hasTraffic ? (g.success / g.total) * 100 : 0;
  // Build the drill-down link. Restrict to error rows in the same window so
  // the user lands directly on the failures the card is flagging.
  const fromIso = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const drilldown = `/console/usage?group_id=${g.group_id}${
    g.error > 0 ? `&status=error&from=${encodeURIComponent(fromIso)}` : ''
  }`;
  return (
    <Link
      to={drilldown}
      className="block rounded-xl border border-base-300 bg-base-200/40 p-4 hover:border-amber-500/30 hover:bg-base-200/70 hover:-translate-y-0.5 transition-all duration-300"
      title="查看该分组的请求日志"
    >
      {/* header: group name + pill status badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-200 font-mono truncate" title={g.group_label}>
          {g.group_label || g.group_name || `#${g.group_id}`}
        </span>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium shrink-0 ${meta.badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} pulse-dot`} />
          {meta.label}
        </span>
      </div>

      {/* headline success-rate readout, hue-coded by value */}
      <div className="mt-3 flex items-end justify-between">
        <span className="text-[9px] uppercase tracking-widest text-gray-500">
          成功率 · {windowLabel(windowMinutes)}
        </span>
        <div className="flex items-baseline gap-0.5">
          {hasTraffic ? (
            <>
              <span
                className="text-2xl font-bold tabular-nums leading-none"
                style={{ color: hslForPct(successRate) }}
              >
                {successRate.toFixed(1)}
              </span>
              <span
                className="text-sm font-semibold leading-none"
                style={{ color: hslForPct(successRate) }}
              >
                %
              </span>
            </>
          ) : (
            <span className="text-2xl font-bold tabular-nums leading-none text-gray-600">
              —
            </span>
          )}
        </div>
      </div>

      <HealthTimeline buckets={g.buckets} />

      {/* latency metric pair */}
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <MetricBox label="平均延迟" value={hasTraffic ? g.avg_latency_ms : null} />
        <MetricBox label="P95" value={hasTraffic ? g.p95_latency_ms : null} />
      </div>

      {/* secondary stats — only render the buckets that carry signal */}
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-gray-500">
        <span>
          请求 <span className="text-gray-300">{g.total.toLocaleString()}</span>
        </span>
        {g.error > 0 && (
          <span className="text-rose-400/80">
            错误 <span className="text-rose-300">{g.error}</span>
          </span>
        )}
        {g.cached > 0 && (
          <span className="text-cyan-400/80">
            缓存 <span className="text-cyan-300">{g.cached}</span>
          </span>
        )}
        {g.last_error_at && (
          <span className="text-rose-400/70">
            最近错误 {relativeMinutes(g.last_error_at)}
          </span>
        )}
      </div>
    </Link>
  );
}

function MetricBox({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-base-300/50 bg-base-200/60 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-gray-100">
        {value == null ? (
          <span className="text-gray-600">—</span>
        ) : (
          <>
            {value}
            <span className="ml-0.5 text-[10px] font-normal text-gray-500">ms</span>
          </>
        )}
      </div>
    </div>
  );
}

// Dual-encoded status history: bar height encodes severity, color reinforces
// it. Each bucket is collapsed to a discrete status from its traffic/errors.
type TimelineKind = 'operational' | 'degraded' | 'failed' | 'empty';

const TL_HEIGHT: Record<TimelineKind, number> = {
  operational: 100,
  degraded: 60,
  failed: 32,
  empty: 14,
};
const TL_COLOR: Record<TimelineKind, string> = {
  operational: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  failed: 'bg-rose-500',
  empty: 'bg-base-300',
};

function bucketKind(b: HealthBucket): TimelineKind {
  if (b.total === 0) return 'empty';
  if (b.error === b.total) return 'failed';
  if (b.error > 0) return 'degraded';
  return 'operational';
}

function HealthTimeline({ buckets }: { buckets: HealthBucket[] }) {
  if (buckets.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="flex items-end gap-[2px] h-6" aria-hidden>
        {buckets.map((b) => {
          const kind = bucketKind(b);
          return (
            <div
              key={b.idx}
              className={`flex-1 min-w-[2px] rounded-sm ${TL_COLOR[kind]}`}
              style={{ height: `${TL_HEIGHT[kind]}%` }}
              title={`总 ${b.total} · 错 ${b.error}`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] uppercase tracking-widest text-gray-600">
        <span>过去</span>
        <span>现在</span>
      </div>
    </div>
  );
}
