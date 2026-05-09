import { useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import Toggle from '@/components/ui/Toggle';
import { ApiError } from '@/lib/api';
import {
  useGroups,
  multiplierAsNumber,
  formatMultiplier,
  type Group,
} from '@/hooks/useGroups';
import {
  useModels,
  useCreateModel,
  useUpdateModel,
  useDeleteModel,
  formatPrice,
  dollarsToCents,
  type Model,
} from '@/hooks/useModels';

interface FormState {
  name: string;
  provider: string;
  inputPriceDollars: string;
  outputPriceDollars: string;
  cacheReadPriceDollars: string;
  description: string;
  enabled: boolean;
}

const BLANK: FormState = {
  name: '',
  provider: 'OpenAI',
  inputPriceDollars: '',
  outputPriceDollars: '',
  cacheReadPriceDollars: '',
  description: '',
  enabled: true,
};

export default function ModelsPage() {
  const { data: models = [], isLoading } = useModels();
  const { data: groups = [] } = useGroups();
  const createMut = useCreateModel();
  const updateMut = useUpdateModel();
  const deleteMut = useDeleteModel();

  const enabledGroups = useMemo(() => groups.filter((g) => g.enabled), [groups]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const selectedGroup: Group | undefined =
    enabledGroups.find((g) => g.id === selectedGroupId) ?? enabledGroups[0];
  const multiplier = selectedGroup ? multiplierAsNumber(selectedGroup.multiplier) : 1;

  const [providerFilter, setProviderFilter] = useState('all');
  const providers = useMemo(() => {
    const set = new Set<string>();
    models.forEach((m) => set.add(m.provider));
    return Array.from(set).sort();
  }, [models]);

  const filtered = providerFilter === 'all' ? models : models.filter((m) => m.provider === providerFilter);

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

    const cacheTrim = form.cacheReadPriceDollars.trim();
    let cache_read_price_cents: number | null = null;
    if (cacheTrim !== '') {
      const c = parseFloat(cacheTrim);
      if (!Number.isFinite(c) || c < 0) return setFormError('缓存读价格需为 >= 0');
      cache_read_price_cents = dollarsToCents(c);
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

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">模型价格</h2>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium rounded-lg transition-colors"
        >
          + 添加模型
        </button>
      </div>

      {/* Group selector */}
      {enabledGroups.length > 0 && (
        <div className="stat-card rounded-xl p-4 flex items-center gap-4 flex-wrap">
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
          {selectedGroup && (
            <div className="text-xs text-gray-500">
              当前倍率：<span className="font-mono text-amber-400">×{formatMultiplier(selectedGroup.multiplier)}</span>
              {selectedGroup.description && (
                <span className="ml-2 text-gray-600">({selectedGroup.description})</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Provider filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setProviderFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
            providerFilter === 'all'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'bg-base-200 text-gray-400 border border-base-300 hover:text-gray-200'
          }`}
        >
          全部
        </button>
        {providers.map((p) => (
          <button
            key={p}
            onClick={() => setProviderFilter(p)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
              providerFilter === p
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-base-200 text-gray-400 border border-base-300 hover:text-gray-200'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="stat-card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-base-300 bg-base-200/50">
              <th className="text-left p-4 font-medium">模型</th>
              <th className="text-left p-4 font-medium">供应商</th>
              <th className="text-right p-4 font-medium">官方输入 ($/1M)</th>
              <th className="text-right p-4 font-medium">官方输出 ($/1M)</th>
              <th className="text-right p-4 font-medium">
                {selectedGroup ? (
                  <span className="text-amber-400">{selectedGroup.label} 输入</span>
                ) : (
                  '实际输入'
                )}
              </th>
              <th className="text-right p-4 font-medium">
                {selectedGroup ? (
                  <span className="text-amber-400">{selectedGroup.label} 输出</span>
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
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-500 text-xs">
                  暂无数据
                </td>
              </tr>
            )}
            {filtered.map((m) => (
              <tr
                key={m.id}
                className="border-b border-base-300/50 hover:bg-base-200/30 transition-colors"
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
                  ${formatPrice(Math.round(m.input_price_cents * multiplier))}
                </td>
                <td className="p-4 text-right font-mono text-emerald-400">
                  ${formatPrice(Math.round(m.output_price_cents * multiplier))}
                </td>
                <td className="p-4 text-center">
                  <div className="inline-block">
                    <Toggle active={m.enabled} onToggle={() => toggleEnabled(m)} />
                  </div>
                </td>
                <td className="p-4 text-center">
                  <button
                    onClick={() => openEdit(m)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 mr-3"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => remove(m)}
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
          <div>
            <label className="text-xs text-gray-400 block mb-1">缓存读价格 ($/1M, 可选)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.cacheReadPriceDollars}
              onChange={(e) => setForm({ ...form, cacheReadPriceDollars: e.target.value })}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="留空表示不支持缓存"
            />
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
    </div>
  );
}
