import { useMemo, useState } from 'react';
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

const STATUS_STYLE: Record<ChannelStatus, { dot: string; label: string }> = {
  active: { dot: 'bg-emerald-500', label: '正常' },
  warning: { dot: 'bg-amber-500', label: '警告' },
  error: { dot: 'bg-rose-500', label: '错误' },
  disabled: { dot: 'bg-gray-500', label: '已停用' },
};

const PROVIDER_STYLE: Record<ChannelProvider, string> = {
  openai: 'bg-emerald-500/10 text-emerald-400',
  anthropic: 'bg-amber-500/10 text-amber-400',
};

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
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">渠道管理</h2>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium rounded-lg transition-colors"
        >
          + 添加渠道
        </button>
      </div>

      {testResult && (
        <div
          className={`stat-card rounded-xl p-4 text-xs flex items-start gap-3 ${
            testResult.ok ? 'border-emerald-500/30' : 'border-rose-500/30'
          }`}
        >
          <span
            className={`w-2 h-2 mt-1.5 rounded-full ${testResult.ok ? 'bg-emerald-500' : 'bg-rose-500'} pulse-dot`}
          />
          <div className="flex-1">
            <div className={testResult.ok ? 'text-emerald-400' : 'text-rose-400'}>
              渠道 #{testResult.id} {testResult.ok ? '测试通过' : '测试失败'} · {testResult.ms}ms
            </div>
            <div className="text-gray-500 font-mono mt-1 break-all">{testResult.detail}</div>
          </div>
          <button onClick={() => setTestResult(null)} className="text-gray-600 hover:text-gray-300">
            &times;
          </button>
        </div>
      )}

      <div className="stat-card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-base-300 bg-base-200/50">
              <th className="text-left p-4 font-medium">渠道名称</th>
              <th className="text-left p-4 font-medium">类型</th>
              <th className="text-center p-4 font-medium">状态</th>
              <th className="text-center p-4 font-medium">优先级</th>
              <th className="text-center p-4 font-medium">权重</th>
              <th className="text-left p-4 font-medium">模型</th>
              <th className="text-center p-4 font-medium">启用</th>
              <th className="text-center p-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-500 text-xs">
                  <Spinner className="mr-2" /> 加载中...
                </td>
              </tr>
            )}
            {!isLoading && channels.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-500 text-xs">
                  暂无渠道，点击右上角「添加渠道」创建第一个。
                </td>
              </tr>
            )}
            {channels.map((c) => (
              <tr
                key={c.id}
                className="border-b border-base-300/50 hover:bg-base-200/30 transition-colors"
              >
                <td className="p-4">
                  <div className="text-gray-200">{c.name}</div>
                  <div className="text-[10px] font-mono text-gray-600 mt-0.5">{c.api_key_masked}</div>
                  <div className="text-[10px] font-mono text-gray-600">{c.base_url}</div>
                </td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-mono ${PROVIDER_STYLE[c.provider]}`}>
                    {c.provider}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <div className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${STATUS_STYLE[c.status].dot} pulse-dot`} />
                    <span className="text-[10px] text-gray-500">{STATUS_STYLE[c.status].label}</span>
                  </div>
                </td>
                <td className="p-4 text-center font-mono text-gray-400">{c.priority}</td>
                <td className="p-4 text-center font-mono text-gray-400">{c.weight}</td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1">
                    {c.allowed_models.length === 0 ? (
                      <span className="text-[10px] text-gray-600">全部</span>
                    ) : (
                      c.allowed_models.slice(0, 3).map((m) => (
                        <span
                          key={m}
                          className="px-1.5 py-0.5 rounded bg-base-200 text-[10px] font-mono text-gray-400"
                        >
                          {m}
                        </span>
                      ))
                    )}
                    {c.allowed_models.length > 3 && (
                      <span className="text-[10px] text-gray-600">+{c.allowed_models.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="p-4 text-center">
                  <div className="inline-block">
                    <Toggle active={c.enabled} onToggle={() => toggleEnabled(c)} />
                  </div>
                </td>
                <td className="p-4 text-center whitespace-nowrap">
                  <button
                    onClick={() => runTest(c)}
                    disabled={testingId === c.id}
                    className="text-xs text-cyan-400 hover:text-cyan-300 mr-3 disabled:opacity-50"
                  >
                    {testingId === c.id ? '测试中...' : '测试'}
                  </button>
                  <button
                    onClick={() => openEdit(c)}
                    className="text-xs text-gray-400 hover:text-gray-200 mr-3"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => remove(c)}
                    className="text-xs text-rose-400 hover:text-rose-300"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                  setForm({ ...form, provider: p, base_url: editing ? form.base_url : PROVIDER_DEFAULTS[p] });
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
              允许分组 <span className="text-gray-600">(不选则全部分组可用)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => {
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
