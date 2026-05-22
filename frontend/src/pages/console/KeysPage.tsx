import { useEffect, useState } from 'react';
import { Copy, Check, AlertTriangle } from 'lucide-react';
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
} from '@/hooks/useApiKeys';
import { useUserGroups } from '@/hooks/useUserGroups';

export default function KeysPage() {
  const { data: keys = [], isLoading } = useApiKeys();
  const { data: groups = [], isLoading: groupsLoading } = useUserGroups();
  const createMut = useCreateApiKey();
  const updateMut = useUpdateApiKey();
  const deleteMut = useDeleteApiKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyGroupId, setNewKeyGroupId] = useState<number | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [revealed, setRevealed] = useState<{ id: number; plaintext: string; name: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);

  const [editTarget, setEditTarget] = useState<ApiKeyRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editGroupId, setEditGroupId] = useState<number | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (createOpen && newKeyGroupId == null && groups.length > 0) {
      setNewKeyGroupId(groups[0].id);
    }
  }, [createOpen, groups, newKeyGroupId]);

  const submitCreate = async () => {
    setCreateError(null);
    if (newKeyGroupId == null) {
      setCreateError('请选择一个分组');
      return;
    }
    try {
      const res = await createMut.mutateAsync({
        name: newKeyName.trim(),
        group_id: newKeyGroupId,
      });
      setRevealed({ id: res.id, plaintext: res.plaintext, name: res.name });
      setCreateOpen(false);
      setNewKeyName('');
      setNewKeyGroupId(null);
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : '创建失败');
    }
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setEditError(null);
    if (editGroupId == null) {
      setEditError('请选择一个分组');
      return;
    }
    try {
      await updateMut.mutateAsync({
        id: editTarget.id,
        patch: {
          name: editName.trim(),
          group_id: editGroupId,
        },
      });
      setEditTarget(null);
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : '修改失败');
    }
  };

  const copyPlaintext = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fade-in space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">令牌管理</h2>
        <button
          onClick={() => {
            setNewKeyName('');
            setNewKeyGroupId(groups[0]?.id ?? null);
            setCreateError(null);
            setCreateOpen(true);
          }}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium rounded-lg transition-colors"
        >
          + 创建令牌
        </button>
      </div>

      <div className="stat-card rounded-xl p-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="text-amber-400">说明：</span>
          创建后，完整的令牌只会显示一次，请立即复制并妥善保存。之后只能看到前 10 位作为识别标识。
          丢失的令牌无法找回，只能删除并新建。
          <br />
          每个令牌绑定一个分组，使用该令牌发起的请求只会路由到对应分组允许的渠道，并按该分组的倍率计费。
        </p>
      </div>

      <div className="stat-card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-base-300 bg-base-200/50">
              <th className="text-left p-4 font-medium">名称</th>
              <th className="text-left p-4 font-medium">分组</th>
              <th className="text-left p-4 font-medium">令牌前缀</th>
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
                  <span className="font-mono text-xs px-2 py-1 bg-base-200 rounded text-amber-400">
                    {k.group_label || k.group_name}
                  </span>
                </td>
                <td className="p-4">
                  <span className="font-mono text-xs px-2 py-1 bg-base-200 rounded text-cyan-400">
                    {k.prefix}...
                  </span>
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
                    onClick={() => {
                      setEditTarget(k);
                      setEditName(k.name);
                      setEditGroupId(k.group_id);
                      setEditError(null);
                    }}
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
          <div>
            <label className="text-xs text-gray-400 block mb-1">分组</label>
            <select
              value={newKeyGroupId ?? ''}
              onChange={(e) => setNewKeyGroupId(Number(e.target.value))}
              disabled={groupsLoading || groups.length === 0}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
            >
              {groups.length === 0 && <option value="">暂无可用分组</option>}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label} ({g.name})
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-600 mt-1">
              选择后，该令牌只能请求到此分组允许的模型/渠道
            </p>
          </div>
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

      {/* One-time reveal modal */}
      <Modal
        open={!!revealed}
        onClose={() => setRevealed(null)}
        title="令牌已创建"
        maxWidth="max-w-xl"
      >
        {revealed && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-400 leading-relaxed">
                这是「{revealed.name || '(未命名)'}」的完整令牌。
                <span className="font-medium">关闭此窗口后将无法再次查看</span>，
                请立即复制并妥善保存。
              </p>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">令牌</label>
              <div className="flex items-stretch gap-2">
                <code className="flex-1 font-mono text-sm bg-base-200 border border-base-300 rounded-lg px-3 py-2 break-all">
                  {revealed.plaintext}
                </code>
                <button
                  onClick={copyPlaintext}
                  className="px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-xs font-medium flex items-center gap-1.5 shrink-0"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-base-300 text-[11px] text-gray-500">
              用法示例：
              <pre className="mt-2 bg-base-200 rounded-lg p-3 font-mono text-gray-300 overflow-x-auto">
{`curl ${window.location.origin}/v1/chat/completions \\
  -H "Authorization: Bearer ${revealed.plaintext}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'`}
              </pre>
            </div>

            <button
              onClick={() => setRevealed(null)}
              className="w-full py-2 bg-base-300 hover:bg-base-400 text-gray-200 text-sm rounded-lg transition-colors"
            >
              我已妥善保存，关闭
            </button>
          </div>
        )}
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
          <div>
            <label className="text-xs text-gray-400 block mb-1">分组</label>
            <select
              value={editGroupId ?? ''}
              onChange={(e) => setEditGroupId(Number(e.target.value))}
              disabled={groupsLoading || groups.length === 0}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label} ({g.name})
                </option>
              ))}
            </select>
          </div>
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
