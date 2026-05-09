import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import Spinner from '@/components/ui/Spinner';
import { api, ApiError } from '@/lib/api';
import type { UserInfo } from '@/lib/auth';
import { CURRENT_USER_KEY, useCurrentUser } from '@/hooks/useCurrentUser';

interface UpdateMePayload {
  email?: string;
  current_password?: string;
  new_password?: string;
}

export default function ProfilePage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();

  const updateMut = useMutation({
    mutationFn: (p: UpdateMePayload) => api.patch<UserInfo>('/user/auth/me', p),
    onSuccess: (u) => qc.setQueryData(CURRENT_USER_KEY, u),
  });

  const [email, setEmail] = useState(user?.email ?? '');
  const [emailSaved, setEmailSaved] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwStatus, setPwStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  if (!user) return null;

  const saveEmail = async () => {
    setEmailSaved(null);
    setEmailError(null);
    try {
      await updateMut.mutateAsync({ email: email.trim() });
      setEmailSaved('已保存');
    } catch (e) {
      setEmailError(e instanceof ApiError ? e.message : '保存失败');
    }
  };

  const changePassword = async () => {
    setPwStatus(null);
    if (newPw.length < 6) {
      setPwStatus({ kind: 'err', text: '新密码至少 6 位' });
      return;
    }
    if (newPw !== newPw2) {
      setPwStatus({ kind: 'err', text: '两次输入的新密码不一致' });
      return;
    }
    try {
      await updateMut.mutateAsync({ current_password: currentPw, new_password: newPw });
      setPwStatus({ kind: 'ok', text: '密码已更新' });
      setCurrentPw('');
      setNewPw('');
      setNewPw2('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setPwStatus({ kind: 'err', text: '当前密码不正确' });
      } else {
        setPwStatus({ kind: 'err', text: e instanceof ApiError ? e.message : '修改失败' });
      }
    }
  };

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-semibold">个人资料</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="stat-card rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-medium text-gray-300">基本信息</h3>

          <div>
            <label className="text-xs text-gray-500 block mb-1">用户名</label>
            <div className="font-mono text-gray-300 text-sm">{user.username}</div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">角色</label>
            <div className="font-mono text-gray-300 text-sm">
              {user.role === 'admin' ? '管理员' : '普通用户'}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">注册时间</label>
            <div className="font-mono text-gray-400 text-xs">
              {new Date(user.created_at).toLocaleString('zh-CN')}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">上次登录</label>
            <div className="font-mono text-gray-400 text-xs">
              {user.last_login_at
                ? new Date(user.last_login_at).toLocaleString('zh-CN')
                : '首次登录'}
            </div>
          </div>

          <div className="pt-3 border-t border-base-300">
            <label className="text-xs text-gray-400 block mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="alice@example.com"
            />
            {emailSaved && <div className="text-[10px] text-emerald-400 mt-1">{emailSaved}</div>}
            {emailError && <div className="text-[10px] text-rose-400 mt-1">{emailError}</div>}
            <button
              onClick={saveEmail}
              disabled={updateMut.isPending}
              className="mt-2 px-3 py-1.5 bg-base-300 hover:bg-base-400 disabled:opacity-60 text-gray-200 text-xs rounded-lg transition-colors flex items-center gap-1.5"
            >
              {updateMut.isPending && <Spinner className="w-3 h-3" />}
              保存邮箱
            </button>
          </div>
        </div>

        <div className="stat-card rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-medium text-gray-300">修改密码</h3>

          <div>
            <label className="text-xs text-gray-400 block mb-1">当前密码</label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">新密码 (≥ 6 位)</label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">确认新密码</label>
            <input
              type="password"
              value={newPw2}
              onChange={(e) => setNewPw2(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          {pwStatus && (
            <div
              className={`text-xs px-2 py-1.5 rounded border ${
                pwStatus.kind === 'ok'
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
              }`}
            >
              {pwStatus.text}
            </div>
          )}

          <button
            onClick={changePassword}
            disabled={updateMut.isPending || !currentPw || !newPw}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            {updateMut.isPending && <Spinner className="border-black/30 border-t-black" />}
            更新密码
          </button>
        </div>
      </div>
    </div>
  );
}
