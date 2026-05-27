import { useMemo, useState } from 'react';
import { Pencil, Plus, Power, RefreshCw, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Toggle from '@/components/ui/Toggle';
import Spinner from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api';
import {
  useChannels,
  useCreateChannel,
  useUpdateChannel,
  useDeleteChannel,
  useTestChannel,
  usePreviewModels,
  useChannelModels,
  type Channel,
  type ChannelProvider,
  type ChannelStatus,
  type UpstreamModelEntry,
} from '@/hooks/useChannels';
import { useGroups } from '@/hooks/useGroups';
import { useModels } from '@/hooks/useModels';

interface FormState {
  name: string;
  provider: ChannelProvider;
  base_url: string;
  api_key: string;
  priority: string;
  weight: string;
  allowed_models: string;
  allowed_group_ids: number[];
  enabled: boolean;
}

const BLANK: FormState = {
  name: '',
  provider: 'openai',
  base_url: '',
  api_key: '',
  priority: '0',
  weight: '1',
  allowed_models: '',
  allowed_group_ids: [],
  enabled: true,
};

const PROVIDER_DEFAULTS: Record<ChannelProvider, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
};

type MonitorState = 'normal' | 'degraded' | 'abnormal' | 'maintenance';

const MONITOR_SEGMENT_COUNT = 64;

const STATUS_STYLE: Record<ChannelStatus, { dot: string }> = {
  active: { dot: 'bg-[#39d3df]' },
  warning: { dot: 'bg-[#f6c453]' },
  error: { dot: 'bg-[#ffb482]' },
  disabled: { dot: 'bg-[#aeb7c2]' },
};

const PROVIDER_STYLE: Record<ChannelProvider, string> = {
  openai: 'bg-emerald-500/10 text-emerald-400',
  anthropic: 'bg-amber-500/10 text-amber-400',
};

const MONITOR_STATE_STYLE: Record<MonitorState, { label: string; segment: string; dot: string }> = {
  normal: { label: '正常', segment: 'bg-[#38c8d6]', dot: 'bg-[#38c8d6] shadow-[0_0_8px_#38c8d6]' },
  degraded: { label: '降级', segment: 'bg-[#f6c453]', dot: 'bg-[#f6c453] shadow-[0_0_8px_#f6c453]' },
  abnormal: { label: '异常', segment: 'bg-[#ffb482]', dot: 'bg-[#ffb482] shadow-[0_0_8px_#ffb482]' },
  maintenance: { label: '维护中', segment: 'bg-[#aeb7c2]', dot: 'bg-[#aeb7c2] shadow-[0_0_8px_#aeb7c2]' },
};

