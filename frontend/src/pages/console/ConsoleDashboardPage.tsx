import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  useUsageSummary,
  useDailyByModel,
  useGroupHealth,
  type DailyModelPoint,
  type GroupHealth,
  type GroupHealthStatus,
} from '@/hooks/useUsage';
import { useUserGroups, type UserGroup } from '@/hooks/useUserGroups';
import { PROVIDER_LABELS } from '@/hooks/useGroups';

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
            <DailyByModelChart points={daily} />
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
/* Group selector tabs above the chart.                                       */
/* -------------------------------------------------------------------------- */

interface GroupTabsProps {
  groups: UserGroup[];
  value: number | null;
  onChange: (next: number | null) => void;
}

function GroupTabs({ groups, value, onChange }: GroupTabsProps) {
  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 ${
      active
        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
        : 'bg-base-200 text-gray-400 border border-base-300 hover:text-gray-200'
    }`;
  return (
    <div className="flex gap-2 flex-wrap">
      <button onClick={() => onChange(null)} className={tabClass(value === null)}>
        全部分组
      </button>
      {groups.map((g) => (
        <button key={g.id} onClick={() => onChange(g.id)} className={tabClass(value === g.id)}>
          <span className="text-[9px] opacity-70">[{PROVIDER_LABELS[g.provider]}]</span>
          {g.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hand-rolled SVG chart — keeps the bundle tiny and avoids dragging in a    */
/* whole charting lib for one panel.                                         */
/* -------------------------------------------------------------------------- */

const CHART_PALETTE = [
  '#f59e0b', // amber-500
  '#22d3ee', // cyan-400
  '#a78bfa', // violet-400
  '#34d399', // emerald-400
  '#f87171', // rose-400
  '#fb923c', // orange-400
  '#60a5fa', // blue-400
  '#facc15', // yellow-400
];

interface PivotedSeries {
  /** Stable identifier for the series — model name. */
  key: string;
  label: string;
  values: number[];
  color: string;
}

interface PivotResult {
  days: string[];
  series: PivotedSeries[];
  yMax: number;
  totalByDay: number[];
}

function pivot(points: DailyModelPoint[]): PivotResult {
  if (points.length === 0) {
    return { days: [], series: [], yMax: 0, totalByDay: [] };
  }
  // Build the canonical 7 days from "today back". Use **local** Y/M/D
  // components (not toISOString — that converts to UTC and silently drops a
  // day east of UTC). Backend buckets in Asia/Shanghai, so this lines up
  // for CN users.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayKeys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dayKeys.push(`${y}-${m}-${day}`);
  }

  // Collect models in stable order (alphabetical by name).
  const modelNames = Array.from(new Set(points.map((p) => p.model_name))).sort();

  // Quick lookup: model → dayKey → tokens.
  const lookup = new Map<string, Map<string, number>>();
  points.forEach((p) => {
    if (!lookup.has(p.model_name)) lookup.set(p.model_name, new Map());
    const byDay = lookup.get(p.model_name)!;
    // Same model name might appear twice on the same day if the backend
    // ever returns un-merged rows — fold them defensively.
    byDay.set(p.day, (byDay.get(p.day) ?? 0) + p.tokens);
  });

  const series: PivotedSeries[] = modelNames.map((name, i) => ({
    key: name,
    label: name,
    color: CHART_PALETTE[i % CHART_PALETTE.length],
    values: dayKeys.map((d) => lookup.get(name)?.get(d) ?? 0),
  }));

  const totalByDay = dayKeys.map((_, di) =>
    series.reduce((acc, s) => acc + s.values[di], 0)
  );
  const yMax = Math.max(0, ...series.flatMap((s) => s.values));

  return { days: dayKeys, series, yMax, totalByDay };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDayShort(iso: string): string {
  // iso = "YYYY-MM-DD". Parse as plain string — no Date object — so the
  // displayed month/day matches what's on the data point regardless of the
  // browser's local timezone.
  const [, m, d] = iso.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function DailyByModelChart({ points }: { points: DailyModelPoint[] }) {
  const { days, series, yMax, totalByDay } = useMemo(() => pivot(points), [points]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // SVG view is unitless; we lay it out at 800×260 and let the viewBox handle
  // the actual responsive scaling. Padding leaves room for axis labels.
  const W = 800;
  const H = 260;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Empty / all-zero state.
  if (days.length === 0 || (yMax === 0 && series.length === 0)) {
    return (
      <div className="h-[260px] flex items-center justify-center text-xs text-gray-500">
        近 7 天还没有用量数据。先去
        <Link to="/console/keys" className="mx-1 text-amber-400 hover:underline">创建令牌</Link>
        发起请求吧。
      </div>
    );
  }

  // Scale: leave a touch of headroom so the topmost line doesn't touch the frame.
  const yMaxPadded = yMax === 0 ? 1 : yMax * 1.1;
  const xAt = (i: number) =>
    days.length === 1
      ? padL + innerW / 2
      : padL + (innerW * i) / (days.length - 1);
  const yAt = (v: number) => padT + innerH - (innerH * v) / yMaxPadded;

  // 5 horizontal grid lines (incl. top + bottom).
  const gridSteps = 4;
  const yTicks = Array.from({ length: gridSteps + 1 }, (_, i) =>
    Math.round((yMaxPadded * i) / gridSteps)
  );

  // Monotonic cubic interpolation (Fritsch–Carlson). Unlike Catmull-Rom this
  // guarantees the curve stays within the [min, max] of each segment's
  // endpoints, so a sequence like [0, 0, 0, 0, 0, big] won't dip below zero
  // before the spike. Standard pick for monotone-or-flat data series.
  const smoothPath = (vals: number[]) => {
    if (vals.length === 0) return '';
    const pts = vals.map((v, i) => [xAt(i), yAt(v)] as const);
    const n = pts.length;
    if (n === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
    if (n === 2) return `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]}`;

    // Secant slopes between consecutive points.
    const secants: number[] = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0];
      const dy = pts[i + 1][1] - pts[i][1];
      secants[i] = dy / dx;
    }

    // Tangent at each point: weighted average of adjacent secants, zeroed
    // when adjacent secants disagree in sign so the spline can't overshoot
    // a local extremum.
    const tangents: number[] = new Array(n);
    tangents[0] = secants[0];
    tangents[n - 1] = secants[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (secants[i - 1] * secants[i] <= 0) {
        tangents[i] = 0;
      } else {
        tangents[i] = (secants[i - 1] + secants[i]) / 2;
      }
    }

    // Fritsch–Carlson clamp: keep |α|² + |β|² ≤ 9 so each segment stays
    // monotonic. Without this the slope-averaging step above can still
    // produce small overshoots on uneven data.
    for (let i = 0; i < n - 1; i++) {
      if (secants[i] === 0) {
        tangents[i] = 0;
        tangents[i + 1] = 0;
        continue;
      }
      const a = tangents[i] / secants[i];
      const b = tangents[i + 1] / secants[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        tangents[i] = t * a * secants[i];
        tangents[i + 1] = t * b * secants[i];
      }
    }

    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0];
      const c1x = pts[i][0] + dx / 3;
      const c1y = pts[i][1] + (tangents[i] * dx) / 3;
      const c2x = pts[i + 1][0] - dx / 3;
      const c2y = pts[i + 1][1] - (tangents[i + 1] * dx) / 3;
      d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${pts[i + 1][0]} ${pts[i + 1][1]}`;
    }
    return d;
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[260px] overflow-visible">
        {/* horizontal gridlines + y-axis labels */}
        {yTicks.map((tick, i) => {
          const y = yAt(tick);
          return (
            <g key={`grid-${i}`}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeWidth={1}
                className="text-base-300"
                strokeDasharray={i === 0 ? undefined : '2 4'}
                opacity={i === 0 ? 0.6 : 0.4}
              />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-gray-500 font-mono"
                style={{ fontSize: 10 }}
              >
                {formatTokens(tick)}
              </text>
            </g>
          );
        })}

        {/* X axis labels */}
        {days.map((d, i) => (
          <text
            key={d}
            x={xAt(i)}
            y={H - padB + 14}
            textAnchor="middle"
            className="fill-gray-500 font-mono"
            style={{ fontSize: 10 }}
          >
            {formatDayShort(d)}
          </text>
        ))}

        {/* hover guideline */}
        {hoverIdx !== null && (
          <line
            x1={xAt(hoverIdx)}
            x2={xAt(hoverIdx)}
            y1={padT}
            y2={H - padB}
            stroke="currentColor"
            className="text-amber-500/40"
            strokeWidth={1}
          />
        )}

        {/* series — area gradient + smoothed line */}
        <defs>
          {series.map((s) => (
            <linearGradient
              key={s.key}
              id={`g-${cssId(s.key)}`}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {series.map((s) => {
          const linePath = smoothPath(s.values);
          // Area fill = line path closed back along the bottom.
          const lastX = xAt(s.values.length - 1);
          const firstX = xAt(0);
          const areaPath = `${linePath} L ${lastX} ${yAt(0)} L ${firstX} ${yAt(0)} Z`;
          return (
            <g key={s.key}>
              <path d={areaPath} fill={`url(#g-${cssId(s.key)})`} />
              <path
                d={linePath}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* points — small dots so single-day series still show */}
              {s.values.map((v, i) => (
                <circle
                  key={i}
                  cx={xAt(i)}
                  cy={yAt(v)}
                  r={hoverIdx === i ? 4 : 2.5}
                  fill={s.color}
                  stroke="#0b0b0e"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          );
        })}

        {/* hover catcher: invisible columns that update the hovered day */}
        {days.map((_, i) => {
          const colW = innerW / (days.length || 1);
          return (
            <rect
              key={`hit-${i}`}
              x={xAt(i) - colW / 2}
              y={padT}
              width={colW}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((h) => (h === i ? null : h))}
            />
          );
        })}
      </svg>

      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: s.color }}
            />
            <span className="font-mono">{s.label}</span>
          </div>
        ))}
      </div>

      {/* tooltip */}
      {hoverIdx !== null && (
        <div className="absolute top-1 right-1 stat-card rounded-md border border-base-300 bg-base-200/95 px-3 py-2 text-[10px] font-mono text-gray-300 pointer-events-none min-w-[160px]">
          <div className="text-gray-500 mb-1">
            {formatDayShort(days[hoverIdx])} · 总 {formatTokens(totalByDay[hoverIdx])}
          </div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />
                <span className="truncate" title={s.label}>{s.label}</span>
              </span>
              <span className="text-gray-200 shrink-0">{formatTokens(s.values[hoverIdx])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sanitize an arbitrary string into something safe to embed in an SVG id /
 * url(#id) ref. Model names contain dots, slashes etc. that are technically
 * valid in `id` per HTML5 but fail in `url(#…)` references.
 */
function cssId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_');
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
