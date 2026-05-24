import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import {
  useUsageLogs,
  useUsageSummary,
  type RequestStatus,
  type UsageLogRow,
  type UsageLogsFilter,
} from '@/hooks/useUsage';
import { useUserGroups } from '@/hooks/useUserGroups';
import { useUserModels } from '@/hooks/useUserModels';
import { PROVIDER_LABELS } from '@/hooks/useGroups';

const PAGE_SIZE = 20;

const STATUS_STYLE: Record<RequestStatus, { label: string; className: string }> = {
  success: { label: '成功', className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  cached: { label: '缓存', className: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  error: { label: '失败', className: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
};

function formatYuan(cents: number): string {
  return `¥${(cents / 10000).toFixed(4)}`;
}

function formatPriceYuan(priceCents: number | null, multiplier: number): string {
  if (priceCents == null) return '—';
  return `¥${(priceCents * multiplier / 100).toFixed(2)}`;
}

/** Postgres INET serializes single hosts with /32 or /128 — strip it off for display. */
function formatIp(raw: string | null): string {
  if (!raw) return '—';
  return raw.replace(/\/(32|128)$/, '');
}

export default function UsagePage() {
  const [page, setPage] = useState(1);
  const [model, setModel] = useState('');
  const [groupId, setGroupId] = useState<number | ''>('');
  const [status, setStatus] = useState<RequestStatus | ''>('');
  // YYYY-MM-DD strings; empty = no bound on that side. Two separate inputs
  // (from / to) keep the markup native and dependency-free.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: groups = [] } = useUserGroups();
  const { data: models = [] } = useUserModels();

  // Stable, deduped model list for the dropdown. The user-models hook gives
  // us only enabled models — exactly what we want to surface as filters.
  const modelOptions = useMemo(() => {
    const names = new Set<string>();
    models.forEach((m) => names.add(m.name));
    return Array.from(names).sort();
  }, [models]);

  // Convert local YYYY-MM-DD to UTC ISO. `from` is the local midnight at the
  // start of that day; `to` is the local midnight at the start of the day
  // *after* the picked date so the backend's `created_at < $to` matches the
  // entire end day inclusively.
  const fromIso = useMemo(() => {
    if (!fromDate) return undefined;
    const d = new Date(`${fromDate}T00:00:00`);
    return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
  }, [fromDate]);
  const toIso = useMemo(() => {
    if (!toDate) return undefined;
    const d = new Date(`${toDate}T00:00:00`);
    if (!Number.isFinite(d.getTime())) return undefined;
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }, [toDate]);

  const filter: UsageLogsFilter = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      model: model || undefined,
      group_id: groupId === '' ? undefined : groupId,
      status: status || undefined,
      from: fromIso,
      to: toIso,
    }),
    [page, model, groupId, status, fromIso, toIso]
  );
  const { data, isLoading, isFetching } = useUsageLogs(filter);
  const { data: summary } = useUsageSummary();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const resetPage = () => setPage(1);
  const hasFilter = !!(model || groupId !== '' || status || fromDate || toDate);
  const dateOrderError = !!(
    fromDate &&
    toDate &&
    new Date(fromDate) > new Date(toDate)
  );

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-semibold">用量日志</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard label="今日请求" value={summary ? summary.today_requests.toLocaleString() : '—'} />
        <SummaryCard label="今日消耗" value={summary ? formatYuan(summary.today_cost_cents) : '—'} accent="text-amber-400" />
        <SummaryCard label="今日 Token" value={summary ? summary.today_tokens.toLocaleString() : '—'} accent="text-cyan-400" />
        <SummaryCard label="累计请求" value={summary ? summary.total_requests.toLocaleString() : '—'} />
        <SummaryCard label="累计消耗" value={summary ? formatYuan(summary.total_cost_cents) : '—'} accent="text-emerald-400" />
        <SummaryCard label="累计 Token" value={summary ? summary.total_tokens.toLocaleString() : '—'} accent="text-cyan-400" />
      </div>

      <div className="stat-card rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-500">分组</label>
          <select
            value={groupId === '' ? '' : String(groupId)}
            onChange={(e) => {
              setGroupId(e.target.value === '' ? '' : Number(e.target.value));
              resetPage();
            }}
            className="bg-base-200 border border-base-300 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500 min-w-[180px]"
          >
            <option value="">全部分组</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                [{PROVIDER_LABELS[g.provider]}] {g.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-500">模型</label>
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              resetPage();
            }}
            className="bg-base-200 border border-base-300 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 focus:outline-none focus:border-amber-500 min-w-[200px]"
          >
            <option value="">全部模型</option>
            {modelOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-500">状态</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as RequestStatus | '');
              resetPage();
            }}
            className="bg-base-200 border border-base-300 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500 min-w-[120px]"
          >
            <option value="">全部状态</option>
            <option value="success">成功</option>
            <option value="cached">缓存</option>
            <option value="error">失败</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-500">起始日期</label>
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => {
              setFromDate(e.target.value);
              resetPage();
            }}
            className="bg-base-200 border border-base-300 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-500">结束日期</label>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => {
              setToDate(e.target.value);
              resetPage();
            }}
            className="bg-base-200 border border-base-300 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
          />
        </div>
        {hasFilter && (
          <button
            onClick={() => {
              setModel('');
              setGroupId('');
              setStatus('');
              setFromDate('');
              setToDate('');
              resetPage();
            }}
            className="ml-auto text-xs text-gray-400 hover:text-gray-200"
          >
            清除筛选
          </button>
        )}
      </div>
      {dateOrderError && (
        <div className="text-xs text-rose-400 px-2 py-1.5 rounded bg-rose-500/10 border border-rose-500/20">
          起始日期不能晚于结束日期
        </div>
      )}

      <div className="stat-card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-base-300 bg-base-200/50">
              <th className="w-8" />
              <th className="text-left p-3 font-medium">时间</th>
              <th className="text-left p-3 font-medium">模型</th>
              <th className="text-left p-3 font-medium">分组</th>
              <th className="text-left p-3 font-medium">令牌</th>
              <th className="text-right p-3 font-medium">Token</th>
              <th className="text-left p-3 font-medium">IP</th>
              <th className="text-right p-3 font-medium">耗时</th>
              <th className="text-right p-3 font-medium">费用</th>
              <th className="text-center p-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-gray-500 text-xs">
                  <Spinner className="mr-2" /> 加载中...
                </td>
              </tr>
            )}
            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-gray-500 text-xs">
                  暂无记录
                </td>
              </tr>
            )}
            {data?.items.map((r) => {
              const expanded = expandedId === r.id;
              return (
                <LogTableRow
                  key={r.id}
                  row={r}
                  expanded={expanded}
                  onToggle={() => setExpandedId(expanded ? null : r.id)}
                />
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

function LogTableRow({
  row,
  expanded,
  onToggle,
}: {
  row: UsageLogRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = STATUS_STYLE[row.status];
  const totalTokens = row.prompt_tokens + row.completion_tokens;

  return (
    <>
      <tr
        className={`border-b border-base-300/50 hover:bg-base-200/30 transition-colors cursor-pointer ${
          expanded ? 'bg-base-200/40' : ''
        }`}
        onClick={onToggle}
      >
        <td className="p-3 text-center w-8">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-amber-400 inline" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-500 inline" />
          )}
        </td>
        <td className="p-3 text-xs text-gray-500 font-mono">
          {new Date(row.created_at).toLocaleString('zh-CN')}
        </td>
        <td className="p-3 font-mono text-xs text-amber-400/90">{row.model_name}</td>
        <td className="p-3">
          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-base-200 text-amber-400">
            {row.group_label || row.group_name || '—'}
          </span>
        </td>
        <td className="p-3">
          <div className="text-xs text-gray-300">{row.api_key_name || '—'}</div>
          {row.api_key_prefix && (
            <div className="text-[10px] text-gray-600 font-mono">{row.api_key_prefix}…</div>
          )}
        </td>
        <td className="p-3 text-right font-mono text-xs text-gray-300 leading-tight">
          <div>
            <span className="text-gray-500">读</span> {row.prompt_tokens.toLocaleString()}
            <span className="text-gray-600 mx-1">/</span>
            {row.completion_tokens.toLocaleString()}
          </div>
          {(row.cache_creation_tokens > 0 || row.cached_tokens > 0) && (
            <div className="text-[10px] text-gray-500">
              <span className="text-amber-400">写</span> {row.cache_creation_tokens.toLocaleString()}
              <span className="text-gray-600 mx-1">/</span>
              <span className="text-cyan-400">缓</span> {row.cached_tokens.toLocaleString()}
            </div>
          )}
        </td>
        <td className="p-3 text-[11px] text-gray-500 font-mono">{formatIp(row.client_ip)}</td>
        <td className="p-3 text-right font-mono text-xs text-gray-500">{row.latency_ms}ms</td>
        <td className="p-3 text-right font-mono text-xs text-gray-200">
          {formatYuan(row.total_cost_cents)}
        </td>
        <td className="p-3 text-center">
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] border ${style.className}`}>
            {style.label}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-base-200/20 border-b border-base-300/50">
          <td></td>
          <td colSpan={9} className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Token breakdown */}
              <div>
                <h4 className="text-gray-400 font-medium mb-2">Token 明细</h4>
                <dl className="space-y-1 font-mono">
                  <DetailRow label="Prompt" value={row.prompt_tokens.toLocaleString()} />
                  <DetailRow label="Completion" value={row.completion_tokens.toLocaleString()} />
                  <DetailRow
                    label="创建缓存"
                    value={row.cache_creation_tokens.toLocaleString()}
                    accent="text-amber-400"
                  />
                  <DetailRow
                    label="缓存读取"
                    value={row.cached_tokens.toLocaleString()}
                    accent="text-cyan-400"
                  />
                  <DetailRow label="合计" value={totalTokens.toLocaleString()} bold />
                </dl>
              </div>

              {/* Cost breakdown */}
              <div>
                <h4 className="text-gray-400 font-medium mb-2">费用明细 (￥)</h4>
                <dl className="space-y-1 font-mono">
                  <DetailRow label="输入" value={formatYuan(row.input_cost_cents)} />
                  <DetailRow label="输出" value={formatYuan(row.output_cost_cents)} />
                  <DetailRow
                    label="合计"
                    value={formatYuan(row.total_cost_cents)}
                    accent="text-emerald-400"
                    bold
                  />
                </dl>
              </div>

              {/* Model prices (effective for this group) */}
              <div>
                <h4 className="text-gray-400 font-medium mb-2">
                  模型价格 <span className="text-gray-600">(¥/1M)</span>
                </h4>
                <dl className="space-y-1 font-mono">
                  <DetailRow label="输入" value={formatPriceYuan(row.model_input_price_cents, row.multiplier_applied)} />
                  <DetailRow label="输出" value={formatPriceYuan(row.model_output_price_cents, row.multiplier_applied)} />
                  <DetailRow
                    label="缓存读"
                    value={formatPriceYuan(row.model_cache_read_price_cents, row.multiplier_applied)}
                  />
                  <DetailRow
                    label="缓存写"
                    value={formatPriceYuan(row.model_cache_write_price_cents, row.multiplier_applied)}
                  />
                </dl>
              </div>

              {row.error_message && (
                <div className="md:col-span-3">
                  <h4 className="text-gray-400 font-medium mb-2">错误信息</h4>
                  <pre className="bg-base-200 border border-rose-500/20 rounded-lg p-3 text-rose-300 font-mono text-[11px] whitespace-pre-wrap break-all">
                    {row.error_message}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
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

function DetailRow({
  label,
  value,
  accent,
  bold,
}: {
  label: string;
  value: string;
  accent?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`${accent ?? 'text-gray-200'} ${bold ? 'font-semibold' : ''}`}>{value}</dd>
    </div>
  );
}
