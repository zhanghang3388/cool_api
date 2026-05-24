import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import Toggle from '@/components/ui/Toggle';
import { ApiError } from '@/lib/api';
import {
  useGroups,
  multiplierAsNumber,
  formatMultiplier,
  PROVIDER_LABELS,
  PROVIDER_ORDER,
  type Group,
  type GroupProvider,
} from '@/hooks/useGroups';
import {
  useModels,
  useCreateModel,
  useUpdateModel,
  useDeleteModel,
  useSyncPreview,
  useSyncApply,
  formatPrice,
  dollarsToCents,
  type Model,
  type SyncPreviewItem,
  type SyncApplyResponse,
} from '@/hooks/useModels';
import { useChannels } from '@/hooks/useChannels';

interface FormState {
  name: string;
  provider: string;
  inputPriceDollars: string;
  outputPriceDollars: string;
  cacheReadPriceDollars: string;
  cacheWritePriceDollars: string;
  description: string;
  enabled: boolean;
}

const BLANK: FormState = {
  name: '',
  provider: 'OpenAI',
  inputPriceDollars: '',
  outputPriceDollars: '',
  cacheReadPriceDollars: '',
  cacheWritePriceDollars: '',
  description: '',
  enabled: true,
};

function modelMatchesProvider(model: Model, provider: GroupProvider): boolean {
  return model.provider.toLowerCase() === provider;
}