function channelSeed(c: Channel) {
  const source = `${c.id}:${c.name}:${c.status}:${c.updated_at}`;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function placeSegments(segments: MonitorState[], state: MonitorState, count: number, seed: number, salt: number) {
  let index = (seed + salt * 13) % MONITOR_SEGMENT_COUNT;
  const step = 5 + ((seed + salt) % 11);
  for (let placed = 0; placed < count; placed += 1) {
    segments[index] = state;
    index = (index + step) % MONITOR_SEGMENT_COUNT;
  }
}

function buildMonitorSegments(c: Channel): MonitorState[] {
  if (!c.enabled || c.status === 'disabled') {
    return Array.from({ length: MONITOR_SEGMENT_COUNT }, () => 'maintenance');
  }

  const seed = channelSeed(c);
  const segments = Array.from({ length: MONITOR_SEGMENT_COUNT }, () => 'normal' as MonitorState);

  if (c.status === 'active') {
    placeSegments(segments, 'degraded', seed % 3, seed, 1);
    if (c.last_error) placeSegments(segments, 'abnormal', 1, seed, 2);
  } else if (c.status === 'warning') {
    placeSegments(segments, 'degraded', 4 + (seed % 5), seed, 3);
    placeSegments(segments, 'abnormal', seed % 2, seed, 4);
  } else if (c.status === 'error') {
    placeSegments(segments, 'degraded', 6 + (seed % 7), seed, 5);
    placeSegments(segments, 'abnormal', 8 + (seed % 8), seed, 6);
  }

  return segments;
}

function healthPercent(segments: MonitorState[]) {
  const measured = segments.filter((s) => s !== 'maintenance');
  if (measured.length === 0) return 0;
  const normal = measured.filter((s) => s === 'normal').length;
  return (normal / measured.length) * 100;
}

function formatProbeTime(value: string | null) {
  if (!value) return '--ms';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '已测试';

  const diff = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}m前`;
  if (diff < day) return `${Math.floor(diff / hour)}h前`;
  return `${Math.floor(diff / day)}d前`;
}

export default function ChannelsPage() {
  const { data: channels = [], isLoading } = useChannels();
  const { data: groups = [] } = useGroups();
  const { data: models = [] } = useModels();

  const createMut = useCreateChannel();
  const updateMut = useUpdateChannel();
  const deleteMut = useDeleteChannel();
  const testMut = useTestChannel();
  const previewMut = usePreviewModels();
  const channelModelsMut = useChannelModels();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [formError, setFormError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; ok: boolean; detail: string; ms: number } | null>(null);

  const [fetchedModels, setFetchedModels] = useState<UpstreamModelEntry[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [chipInput, setChipInput] = useState('');

  const modelNames = useMemo(() => models.map((m) => m.name), [models]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...BLANK, base_url: PROVIDER_DEFAULTS.openai });
    setFormError(null);
    setFetchedModels([]);
    setFetchError(null);
    setChipInput('');
    setModalOpen(true);
  };

  const openEdit = (c: Channel) => {
    setEditing(c);
    setForm({
      name: c.name,
      provider: c.provider,
      base_url: c.base_url,
      api_key: '',
      priority: String(c.priority),
      weight: String(c.weight),
      allowed_models: c.allowed_models.join(', '),
      allowed_group_ids: c.allowed_group_ids,
      enabled: c.enabled,
    });
    setFormError(null);
    setFetchedModels([]);
    setFetchError(null);
    setChipInput('');
    setModalOpen(true);
  };

  const toggleGroupId = (id: number) => {
    setForm((f) => ({
      ...f,
      allowed_group_ids: f.allowed_group_ids.includes(id)
        ? f.allowed_group_ids.filter((x) => x !== id)
        : [...f.allowed_group_ids, id],
    }));
  };

  const parsedAllowed = useMemo(
    () =>
      new Set(
        form.allowed_models
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    [form.allowed_models]
  );

  const setAllowedList = (names: Set<string>) => {
    setForm((f) => ({ ...f, allowed_models: Array.from(names).join(', ') }));
  };

  const toggleAllowedModel = (name: string) => {
    const next = new Set(parsedAllowed);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setAllowedList(next);
  };

  const commitChipInput = () => {
    const items = chipInput
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) {
      setChipInput('');
      return;
    }
    const next = new Set(parsedAllowed);
    items.forEach((it) => next.add(it));
    setAllowedList(next);
    setChipInput('');
  };

  const removeAllowedModel = (name: string) => {
    const next = new Set(parsedAllowed);
    next.delete(name);
    setAllowedList(next);
  };

  const fetchUpstreamModels = async () => {
    setFetchError(null);
    setFetchedModels([]);
    try {
      const res = editing
        ? await channelModelsMut.mutateAsync(editing.id)
        : await previewMut.mutateAsync({
            provider: form.provider,
            base_url: form.base_url.trim(),
            api_key: form.api_key.trim(),
          });
      if (res.models.length === 0) {
        setFetchError('上游未返回任何模型');
      }
      setFetchedModels(res.models);
    } catch (e) {
      setFetchError(e instanceof ApiError ? e.message : '获取模型列表失败');
    }
  };

  const selectAllFetched = () => {
    const next = new Set(parsedAllowed);
    fetchedModels.forEach((m) => next.add(m.id));
    setAllowedList(next);
  };

  const clearAllowed = () => setAllowedList(new Set());

  const submit = async () => {
    setFormError(null);
    if (!form.name.trim()) return setFormError('渠道名称必填');
    if (!form.base_url.trim()) return setFormError('Base URL 必填');

    const priority = parseInt(form.priority, 10);
    const weight = parseInt(form.weight, 10);
    if (!Number.isFinite(priority)) return setFormError('优先级需为整数');
    if (!Number.isFinite(weight) || weight < 1) return setFormError('权重需为 >= 1 的整数');

    const allowed_models = form.allowed_models
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (editing) {
        await updateMut.mutateAsync({
          id: editing.id,
          patch: {
            name: form.name.trim(),
            base_url: form.base_url.trim(),
            api_key: form.api_key.trim() || undefined,
            priority,
            weight,
            allowed_models,
            allowed_group_ids: form.allowed_group_ids,
            enabled: form.enabled,
          },
        });
      } else {
        if (!form.api_key.trim()) return setFormError('新建渠道必须提供 API Key');
        await createMut.mutateAsync({
          name: form.name.trim(),
          provider: form.provider,
          base_url: form.base_url.trim(),
          api_key: form.api_key.trim(),
          priority,
          weight,
          enabled: form.enabled,
          allowed_models,
          allowed_group_ids: form.allowed_group_ids,
        });
      }
      setModalOpen(false);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : '保存失败');
    }
  };

  const runTest = async (c: Channel) => {
    setTestingId(c.id);
    setTestResult(null);
    try {
      const r = await testMut.mutateAsync(c.id);
      setTestResult({ id: c.id, ok: r.ok, detail: r.detail, ms: r.latency_ms });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '测试失败';
      setTestResult({ id: c.id, ok: false, detail: msg, ms: 0 });
    } finally {
      setTestingId(null);
    }
  };

  const toggleEnabled = (c: Channel) => {
    updateMut.mutate({ id: c.id, patch: { enabled: !c.enabled } });
  };

  const remove = (c: Channel) => {
    if (!confirm(`确认删除渠道「${c.name}」？`)) return;
    deleteMut.mutate(c.id, {
      onError: (e) => alert(e instanceof ApiError ? e.message : '删除失败'),
    });
  };

  return (
    <div className="fade-in -m-6 min-h-[calc(100vh-3rem)] bg-[#0b1118] text-gray-200">
      <div className="border-b border-white/[0.07] px-6 py-2">
        <h2 className="text-base font-semibold tracking-normal">渠道监控</h2>
      </div>

      <div className="flex flex-col gap-4 border-b border-white/[0.07] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-5 text-xs text-gray-400">
          {(Object.keys(MONITOR_STATE_STYLE) as MonitorState[]).map((state) => (
            <div key={state} className="inline-flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${MONITOR_STATE_STYLE[state].dot}`} />
              <span>{MONITOR_STATE_STYLE[state].label}</span>
            </div>
          ))}
        </div>
        <button
          onClick={openCreate}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 text-sm font-medium text-black transition-colors hover:bg-amber-400"
        >
          <Plus className="h-4 w-4" />
          添加渠道
        </button>
      </div>

      <div className="space-y-2 px-2 py-2">
        {testResult && (
          <div
            className={`mx-0 flex items-start gap-3 rounded-lg border bg-[#111820] px-4 py-3 text-xs ${
              testResult.ok ? 'border-cyan-400/25' : 'border-[#ffb482]/35'
            }`}
          >
            <span
              className={`mt-1.5 h-2 w-2 rounded-full ${
                testResult.ok ? MONITOR_STATE_STYLE.normal.dot : MONITOR_STATE_STYLE.abnormal.dot
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className={testResult.ok ? 'text-cyan-200' : 'text-[#ffb482]'}>
                渠道 #{testResult.id} {testResult.ok ? '测试通过' : '测试失败'} · {testResult.ms}ms
              </div>
              <div className="mt-1 break-all font-mono text-gray-500">{testResult.detail}</div>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="text-lg leading-none text-gray-600 transition-colors hover:text-gray-300"
              aria-label="关闭测试结果"
            >
              &times;
            </button>
          </div>
        )}

        {isLoading && (
          <div className="rounded-lg border border-white/[0.07] bg-[#111820] p-8 text-center text-xs text-gray-500">
            <Spinner className="mr-2" /> 加载中...
          </div>
        )}

        {!isLoading && channels.length === 0 && (
          <div className="rounded-lg border border-white/[0.07] bg-[#111820] p-8 text-center text-xs text-gray-500">
            暂无渠道，点击右上角「添加渠道」创建第一个。
          </div>
        )}

        {channels.map((c) => {
          const segments = buildMonitorSegments(c);
          const percent = healthPercent(segments);
          const probeLabel = testResult?.id === c.id ? `${testResult.ms}ms` : formatProbeTime(c.last_test_at);
          const statusDot = c.enabled ? STATUS_STYLE[c.status].dot : STATUS_STYLE.disabled.dot;

          return (
            <section
              key={c.id}
              className="rounded-lg border border-white/[0.07] bg-[#111820] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors hover:border-cyan-400/20"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${statusDot} pulse-dot`} />
                    <h3 className="truncate text-sm font-semibold text-gray-200">{c.name}</h3>
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${PROVIDER_STYLE[c.provider]}`}>
                      {c.provider}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      P{c.priority} / W{c.weight}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-gray-600" title={c.base_url}>
                    {c.base_url}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <div className="hidden text-right font-mono text-[11px] text-gray-500 sm:block">
                    <span>{probeLabel}</span>
                    <span className="ml-4 font-semibold text-gray-300">{percent.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => runTest(c)}
                      disabled={testingId === c.id}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-cyan-300 transition-colors hover:bg-cyan-400/10 disabled:cursor-wait disabled:opacity-50"
                      title={testingId === c.id ? '测试中' : '测试渠道'}
                      aria-label={testingId === c.id ? '测试中' : '测试渠道'}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${testingId === c.id ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => toggleEnabled(c)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
                      title={c.enabled ? '停用渠道' : '启用渠道'}
                      aria-label={c.enabled ? '停用渠道' : '启用渠道'}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => openEdit(c)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
                      title="编辑渠道"
                      aria-label="编辑渠道"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(c)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-300/80 transition-colors hover:bg-rose-400/10 hover:text-rose-200"
                      title="删除渠道"
                      aria-label="删除渠道"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-[3px]" aria-label={`${c.name} 最近状态 ${percent.toFixed(1)}%`}>
                {segments.map((state, index) => (
                  <span
                    key={`${c.id}-${index}`}
                    className={`h-4 min-w-[5px] flex-1 rounded-[2px] ${MONITOR_STATE_STYLE[state].segment}`}
                    title={`${index + 1}/${MONITOR_SEGMENT_COUNT} ${MONITOR_STATE_STYLE[state].label}`}
                  />
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-gray-600 sm:hidden">
                <span className="font-mono">{probeLabel}</span>
                <span className="font-mono font-semibold text-gray-300">{percent.toFixed(1)}%</span>
              </div>

              {(c.last_error || c.allowed_models.length > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-600">
                  {c.last_error && <span className="truncate text-[#ffb482]" title={c.last_error}>{c.last_error}</span>}
                  {c.allowed_models.length > 0 && (
                    <span className="font-mono">
                      模型 {c.allowed_models.slice(0, 2).join(', ')}
                      {c.allowed_models.length > 2 ? ` +${c.allowed_models.length - 2}` : ''}
                    </span>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '编辑渠道' : '添加渠道'}
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">渠道名称</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
                placeholder="OpenAI 主力"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">类型</label>
              <select
                value={form.provider}
                onChange={(e) => {
                  const p = e.target.value as ChannelProvider;
                  setForm({
                    ...form,
                    provider: p,
                    base_url: editing ? form.base_url : PROVIDER_DEFAULTS[p],
                    // Drop allowed_group_ids that don't match the new provider —
                    // a channel only ever routes to its own provider's groups.
                    allowed_group_ids: form.allowed_group_ids.filter((id) =>
                      groups.find((g) => g.id === id)?.provider === p
                    ),
                  });
                }}
                disabled={!!editing}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
              >
                <option value="openai">OpenAI 兼容</option>
                <option value="anthropic">Anthropic 原生</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Base URL</label>
            <input
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="https://api.openai.com"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">
              API Key {editing && <span className="text-gray-600">(留空则不修改)</span>}
            </label>
            <input
              type="password"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder={editing ? '留空保留原 Key' : 'sk-...'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">优先级 (数字越小越优先)</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">权重</label>
              <input
                type="number"
                min="1"
                value={form.weight}
                onChange={(e) => setForm({ ...form, weight: e.target.value })}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-400">
                允许模型 <span className="text-gray-600">(留空表示全部)</span>
              </label>
              <button
                type="button"
                onClick={fetchUpstreamModels}
                disabled={
                  previewMut.isPending ||
                  channelModelsMut.isPending ||
                  (!editing && (!form.base_url.trim() || !form.api_key.trim()))
                }
                className="text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-50 flex items-center gap-1.5"
                title={
                  !editing && (!form.base_url.trim() || !form.api_key.trim())
                    ? '需先填写 Base URL 和 API Key'
                    : '从上游拉取可用模型'
                }
              >
                {(previewMut.isPending || channelModelsMut.isPending) && (
                  <Spinner className="w-3 h-3 border-cyan-500/30 border-t-cyan-400" />
                )}
                获取模型列表
              </button>
            </div>

            {fetchError && (
              <div className="text-xs text-rose-400 px-2 py-1.5 rounded bg-rose-500/10 border border-rose-500/20 mb-2">
                {fetchError}
              </div>
            )}

            {fetchedModels.length > 0 && (
              <div className="bg-base-200 border border-base-300 rounded-lg mb-2">
                <div className="flex items-center justify-between px-3 py-2 border-b border-base-300 text-[10px] text-gray-500">
                  <span>上游返回 {fetchedModels.length} 个模型</span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={selectAllFetched}
                      className="text-cyan-400 hover:text-cyan-300"
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={clearAllowed}
                      className="text-gray-400 hover:text-gray-200"
                    >
                      清空
                    </button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto scrollbar-thin p-2 grid grid-cols-1 md:grid-cols-2 gap-1">
                  {fetchedModels.map((m) => {
                    const checked = parsedAllowed.has(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs font-mono ${
                          checked
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'text-gray-400 hover:bg-base-300/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAllowedModel(m.id)}
                          className="accent-amber-500"
                        />
                        <span className="truncate" title={m.id}>
                          {m.id}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              className="w-full bg-base-200 border border-base-300 rounded-lg px-2 py-1.5 min-h-[42px] max-h-40 overflow-y-auto scrollbar-thin flex flex-wrap gap-1.5 items-center content-start focus-within:border-amber-500 transition-colors cursor-text"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.tagName !== 'INPUT' && target.tagName !== 'BUTTON') {
                  (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus();
                }
              }}
            >
              {Array.from(parsedAllowed).map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono"
                >
                  <span className="truncate max-w-[200px]" title={name}>{name}</span>
                  <button
                    type="button"
                    onClick={() => removeAllowedModel(name)}
                    className="w-4 h-4 inline-flex items-center justify-center rounded text-amber-400/70 hover:text-amber-200 hover:bg-amber-500/20 leading-none"
                    aria-label={`移除 ${name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={chipInput}
                onChange={(e) => setChipInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                    if (chipInput.trim()) {
                      e.preventDefault();
                      commitChipInput();
                    }
                  } else if (e.key === 'Backspace' && chipInput === '' && parsedAllowed.size > 0) {
                    const arr = Array.from(parsedAllowed);
                    removeAllowedModel(arr[arr.length - 1]);
                  }
                }}
                onBlur={commitChipInput}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  if (/[,\s]/.test(text)) {
                    e.preventDefault();
                    const items = text
                      .split(/[,\s]+/)
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const next = new Set(parsedAllowed);
                    items.forEach((it) => next.add(it));
                    setAllowedList(next);
                    setChipInput('');
                  }
                }}
                className="flex-1 min-w-[160px] bg-transparent text-sm font-mono text-gray-200 focus:outline-none placeholder:text-gray-600 px-1 py-0.5"
                placeholder={parsedAllowed.size === 0 ? '从上方勾选，或输入模型名后回车 / 逗号添加' : ''}
              />
              {parsedAllowed.size > 0 && (
                <button
                  type="button"
                  onClick={clearAllowed}
                  className="text-[10px] text-gray-500 hover:text-gray-300 px-1.5"
                  title="清空全部"
                >
                  清空
                </button>
              )}
            </div>
            {modelNames.length > 0 && fetchedModels.length === 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-[10px] text-gray-600 mr-1">常用：</span>
                {modelNames.slice(0, 8).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggleAllowedModel(n)}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      parsedAllowed.has(n)
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-base-200 hover:bg-base-300 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">
              允许分组 <span className="text-gray-600">(不选则该厂商全部分组可用)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {groups
                .filter((g) => g.provider === form.provider)
                .map((g) => {
                  const active = form.allowed_group_ids.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroupId(g.id)}
                      className={`px-2.5 py-1 rounded text-xs transition-colors ${
                        active
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-base-200 text-gray-400 border border-base-300 hover:text-gray-200'
                      }`}
                    >
                      {g.label}
                    </button>
                  );
                })}
              {groups.filter((g) => g.provider === form.provider).length === 0 && (
                <span className="text-[10px] text-gray-600">该厂商暂无分组</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">启用</span>
            <Toggle active={form.enabled} onToggle={() => setForm({ ...form, enabled: !form.enabled })} />
          </div>

          {formError && (
            <div className="text-xs text-rose-400 px-2 py-1.5 rounded bg-rose-500/10 border border-rose-500/20">
              {formError}
            </div>
          )}

          <button
            onClick={submit}
            disabled={createMut.isPending || updateMut.isPending}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            {(createMut.isPending || updateMut.isPending) && (
              <Spinner className="border-black/30 border-t-black" />
            )}
            {editing ? '保存修改' : '确认添加'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
