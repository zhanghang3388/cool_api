import { useEffect, useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Toggle from '@/components/ui/Toggle';
import Spinner from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api';
import {
  useApiKeys,
  useCreateApiKey,
  useUpdateApiKey,
  useDeleteApiKey,
  type ApiKeyRow,
  type ApiKeyGroupsPayload,
} from '@/hooks/useApiKeys';
import { useUserGroups, type UserGroup } from '@/hooks/useUserGroups';
import { PROVIDER_LABELS, PROVIDER_ORDER, type GroupProvider } from '@/hooks/useGroups';

type GroupSelection = Partial<Record<GroupProvider, number>>;

function selectionToPayload(sel: GroupSelection): ApiKeyGroupsPayload {
  const out: ApiKeyGroupsPayload = {};
  PROVIDER_ORDER.forEach((p) => {
    const v = sel[p];
    if (typeof v === 'number') out[p] = v;
  });
  return out;
}

function selectionCount(sel: GroupSelection): number {
  return PROVIDER_ORDER.reduce((n, p) => (typeof sel[p] === 'number' ? n + 1 : n), 0);
}

export default function KeysPage() {
  const { data: keys = [], isLoading } = useApiKeys();
  const { data: groups = [], isLoading: groupsLoading } = useUserGroups();
  const createMut = useCreateApiKey();
  const updateMut = useUpdateApiKey();
  const deleteMut = useDeleteApiKey();

  const groupsByProvider = useMemo(() => {
    const map: Record<GroupProvider, UserGroup[]> = { anthropic: [], openai: [] };
    groups.forEach((g) => map[g.provider].push(g));
    return map;
  }, [groups]);

  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyGroups, setNewKeyGroups] = useState<GroupSelection>({});
  const [createError, setCreateError] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [editTarget, setEditTarget] = useState<ApiKeyRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editGroups, setEditGroups] = useState<GroupSelection>({});
  const [editError, setEditError] = useState<string | null>(null);

  // Pre-fill the create modal with the first available group per provider.
  useEffect(() => {
    if (!createOpen) return;
    setNewKeyGroups((prev) => {
      const next: GroupSelection = { ...prev };
      PROVIDER_ORDER.forEach((p) => {
        if (next[p] == null) {
          const first = groupsByProvider[p][0];
          if (first) next[p] = first.id;
        }
      });
      return next;
    });
  }, [createOpen, groupsByProvider]);

  const submitCreate = async () => {
    setCreateError(null);
    if (selectionCount(newKeyGroups) === 0) {
      setCreateError('至少为一个厂商选择一个分组');
      return;
    }
    try {
      await createMut.mutateAsync({
        name: newKeyName.trim(),
        groups: selectionToPayload(newKeyGroups),
      });
      setCreateOpen(false);
      setNewKeyName('');
      setNewKeyGroups({});
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : '创建失败');
    }
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setEditError(null);
    if (selectionCount(editGroups) === 0) {
      setEditError('至少为一个厂商选择一个分组');
      return;
    }
    try {
      await updateMut.mutateAsync({
        id: editTarget.id,
        patch: {
          name: editName.trim(),
          groups: selectionToPayload(editGroups),
        },
      });
      setEditTarget(null);
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : '修改失败');
    }
  };

  const copyToken = async (k: ApiKeyRow) => {
    const text = k.plaintext ?? `${k.prefix}...`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(k.id);
      setTimeout(() => {
        setCopiedId((cur) => (cur === k.id ? null : cur));
      }, 1500);
    } catch {
      /* ignore */
    }
  };

  const openCreate = () => {
    setNewKeyName('');
    setNewKeyGroups({});
    setCreateError(null);
    setCreateOpen(true);
  };

  const openEdit = (k: ApiKeyRow) => {
    setEditTarget(k);
    setEditName(k.name);
    const sel: GroupSelection = {};
    k.groups.forEach((b) => {
      sel[b.provider] = b.group_id;
    });
    setEditGroups(sel);
    setEditError(null);
  };

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">令牌管理</h2>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium rounded-lg transition-colors"
        >
          + 创建令牌
        </button>
      </div>

      <div className="stat-card rounded-xl p-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="text-amber-400">说明：</span>
          每个令牌可同时绑定 Anthropic 和 OpenAI 各一个分组，调用时按目标模型的厂商匹配对应分组计费。
          只绑定一个厂商也可以，未绑定的厂商无法路由请求。点击令牌列表里的复制按钮可随时复制完整令牌。
        </p>
      </div>

      <div className="stat-card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-base-300 bg-base-200/50">
              <th className="text-left p-4 font-medium">名称</th>
              <th className="text-left p-4 font-medium">分组</th>
              <th className="text-left p-4 font-medium">令牌</th>
              <th className="text-left p-4 font-medium">最近使用</th>
              <th className="text-left p-4 font-medium">创建时间</th>
              <th className="text-center p-4 font-medium">启用</th>
              <th className="text-center p-4 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500 text-xs">
                  <Spinner className="mr-2" /> 加载中...
                </td>
              </tr>
            )}
            {!isLoading && keys.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500 text-xs">
                  还没有令牌，点击右上角创建一个。
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr
                key={k.id}
                className="border-b border-base-300/50 hover:bg-base-200/30 transition-colors"
              >
                <td className="p-4 text-gray-200">{k.name || <span className="text-gray-600">(未命名)</span>}</td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1.5">
                    {k.groups.length === 0 ? (
                      <span className="text-[10px] text-rose-400">未绑定</span>
                    ) : (
                      k.groups.map((b) => (
                        <span
                          key={b.provider}
                          className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-base-200 text-amber-400"
                        >
                          {PROVIDER_LABELS[b.provider]}: {b.group_label || b.group_name}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="p-4">
                  <button
                    type="button"
                    onClick={() => copyToken(k)}
                    title={k.plaintext ? '点击复制完整令牌' : '此令牌无法复制（创建于明文存储启用之前）'}
                    disabled={!k.plaintext}
                    className="inline-flex items-center gap-1.5 font-mono text-xs px-2 py-1 bg-base-200 rounded text-cyan-400 hover:bg-base-300 hover:text-cyan-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <span>{k.prefix}...</span>
                    {copiedId === k.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </td>
                <td className="p-4 text-xs text-gray-500 font-mono">
                  {k.last_used_at
                    ? new Date(k.last_used_at).toLocaleString('zh-CN')
                    : '从未使用'}
                </td>
                <td className="p-4 text-xs text-gray-500 font-mono">
                  {new Date(k.created_at).toLocaleString('zh-CN')}
                </td>
                <td className="p-4 text-center">
                  <div className="inline-block">
                    <Toggle
                      active={k.enabled}
                      onToggle={() =>
                        updateMut.mutate({ id: k.id, patch: { enabled: !k.enabled } })
                      }
                    />
                  </div>
                </td>
                <td className="p-4 text-center">
                  <button
                    onClick={() => openEdit(k)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 mr-3"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm(`确认删除令牌「${k.name || k.prefix}」？删除后无法恢复。`)) return;
                      deleteMut.mutate(k.id, {
                        onError: (e) =>
                          alert(e instanceof ApiError ? e.message : '删除失败'),
                      });
                    }}
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

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="创建令牌"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">名称 (可选)</label>
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="my-dev-key"
              autoFocus
            />
            <p className="text-[10px] text-gray-600 mt-1">用于区分不同用途，不会显示给其他人</p>
          </div>
          <ProviderGroupPicker
            groupsByProvider={groupsByProvider}
            isLoading={groupsLoading}
            selection={newKeyGroups}
            onChange={setNewKeyGroups}
          />
          {createError && (
            <div className="text-xs text-rose-400 px-2 py-1.5 rounded bg-rose-500/10 border border-rose-500/20">
              {createError}
            </div>
          )}
          <button
            onClick={submitCreate}
            disabled={createMut.isPending || groups.length === 0}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            {createMut.isPending && <Spinner className="border-black/30 border-t-black" />}
            创建
          </button>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="编辑令牌"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">名称</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              autoFocus
            />
          </div>
          <ProviderGroupPicker
            groupsByProvider={groupsByProvider}
            isLoading={groupsLoading}
            selection={editGroups}
            onChange={setEditGroups}
          />
          {editError && (
            <div className="text-xs text-rose-400 px-2 py-1.5 rounded bg-rose-500/10 border border-rose-500/20">
              {editError}
            </div>
          )}
          <button
            onClick={submitEdit}
            disabled={updateMut.isPending}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            {updateMut.isPending && <Spinner className="border-black/30 border-t-black" />}
            保存
          </button>
        </div>
      </Modal>
    </div>
  );
}

interface ProviderGroupPickerProps {
  groupsByProvider: Record<GroupProvider, UserGroup[]>;
  isLoading: boolean;
  selection: GroupSelection;
  onChange: (next: GroupSelection) => void;
}

function ProviderGroupPicker({
  groupsByProvider,
  isLoading,
  selection,
  onChange,
}: ProviderGroupPickerProps) {
  const setForProvider = (provider: GroupProvider, value: number | null) => {
    const next: GroupSelection = { ...selection };
    if (value == null) delete next[provider];
    else next[provider] = value;
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400">分组绑定（按厂商）</label>
        <span className="text-[10px] text-gray-600">至少绑定一个厂商</span>
      </div>
      {PROVIDER_ORDER.map((provider) => {
        const list = groupsByProvider[provider];
        const value = selection[provider];
        return (
          <div
            key={provider}
            className="rounded-lg border border-base-300 bg-base-200/40 p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                  provider === 'anthropic'
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-emerald-500/10 text-emerald-400'
                }`}
              >
                {PROVIDER_LABELS[provider]}
              </span>
              {value != null && (
                <button
                  type="button"
                  onClick={() => setForProvider(provider, null)}
                  className="text-[10px] text-gray-500 hover:text-gray-300"
                >
                  清除绑定
                </button>
              )}
            </div>
            {list.length === 0 ? (
              <div className="text-[10px] text-gray-600">该厂商下暂无可用分组</div>
            ) : (
              <select
                value={value ?? ''}
                onChange={(e) =>
                  setForProvider(provider, e.target.value === '' ? null : Number(e.target.value))
                }
                disabled={isLoading}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
              >
                <option value="">不绑定该厂商</option>
                {list.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label} ({g.name})
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}
