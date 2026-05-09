import { useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Toggle from '@/components/ui/Toggle';
import Spinner from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api';
import {
  useGroups,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  multiplierAsNumber,
  formatMultiplier,
  type Group,
} from '@/hooks/useGroups';
import { useModels, formatPrice, type Model } from '@/hooks/useModels';

interface FormState {
  name: string;
  label: string;
  multiplier: string;
  description: string;
}

const BLANK: FormState = { name: '', label: '', multiplier: '1.0', description: '' };

export default function GroupsPage() {
  const { data: groups = [], isLoading } = useGroups();
  const { data: models = [] } = useModels();
  const createMut = useCreateGroup();
  const updateMut = useUpdateGroup();
  const deleteMut = useDeleteGroup();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [formError, setFormError] = useState<string | null>(null);

  const [previewModelId, setPreviewModelId] = useState<number | null>(null);
  const previewModel: Model | undefined = useMemo(() => {
    if (!models.length) return undefined;
    return models.find((m) => m.id === previewModelId) ?? models[0];
  }, [models, previewModelId]);

  const openCreate = () => {
    setEditing(null);
    setForm(BLANK);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (g: Group) => {
    setEditing(g);
    setForm({
      name: g.name,
      label: g.label,
      multiplier: formatMultiplier(g.multiplier),
      description: g.description,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const submit = async () => {
    setFormError(null);
    const multiplier = parseFloat(form.multiplier);
    if (!Number.isFinite(multiplier) || multiplier < 0) {
      setFormError('倍率需为 >= 0 的数字');
      return;
    }
    try {
      if (editing) {
        await updateMut.mutateAsync({
          id: editing.id,
          patch: {
            label: form.label.trim(),
            multiplier,
            description: form.description,
          },
        });
      } else {
        if (!form.name.trim()) {
          setFormError('分组标识必填');
          return;
        }
        if (!form.label.trim()) {
          setFormError('分组名称必填');
          return;
        }
        await createMut.mutateAsync({
          name: form.name.trim(),
          label: form.label.trim(),
          multiplier,
          description: form.description,
        });
      }
      setModalOpen(false);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : '保存失败');
    }
  };

  const toggleEnabled = (g: Group) => {
    updateMut.mutate({ id: g.id, patch: { enabled: !g.enabled } });
  };

  const remove = (g: Group) => {
    if (!confirm(`确认删除分组「${g.label}」？`)) return;
    deleteMut.mutate(g.id, {
      onError: (e) => alert(e instanceof ApiError ? e.message : '删除失败'),
    });
  };

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">分组管理</h2>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium rounded-lg transition-colors"
        >
          + 添加分组
        </button>
      </div>

      <div className="stat-card rounded-xl p-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="text-amber-400">说明：</span>
          分组用于给不同用户群体设置独立的价格倍率。模型最终价格 = 模型官方价格 × 分组倍率。
          例如 <span className="font-mono text-gray-300">claude-opus-4-7</span> 官方价
          {' '}<span className="font-mono">$15.00 / $75.00</span>，
          <span className="font-mono text-gray-300">aws</span> 分组倍率
          {' '}<span className="font-mono">0.4</span>，则实际价格为
          {' '}<span className="font-mono text-emerald-400">$6.00 / $30.00</span>。
        </p>
      </div>

      <div className="stat-card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-base-300 bg-base-200/50">
              <th className="text-left p-4 font-medium">分组标识</th>
              <th className="text-left p-4 font-medium">分组名称</th>
              <th className="text-center p-4 font-medium">倍率</th>
              <th className="text-left p-4 font-medium">描述</th>
              <th className="text-center p-4 font-medium">启用</th>
              <th className="text-center p-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500 text-xs">
                  <Spinner className="mr-2" /> 加载中...
                </td>
              </tr>
            )}
            {!isLoading && groups.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500 text-xs">
                  暂无分组
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <tr
                key={g.id}
                className="border-b border-base-300/50 hover:bg-base-200/30 transition-colors"
              >
                <td className="p-4">
                  <span className="font-mono text-xs px-2 py-1 bg-base-200 rounded text-amber-400">
                    {g.name}
                  </span>
                </td>
                <td className="p-4 text-gray-200">{g.label}</td>
                <td className="p-4 text-center">
                  <span className="font-mono text-sm text-amber-400">
                    ×{formatMultiplier(g.multiplier)}
                  </span>
                </td>
                <td className="p-4 text-xs text-gray-500">{g.description || '—'}</td>
                <td className="p-4 text-center">
                  <div className="inline-block">
                    <Toggle active={g.enabled} onToggle={() => toggleEnabled(g)} />
                  </div>
                </td>
                <td className="p-4 text-center">
                  <button
                    onClick={() => openEdit(g)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 mr-3"
                  >
                    编辑
                  </button>
                  {g.name !== 'default' && (
                    <button
                      onClick={() => remove(g)}
                      className="text-xs text-rose-400 hover:text-rose-300"
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {previewModel && (
        <div className="stat-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-300">价格预览</h3>
            <select
              value={previewModel.id}
              onChange={(e) => setPreviewModelId(Number(e.target.value))}
              className="bg-base-200 border border-base-300 rounded-lg px-3 py-1.5 text-xs font-mono text-gray-200 focus:outline-none focus:border-amber-500"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-3 bg-base-200/50 rounded-lg border border-base-300/50">
              <p className="text-[10px] text-gray-500 mb-1">官方价格 ($/1M)</p>
              <p className="font-mono text-sm text-gray-300">
                输入 ${formatPrice(previewModel.input_price_cents)}
              </p>
              <p className="font-mono text-sm text-gray-300">
                输出 ${formatPrice(previewModel.output_price_cents)}
              </p>
            </div>
            {groups
              .filter((g) => g.enabled)
              .map((g) => {
                const mult = multiplierAsNumber(g.multiplier);
                return (
                  <div
                    key={g.id}
                    className="p-3 bg-base-200/50 rounded-lg border border-base-300/50"
                  >
                    <p className="text-[10px] text-gray-500 mb-1 flex justify-between">
                      <span className="text-amber-400">{g.label}</span>
                      <span className="font-mono">×{formatMultiplier(g.multiplier)}</span>
                    </p>
                    <p className="font-mono text-sm text-emerald-400">
                      输入 ${formatPrice(Math.round(previewModel.input_price_cents * mult))}
                    </p>
                    <p className="font-mono text-sm text-emerald-400">
                      输出 ${formatPrice(Math.round(previewModel.output_price_cents * mult))}
                    </p>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '编辑分组' : '添加分组'}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">分组标识 (英文, a-z0-9_-)</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={!!editing}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
              placeholder="aws"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">分组名称</label>
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="AWS 分组"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">倍率</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.multiplier}
              onChange={(e) => setForm({ ...form, multiplier: e.target.value })}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-amber-400 focus:outline-none focus:border-amber-500"
              placeholder="0.4"
            />
            <p className="text-[10px] text-gray-600 mt-1">最终价格 = 模型官方价格 × 倍率</p>
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
