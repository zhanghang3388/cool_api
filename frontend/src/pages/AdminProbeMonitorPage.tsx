import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useProbeMonitor,
  useRunProbes,
  type ProbeBucket,
  type ProbeStatus,
  type ProbeTargetView,
} from '@/hooks/useProbes';
import { ApiError } from '@/lib/api';
import Spinner from '@/components/ui/Spinner';

const WINDOWS = [
  { minutes: 60, label: '1h' },
  { minutes: 360, label: '6h' },
  { minutes: 1440, label: '24h' },
] as const;

type WindowMinutes = (typeof WINDOWS)[number]['minutes'];

const STATUS_META: Record<
  ProbeStatus,
  { label: string; badge: string; dot: string }
> = {
  operational: {
    label: '正常',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  degraded: {
    label: '降级',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  failed: {
    label: '异常',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400',
  },
  unknown: {
    label: '待探测',
    badge: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    dot: 'bg-gray-500',
  },
};

function hslForPct(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  return `hsl(${clamped * 1.2} 70% 58%)`;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(diffMs / 1000));
  if (s < 60) return `${s} 秒前`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} 分钟前`;
  if (m < 1440) return `${Math.round(m / 60)} 小时前`;
  return `${Math.round(m / 1440)} 天前`;
}

export default function AdminProbeMonitorPage() {
  const [window, setWindow] = useState<WindowMinutes>(60);
  const { data, isLoading } = useProbeMonitor(window);
  const runMut = useRunProbes();
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const runOnce = async () => {
    setStatus(null);
    try {
      const res = await runMut.mutateAsync();
      setStatus({ kind: 'ok', text: `已探测 ${res.probed} 个目标` });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof ApiError ? e.message : '探测失败' });
    }
  };

  const targets = data?.targets ?? [];

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">活体监控</h2>
        <div className="flex items-center gap-3">
          <WindowSelector value={window} onChange={setWindow} />
          <button
            onClick={runOnce}
            disabled={runMut.isPending}
            className="px-4 py-1.5 border border-base-300 hover:border-amber-500/40 disabled:opacity-50 text-gray-300 hover:text-amber-300 rounded-lg transition-colors text-xs flex items-center gap-2"
          >
            {runMut.isPending && <Spinner />}
            立即探测
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-gray-500">
          针对在
          <Link to="/admin/settings" className="text-amber-400 hover:underline mx-1">
            系统设置
          </Link>
          中配置的目标，按指定模型主动验活。30s 自动刷新。
        </p>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] ${
            data?.enabled
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-gray-500/15 text-gray-400 border-gray-500/30'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              data?.enabled ? 'bg-emerald-400 pulse-dot' : 'bg-gray-500'
            }`}
          />
          {data?.enabled ? `定时验活已开启 · 每 ${data.interval_minutes} 分钟` : '定时验活未开启'}
        </span>
      </div>

      {status && (
        <div
          className={`text-xs px-2 py-1.5 rounded border max-w-md ${
            status.kind === 'ok'
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
          }`}
        >
          {status.text}
        </div>
      )}

      {isLoading ? (
        <div className="h-[200px] flex items-center justify-center text-gray-500">
          <Spinner />
        </div>
      ) : targets.length === 0 ? (
        <div className="stat-card rounded-xl p-10 text-center text-sm text-gray-500">
          还没有配置探测目标。请到
          <Link to="/admin/settings" className="text-amber-400 hover:underline mx-1">
            系统设置 · 活体监控
          </Link>
          添加。
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {targets.map((t, i) => (
            <ProbeCard key={`${t.channel_id}-${t.model}-${t.group_id}-${i}`} t={t} />
          ))}
        </div>
      )}
    </div>
  );
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
          className={`px-2.5 py-1 rounded transition-colors ${
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

function ProbeCard({ t }: { t: ProbeTargetView }) {
  const meta = STATUS_META[t.status] ?? STATUS_META.unknown;
  const avail = t.availability;
  return (
    <div className="stat-card rounded-xl p-4 space-y-3">
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-sm text-gray-100 truncate" title={t.model}>
            {t.model}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="px-1.5 py-0.5 rounded bg-base-300/60 text-gray-400">
              {t.channel_name}
            </span>
            <span>{t.group_label ?? '任意分组'}</span>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium shrink-0 ${meta.badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} pulse-dot`} />
          {meta.label}
        </span>
      </div>

      {/* availability headline */}
      <div className="flex items-end justify-between">
        <span className="text-[9px] uppercase tracking-widest text-gray-500">可用率</span>
        <div className="flex items-baseline gap-0.5">
          {avail == null ? (
            <span className="text-2xl font-bold tabular-nums leading-none text-gray-600">—</span>
          ) : (
            <>
              <span
                className="text-2xl font-bold tabular-nums leading-none"
                style={{ color: hslForPct(avail) }}
              >
                {avail.toFixed(1)}
              </span>
              <span
                className="text-sm font-semibold leading-none"
                style={{ color: hslForPct(avail) }}
              >
                %
              </span>
            </>
          )}
        </div>
      </div>

      <ProbeTimeline buckets={t.buckets} />

      {/* metric pair */}
      <div className="grid grid-cols-2 gap-1.5">
        <MetricBox label="最新延迟" value={t.latest_latency_ms} />
        <MetricBox label="平均延迟" value={t.avg_latency_ms} />
      </div>

      {/* footer stats */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-gray-500">
        <span>
          探测 <span className="text-gray-300">{t.total}</span>
        </span>
        <span>
          成功 <span className="text-emerald-300">{t.ok_count}</span>
        </span>
        {t.last_checked_at && <span>{relativeTime(t.last_checked_at)}</span>}
      </div>

      {t.latest_ok === false && t.last_detail && (
        <div
          className="text-[10px] text-rose-300/90 bg-rose-500/5 border border-rose-500/20 rounded px-2 py-1 font-mono break-words line-clamp-2"
          title={t.last_detail}
        >
          {t.last_detail}
        </div>
      )}
    </div>
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

// Dual-encoded timeline: bar height encodes status severity, color reinforces.
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

function bucketKind(b: ProbeBucket): TimelineKind {
  if (b.total === 0) return 'empty';
  if (b.error === b.total) return 'failed';
  if (b.error > 0) return 'degraded';
  return 'operational';
}

function ProbeTimeline({ buckets }: { buckets: ProbeBucket[] }) {
  if (buckets.length === 0) return null;
  return (
    <div>
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
