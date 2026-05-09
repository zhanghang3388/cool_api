import { useEffect, useState } from 'react';
import Spinner from '@/components/ui/Spinner';
import Toggle from '@/components/ui/Toggle';
import { ApiError } from '@/lib/api';
import {
  useCacheEntries,
  useCacheSettings,
  useCacheStats,
  useClearCache,
  useUpdateCacheSettings,
} from '@/hooks/useCache';

function formatYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTtl(seconds: number): string {
  if (seconds < 0) return '永久';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export default function CachePage() {
  const { data: stats } = useCacheStats();
  const { data: settings } = useCacheSettings();
  const { data: entries = [] } = useCacheEntries(50);
  const updateMut = useUpdateCacheSettings();
  const clearMut = useClearCache();

  const [ttlInput, setTtlInput] = useState('');
  const [limitInput, setLimitInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (settings) {
      setTtlInput(String(settings.ttl_seconds));
      setLimitInput(String(settings.recent_keys_limit));
    }
  }, [settings]);

  const toggleEnabled = async () => {
    if (!settings) return;
    try {
      await updateMut.mutateAsync({ enabled: !settings.enabled });
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '更新失败');
    }
  };

  const saveConfig = async () => {
    setSaveStatus(null);
    const ttl = parseInt(ttlInput, 10);
    const limit = parseInt(limitInput, 10);
    if (!Number.isFinite(ttl) || ttl < 1) {
      setSaveStatus({ kind: 'err', text: 'TTL 需为 >= 1 的整数' });
      return;
    }
    if (!Number.isFinite(limit) || limit < 0 || limit > 5000) {
      setSaveStatus({ kind: 'err', text: '最近条目数需在 0 到 5000 之间' });
      return;
    }
    try {
      await updateMut.mutateAsync({ ttl_seconds: ttl, recent_keys_limit: limit });
      setSaveStatus({ kind: 'ok', text: '已保存' });
    } catch (e) {
      setSaveStatus({ kind: 'err', text: e instanceof ApiError ? e.message : '保存失败' });
    }
  };

  const clearAll = async () => {
    if (!confirm('确认清空所有缓存？此操作不可恢复。')) return;
    try {
      const res = await clearMut.mutateAsync();
      alert(`已清空 ${res.deleted} 个 Redis 键`);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '清空失败');
    }
  };

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-semibold">缓存管理</h2>

      <div className="stat-card rounded-xl p-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="text-amber-400">说明：</span>
          缓存仅对<span className="font-mono text-gray-300"> 非流式 </span>、
          <span className="font-mono text-gray-300">temperature=0</span>、且不带
          <span className="font-mono text-gray-300"> tools </span>的请求生效。
          命中时按模型的 cache_read 价格计费（若未设置则按输入价格的全额收费）。
          客户端可发送 <span className="font-mono text-gray-300">x-aether-no-cache</span> 头跳过缓存。
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="总缓存数"
          value={stats ? stats.total_entries.toLocaleString() : '—'}
        />
        <StatCard
          label="命中率"
          value={stats ? `${(stats.hit_rate * 100).toFixed(1)}%` : '—'}
          accent="text-cyan-400"
        />
        <StatCard
          label="节省 Token"
          value={stats ? formatCompact(stats.saved_tokens) : '—'}
          accent="text-amber-400"
        />
        <StatCard
          label="节省费用"
          value={stats ? formatYuan(stats.saved_cents) : '—'}
          accent="text-emerald-400"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="stat-card rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-300">缓存配置</h3>
            {settings && (
              <Toggle active={settings.enabled} onToggle={toggleEnabled} />
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">TTL (秒)</label>
            <input
              type="number"
              min="1"
              value={ttlInput}
              onChange={(e) => setTtlInput(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              单条缓存的存活时间，到期自动过期
            </p>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">最近条目数</label>
            <input
              type="number"
              min="0"
              max="5000"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              下方「最近缓存条目」列表保留的最大条数，0 表示禁用
            </p>
          </div>
          {saveStatus && (
            <div
              className={`text-xs px-2 py-1.5 rounded border ${
                saveStatus.kind === 'ok'
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
              }`}
            >
              {saveStatus.text}
            </div>
          )}
          <div className="flex items-center gap-2 pt-2 border-t border-base-300">
            <button
              onClick={saveConfig}
              disabled={updateMut.isPending}
              className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {updateMut.isPending && <Spinner className="border-black/30 border-t-black" />}
              保存配置
            </button>
            <button
              onClick={clearAll}
              disabled={clearMut.isPending}
              className="py-2 px-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-sm rounded-lg transition-colors disabled:opacity-60"
            >
              {clearMut.isPending ? '清空中...' : '清空缓存'}
            </button>
          </div>
        </div>

        <div className="stat-card rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">
            最近缓存条目 ({entries.length})
          </h3>
          <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
            {entries.length === 0 && (
              <p className="text-xs text-gray-600 text-center py-6">暂无缓存条目</p>
            )}
            {entries.map((entry) => (
              <div
                key={entry.hash}
                className="p-3 bg-base-200/50 rounded-lg border border-base-300/50"
              >
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] text-gray-500">
                    {entry.hash.slice(0, 12)}...
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono">
                    {entry.tokens.toLocaleString()} tokens
                  </span>
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-gray-600">
                  <span className="font-mono text-amber-400/70">{entry.model}</span>
                  <span>TTL {formatTtl(entry.ttl_seconds)}</span>
                </div>
                <div className="text-[10px] text-gray-600 mt-0.5 font-mono">
                  {new Date(entry.created_at).toLocaleString('zh-CN')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {stats && (
        <div className="stat-card rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-3">运行时指标</h3>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <Metric label="缓存命中次数" value={stats.total_hits.toLocaleString()} />
            <Metric label="缓存写入次数" value={stats.total_stores.toLocaleString()} />
            <Metric
              label="命中率"
              value={`${(stats.hit_rate * 100).toFixed(2)}%`}
              note={`${stats.total_hits}/${stats.total_hits + stats.total_stores}`}
            />
          </div>
        </div>
      )}
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
    <div className="stat-card rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-mono font-bold ${accent ?? 'text-gray-200'}`}>{value}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="p-3 bg-base-200/50 rounded-lg border border-base-300/50">
      <p className="text-[10px] text-gray-500 mb-1">{label}</p>
      <p className="font-mono text-sm text-gray-200">{value}</p>
      {note && <p className="text-[10px] text-gray-600 mt-0.5 font-mono">{note}</p>}
    </div>
  );
}