export default function ModelsPage() {
  const { data: models = [], isLoading } = useModels();
  const { data: groups = [] } = useGroups();
  const createMut = useCreateModel();
  const updateMut = useUpdateModel();
  const deleteMut = useDeleteModel();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Model | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [formError, setFormError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(BLANK);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (m: Model) => {
    setEditing(m);
    setForm({
      name: m.name,
      provider: m.provider,
      inputPriceDollars: formatPrice(m.input_price_cents),
      outputPriceDollars: formatPrice(m.output_price_cents),
      cacheReadPriceDollars:
        m.cache_read_price_cents != null ? formatPrice(m.cache_read_price_cents) : '',
      cacheWritePriceDollars:
        m.cache_write_price_cents != null ? formatPrice(m.cache_write_price_cents) : '',
      description: m.description,
      enabled: m.enabled,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const submit = async () => {
    setFormError(null);
    const input = parseFloat(form.inputPriceDollars);
    const output = parseFloat(form.outputPriceDollars);
    if (!form.name.trim()) return setFormError('模型名必填');
    if (!form.provider.trim()) return setFormError('供应商必填');
    if (!Number.isFinite(input) || input < 0) return setFormError('输入价格需为 >= 0');
    if (!Number.isFinite(output) || output < 0) return setFormError('输出价格需为 >= 0');

    const readTrim = form.cacheReadPriceDollars.trim();
    let cache_read_price_cents: number | null = null;
    if (readTrim !== '') {
      const c = parseFloat(readTrim);
      if (!Number.isFinite(c) || c < 0) return setFormError('缓存读价格需为 >= 0');
      cache_read_price_cents = dollarsToCents(c);
    }

    const writeTrim = form.cacheWritePriceDollars.trim();
    let cache_write_price_cents: number | null = null;
    if (writeTrim !== '') {
      const w = parseFloat(writeTrim);
      if (!Number.isFinite(w) || w < 0) return setFormError('缓存写价格需为 >= 0');
      cache_write_price_cents = dollarsToCents(w);
    }

    try {
      if (editing) {
        await updateMut.mutateAsync({
          id: editing.id,
          patch: {
            provider: form.provider.trim(),
            input_price_cents: dollarsToCents(input),
            output_price_cents: dollarsToCents(output),
            cache_read_price_cents,
            cache_write_price_cents,
            description: form.description,
            enabled: form.enabled,
          },
        });
      } else {
        await createMut.mutateAsync({
          name: form.name.trim(),
          provider: form.provider.trim(),
          input_price_cents: dollarsToCents(input),
          output_price_cents: dollarsToCents(output),
          cache_read_price_cents,
          cache_write_price_cents,
          description: form.description,
          enabled: form.enabled,
        });
      }
      setModalOpen(false);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : '保存失败');
    }
  };

  const toggleEnabled = (m: Model) => {
    updateMut.mutate({ id: m.id, patch: { enabled: !m.enabled } });
  };

  const remove = (m: Model) => {
    if (!confirm(`确认删除模型「${m.name}」？`)) return;
    deleteMut.mutate(m.id, {
      onError: (e) => alert(e instanceof ApiError ? e.message : '删除失败'),
    });
  };

  // ---- sync from channel ----
  const { data: channels = [] } = useChannels();
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncChannelId, setSyncChannelId] = useState<number | null>(null);
  const [syncSelected, setSyncSelected] = useState<Set<string>>(new Set());
  const [syncResult, setSyncResult] = useState<SyncApplyResponse | null>(null);
  const previewMut = useSyncPreview();
  const applyMut = useSyncApply();
  const previewData = previewMut.data;

  const openSync = () => {
    setSyncOpen(true);
    setSyncChannelId(channels[0]?.id ?? null);
    setSyncSelected(new Set());
    setSyncResult(null);
    previewMut.reset();
    applyMut.reset();
  };

  const runPreview = async () => {
    if (syncChannelId == null) return;
    setSyncResult(null);
    setSyncSelected(new Set());
    try {
      const res = await previewMut.mutateAsync(syncChannelId);
      const next = new Set<string>();
      res.items.forEach((it) => {
        if (!it.exists) next.add(it.model_name);
      });
      setSyncSelected(next);
    } catch {
      /* error surfaced by mutation state */
    }
  };

  const toggleSyncRow = (name: string, exists: boolean) => {
    if (exists) return;
    const next = new Set(syncSelected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSyncSelected(next);
  };

  const importableCount = previewData?.items.filter((i) => !i.exists).length ?? 0;

  const setAllSelected = (checked: boolean) => {
    if (!previewData) return;
    if (!checked) {
      setSyncSelected(new Set());
      return;
    }
    const next = new Set<string>();
    previewData.items.forEach((it) => {
      if (!it.exists) next.add(it.model_name);
    });
    setSyncSelected(next);
  };

  const submitSync = async () => {
    if (syncChannelId == null || syncSelected.size === 0) return;
    try {
      const res = await applyMut.mutateAsync({
        channel_id: syncChannelId,
        model_names: Array.from(syncSelected),
      });
      setSyncResult(res);
      setSyncSelected(new Set());
      if (syncChannelId != null) {
        previewMut.mutate(syncChannelId);
      }
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '同步失败');
    }
  };

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">模型价格</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={openSync}
            className="px-4 py-2 bg-base-200 hover:bg-base-300 border border-base-300 text-gray-200 text-sm font-medium rounded-lg transition-colors"
          >
            从渠道同步
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium rounded-lg transition-colors"
          >
            + 添加模型
          </button>
        </div>
      </div>

      {PROVIDER_ORDER.map((provider) => (
        <ProviderModelsSection
          key={provider}
          provider={provider}
          isLoading={isLoading}
          models={models.filter((m) => modelMatchesProvider(m, provider))}
          groups={groups.filter((g) => g.provider === provider)}
          onEdit={openEdit}
          onToggle={toggleEnabled}
          onRemove={remove}
        />
      ))}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '编辑模型' : '添加模型'}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">模型名</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={!!editing}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                placeholder="gpt-4o"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">供应商</label>
              <input
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
                placeholder="OpenAI"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">输入价格 ($/1M)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.inputPriceDollars}
                onChange={(e) => setForm({ ...form, inputPriceDollars: e.target.value })}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
                placeholder="2.50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">输出价格 ($/1M)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.outputPriceDollars}
                onChange={(e) => setForm({ ...form, outputPriceDollars: e.target.value })}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
                placeholder="10.00"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">缓存读价格 ($/1M, 可选)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.cacheReadPriceDollars}
                onChange={(e) => setForm({ ...form, cacheReadPriceDollars: e.target.value })}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
                placeholder="留空则按输入价"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">缓存写价格 ($/1M, 可选)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.cacheWritePriceDollars}
                onChange={(e) => setForm({ ...form, cacheWritePriceDollars: e.target.value })}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
                placeholder="Anthropic 约 ×1.25"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">描述</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="可选"
            />
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

      <Modal
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        title="从渠道同步价格"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="text-[11px] text-gray-500 leading-relaxed">
            选一个已有渠道 → 拉它 <code className="font-mono text-amber-400">/v1/models</code>{' '}
            支持的模型 → 与 <a
              href="https://models.dev"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline"
            >models.dev</a>{' '}
            的官方价目对齐 → 已存在的跳过；无官方价目的略过；价格按 1 USD = 1 ¥ 直接换算。
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">渠道</label>
              <select
                value={syncChannelId ?? ''}
                onChange={(e) => setSyncChannelId(Number(e.target.value))}
                disabled={channels.length === 0}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
              >
                {channels.length === 0 && <option value="">暂无渠道</option>}
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.provider})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={runPreview}
              disabled={syncChannelId == null || previewMut.isPending}
              className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-300 text-sm rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {previewMut.isPending && <Spinner className="border-cyan-500/30 border-t-cyan-300" />}
              拉取并对齐
            </button>
          </div>

          {previewMut.isError && (
            <div className="text-xs text-rose-400 px-2 py-1.5 rounded bg-rose-500/10 border border-rose-500/20">
              {previewMut.error instanceof ApiError ? previewMut.error.message : '拉取失败'}
            </div>
          )}

          {previewData && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>
                  上游 {previewData.upstream_total} 个模型 ·
                  匹配价目 {previewData.items.length} 个 ·
                  无价目跳过 {previewData.no_pricing} 个 ·
                  已勾选 {syncSelected.size} / 可同步 {importableCount}
                </span>
                {importableCount > 0 && (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setAllSelected(true)}
                      className="text-cyan-400 hover:text-cyan-300"
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllSelected(false)}
                      className="text-gray-400 hover:text-gray-200"
                    >
                      全不选
                    </button>
                  </div>
                )}
              </div>

              {previewData.items.length === 0 ? (
                <div className="text-xs text-gray-500 px-3 py-6 text-center bg-base-200/40 rounded-lg border border-base-300">
                  没有可同步的模型——上游返回的模型 models.dev 都没有价目。
                </div>
              ) : (
                <div className="rounded-lg border border-base-300 bg-base-200/40 max-h-[420px] overflow-y-auto scrollbar-thin">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] text-gray-500 bg-base-200/80 sticky top-0">
                      <tr>
                        <th className="text-left p-2 pl-3 w-8"></th>
                        <th className="text-left p-2">模型</th>
                        <th className="text-right p-2">输入 ¥/1M</th>
                        <th className="text-right p-2">输出 ¥/1M</th>
                        <th className="text-right p-2">缓存读 ¥/1M</th>
                        <th className="text-right p-2 pr-3">缓存写 ¥/1M</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-base-300">
                      {previewData.items.map((it) => (
                        <SyncRow
                          key={it.model_name}
                          item={it}
                          checked={syncSelected.has(it.model_name)}
                          onToggle={() => toggleSyncRow(it.model_name, it.exists)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {syncResult && (
            <div className="text-xs px-3 py-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 space-y-1">
              <div>
                已添加 {syncResult.added.length} 个 · 已存在跳过 {syncResult.skipped_existing.length} 个
                {syncResult.skipped_no_price.length > 0 &&
                  ` · 无价目跳过 ${syncResult.skipped_no_price.length} 个`}
              </div>
              {syncResult.added.length > 0 && (
                <div className="font-mono text-[10px] text-gray-400 break-all">
                  + {syncResult.added.join('、')}
                </div>
              )}
            </div>
          )}

          <button
            onClick={submitSync}
            disabled={syncSelected.size === 0 || applyMut.isPending}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            {applyMut.isPending && <Spinner className="border-black/30 border-t-black" />}
            {syncSelected.size === 0 ? '请勾选要导入的模型' : `导入 ${syncSelected.size} 个模型`}
          </button>
        </div>
      </Modal>
    </div>
  );
}

interface ProviderModelsSectionProps {
  provider: GroupProvider;
  isLoading: boolean;
  models: Model[];
  groups: Group[];
  onEdit: (m: Model) => void;
  onToggle: (m: Model) => void;
  onRemove: (m: Model) => void;
}

function ProviderModelsSection({
  provider,
  isLoading,
  models,
  groups,
  onEdit,
  onToggle,
  onRemove,
}: ProviderModelsSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const enabledGroups = useMemo(() => groups.filter((g) => g.enabled), [groups]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const selectedGroup: Group | undefined =
    enabledGroups.find((g) => g.id === selectedGroupId) ?? enabledGroups[0];
  const multiplier = selectedGroup ? multiplierAsNumber(selectedGroup.multiplier) : 1;

  const providerStyle =
    provider === 'anthropic'
      ? 'bg-amber-500/10 text-amber-400'
      : 'bg-emerald-500/10 text-emerald-400';

  return (
    <div className="stat-card rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full px-4 py-3 bg-base-200/50 border-b border-base-300 flex items-center gap-3 hover:bg-base-200 transition-colors"
      >
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
        />
        <span className={`px-2 py-0.5 rounded text-xs font-mono ${providerStyle}`}>
          {PROVIDER_LABELS[provider]}
        </span>
        <span className="text-[11px] text-gray-500">
          {models.length} 个模型 · {enabledGroups.length} 个启用分组
        </span>
      </button>

      {!collapsed && (
        <div className="p-4 space-y-3">
          {enabledGroups.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-gray-500 whitespace-nowrap">按分组查看价格：</span>
              <div className="flex gap-2 flex-wrap flex-1">
                {enabledGroups.map((g) => {
                  const active = selectedGroup?.id === g.id;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroupId(g.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 ${
                        active
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-base-200 text-gray-400 border border-base-300 hover:text-gray-200'
                      }`}
                    >
                      {g.label}
                      <span
                        className={`font-mono text-[10px] px-1 rounded ${
                          active ? 'bg-amber-500/20' : 'bg-base-300'
                        }`}
                      >
                        ×{formatMultiplier(g.multiplier)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-lg overflow-hidden border border-base-300/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-base-300 bg-base-200/30">
                  <th className="text-left p-4 font-medium">模型</th>
                  <th className="text-left p-4 font-medium">供应商</th>
                  <th className="text-right p-4 font-medium">官方输入 ($/1M)</th>
                  <th className="text-right p-4 font-medium">官方输出 ($/1M)</th>
                  <th className="text-right p-4 font-medium">
                    {selectedGroup ? (
                      <span className="text-amber-400">{selectedGroup.label} 输入 (￥/1M)</span>
                    ) : (
                      '实际输入'
                    )}
                  </th>
                  <th className="text-right p-4 font-medium">
                    {selectedGroup ? (
                      <span className="text-amber-400">{selectedGroup.label} 输出 (￥/1M)</span>
                    ) : (
                      '实际输出'
                    )}
                  </th>
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
                {!isLoading && models.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-500 text-xs">
                      暂无数据
                    </td>
                  </tr>
                )}
                {models.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-base-300/50 hover:bg-base-200/30 transition-colors last:border-0"
                  >
                    <td className="p-4 font-mono text-amber-400/90 text-xs">{m.name}</td>
                    <td className="p-4 text-gray-400 text-xs">{m.provider}</td>
                    <td className="p-4 text-right font-mono text-gray-400">
                      ${formatPrice(m.input_price_cents)}
                    </td>
                    <td className="p-4 text-right font-mono text-gray-400">
                      ${formatPrice(m.output_price_cents)}
                    </td>
                    <td className="p-4 text-right font-mono text-emerald-400">
                      ￥{formatPrice(Math.round(m.input_price_cents * multiplier))}
                    </td>
                    <td className="p-4 text-right font-mono text-emerald-400">
                      ￥{formatPrice(Math.round(m.output_price_cents * multiplier))}
                    </td>
                    <td className="p-4 text-center">
                      <div className="inline-block">
                        <Toggle active={m.enabled} onToggle={() => onToggle(m)} />
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => onEdit(m)}
                        className="text-xs text-cyan-400 hover:text-cyan-300 mr-3"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => onRemove(m)}
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
        </div>
      )}
    </div>
  );
}

interface SyncRowProps {
  item: SyncPreviewItem;
  checked: boolean;
  onToggle: () => void;
}

function SyncRow({ item, checked, onToggle }: SyncRowProps) {
  const fmt = (cents: number | null) =>
    cents == null ? <span className="text-gray-600">—</span> : (cents / 100).toFixed(2);
  return (
    <tr
      className={`${item.exists ? 'opacity-60' : 'hover:bg-base-300/30 cursor-pointer'}`}
      onClick={onToggle}
    >
      <td className="p-2 pl-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={item.exists}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="accent-amber-500"
        />
      </td>
      <td className="p-2">
        <div className="font-mono text-gray-200 truncate max-w-[260px]" title={item.model_name}>
          {item.model_name}
        </div>
        {item.exists && (
          <div className="text-[10px] text-gray-500">已存在 · 跳过</div>
        )}
      </td>
      <td className="p-2 text-right font-mono text-gray-300">{fmt(item.official.input_price_cents)}</td>
      <td className="p-2 text-right font-mono text-gray-300">{fmt(item.official.output_price_cents)}</td>
      <td className="p-2 text-right font-mono text-gray-400">{fmt(item.official.cache_read_price_cents)}</td>
      <td className="p-2 pr-3 text-right font-mono text-gray-400">{fmt(item.official.cache_write_price_cents)}</td>
    </tr>
  );
}
