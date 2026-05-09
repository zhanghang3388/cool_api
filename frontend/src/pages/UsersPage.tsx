import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import Toggle from '@/components/ui/Toggle';
import { ApiError } from '@/lib/api';
import { useGroups } from '@/hooks/useGroups';
import {
  useAdminUsers,
  useTopUpUser,
  useUpdateUser,
  type AdminUserRow,
  type AdminUsersFilter,
  type UserStatus,
} from '@/hooks/useAdminUsers';

const PAGE_SIZE = 20;

function formatYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

export default function UsersPage() {
  const { data: groups = [] } = useGroups();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [groupFilter, setGroupFilter] = useState<number | ''>('');

  const filter: AdminUsersFilter = {
    page,
    page_size: PAGE_SIZE,
    search: search || undefined,
    status: statusFilter || undefined,
    group_id: groupFilter === '' ? undefined : groupFilter,
  };
  const { data, isLoading } = useAdminUsers(filter);
  const updateMut = useUpdateUser();
  const topUpMut = useTopUpUser();

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const [editTarget, setEditTarget] = useState<AdminUserRow | null>(null);
  const [editStatus, setEditStatus] = useState<UserStatus>('active');
  const [editGroupId, setEditGroupId] = useState<number>(0);
  const [editError, setEditError] = useState<string | null>(null);

  const [topUpTarget, setTopUpTarget] = useState<AdminUserRow | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpBonus, setTopUpBonus] = useState('');
  const [topUpNote, setTopUpNote] = useState('');
  const [topUpError, setTopUpError] = useState<string | null>(null);

  const openEdit = (u: AdminUserRow) => {
    setEditTarget(u);
    setEditStatus(u.status);
    setEditGroupId(u.group_id);
    setEditError(null);
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setEditError(null);
    try {
      await updateMut.mutateAsync({
        id: editTarget.id,
        patch: {
          status: editStatus === editTarget.status ? undefined : editStatus,
          group_id: editGroupId === editTarget.group_id ? undefined : editGroupId,
        },
      });
      setEditTarget(null);
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : '保存失败');
    }
  };

  const openTopUp = (u: AdminUserRow) => {
    setTopUpTarget(u);
    setTopUpAmount('');
    setTopUpBonus('');
    setTopUpNote('');
    setTopUpError(null);
  };

  const submitTopUp = async () => {
    if (!topUpTarget) return;
    setTopUpError(null);
    const amount = parseFloat(topUpAmount);
    const bonus = topUpBonus ? parseFloat(topUpBonus) : 0;
    if (!Number.isFinite(amount) || amount <= 0) {
      setTopUpError('充值金额必须 > 0');
      return;
    }
    if (!Number.isFinite(bonus) || bonus < 0) {
      setTopUpError('赠送金额不能为负');
      return;
    }
    try {
      await topUpMut.mutateAsync({
        id: topUpTarget.id,
        body: {
          amount_cents: Math.round(amount * 100),
          bonus_cents: Math.round(bonus * 100),
          note: topUpNote,
        },
      });
      setTopUpTarget(null);
    } catch (e) {
      setTopUpError(e instanceof ApiError ? e.message : '充值失败');
    }
  };

  const applySearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-semibold">用户管理</h2>

      <div className="stat-card rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-500">搜索 (用户名/邮箱)</label>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
            placeholder="alice"
            className="bg-base-200 border border-base-300 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500 w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-500">状态</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as UserStatus | '');
              setPage(1);
            }}
            className="bg-base-200 border border-base-300 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
          >
            <option value="">全部</option>
            <option value="active">启用</option>
            <option value="disabled">禁用</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-500">分组</label>
          <select
            value={groupFilter}
            onChange={(e) => {
              const v = e.target.value;
              setGroupFilter(v === '' ? '' : Number(v));
              setPage(1);
            }}
            className="bg-base-200 border border-base-300 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
          >
            <option value="">全部</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={applySearch}
          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-xs font-medium rounded-lg transition-colors"
        >
          应用筛选
        </button>
        {(search || statusFilter || groupFilter !== '') && (
          <button
            onClick={() => {
              setSearchInput('');
              setSearch('');
              setStatusFilter('');
              setGroupFilter('');
              setPage(1);
            }}
            className="ml-auto text-xs text-gray-400 hover:text-gray-200"
          >
            清除筛选
          </button>
        )}
      </div>

      <div className="stat-card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-base-300 bg-base-200/50">
              <th className="text-left p-4 font-medium">用户</th>
              <th className="text-left p-4 font-medium">角色</th>
              <th className="text-left p-4 font-medium">分组</th>
              <th className="text-right p-4 font-medium">余额</th>
              <th className="text-right p-4 font-medium">累计消耗</th>
              <th className="text-left p-4 font-medium">注册时间</th>
              <th className="text-center p-4 font-medium">状态</th>
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
            {!isLoading && (data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-500 text-xs">
                  没有匹配的用户
                </td>
              </tr>
            )}
            {data?.items.map((u) => (
              <tr
                key={u.id}
                className="border-b border-base-300/50 hover:bg-base-200/30 transition-colors"
              >
                <td className="p-4">
                  <div className="text-gray-200">{u.username}</div>
                  <div className="text-[10px] text-gray-600 font-mono">
                    {u.email || '未绑定邮箱'}
                  </div>
                </td>
                <td className="p-4">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-mono ${
                      u.role === 'admin'
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-base-300 text-gray-400'
                    }`}
                  >
                    {u.role === 'admin' ? '管理员' : '用户'}
                  </span>
                </td>
                <td className="p-4">
                  <span className="font-mono text-xs px-2 py-1 bg-base-200 rounded text-amber-400">
                    {u.group_label}
                  </span>
                </td>
                <td
                  className={`p-4 text-right font-mono ${
                    u.balance_cents < 1000 ? 'text-rose-400' : 'text-gray-300'
                  }`}
                >
                  {formatYuan(u.balance_cents)}
                </td>
                <td className="p-4 text-right font-mono text-gray-400">
                  {formatYuan(u.total_used_cents)}
                </td>
                <td className="p-4 font-mono text-[11px] text-gray-500">
                  {new Date(u.created_at).toLocaleDateString('zh-CN')}
                </td>
                <td className="p-4 text-center">
                  <Toggle
                    active={u.status === 'active'}
                    onToggle={() =>
                      updateMut.mutate({
                        id: u.id,
                        patch: {
                          status: u.status === 'active' ? 'disabled' : 'active',
                        },
                      }, {
                        onError: (e) => alert(e instanceof ApiError ? e.message : '操作失败'),
                      })
                    }
                  />
                </td>
                <td className="p-4 text-center">
                  <button
                    onClick={() => openTopUp(u)}
                    className="text-xs text-amber-400 hover:text-amber-300 mr-3"
                  >
                    充值
                  </button>
                  <button
                    onClick={() => openEdit(u)}
                    className="text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    编辑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div>共 {data?.total ?? 0} 名用户</div>
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

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="编辑用户">
        {editTarget && (
          <div className="space-y-4">
            <div className="text-xs text-gray-500">
              {editTarget.username} · {editTarget.email || '未绑定邮箱'}
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">状态</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as UserStatus)}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              >
                <option value="active">启用</option>
                <option value="disabled">禁用</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">分组</label>
              <select
                value={editGroupId}
                onChange={(e) => setEditGroupId(Number(e.target.value))}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
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
        )}
      </Modal>

      <Modal
        open={!!topUpTarget}
        onClose={() => setTopUpTarget(null)}
        title="手动充值"
      >
        {topUpTarget && (
          <div className="space-y-4">
            <div className="text-xs text-gray-500">
              {topUpTarget.username} · 当前余额 {formatYuan(topUpTarget.balance_cents)}
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">充值金额 (元)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
                placeholder="100"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">赠送金额 (元，可选)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={topUpBonus}
                onChange={(e) => setTopUpBonus(e.target.value)}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">备注</label>
              <input
                value={topUpNote}
                onChange={(e) => setTopUpNote(e.target.value)}
                className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
                placeholder="可选"
              />
            </div>
            {topUpError && (
              <div className="text-xs text-rose-400 px-2 py-1.5 rounded bg-rose-500/10 border border-rose-500/20">
                {topUpError}
              </div>
            )}
            <button
              onClick={submitTopUp}
              disabled={topUpMut.isPending}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
            >
              {topUpMut.isPending && <Spinner className="border-white/30 border-t-white" />}
              确认充值
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
