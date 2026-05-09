import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { register, landingPath } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { CURRENT_USER_KEY, useCurrentUser } from '@/hooks/useCurrentUser';
import Spinner from '@/components/ui/Spinner';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: current, isLoading } = useCurrentUser();

  if (isLoading) return null;
  if (current) return <Navigate to={landingPath(current.role)} replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const u = username.trim();
    if (u.length < 3 || u.length > 32) {
      setError('用户名长度需在 3 到 32 之间');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (password !== password2) {
      setError('两次输入的密码不一致');
      return;
    }

    setSubmitting(true);
    try {
      const user = await register(u, password, email.trim() || undefined);
      queryClient.setQueryData(CURRENT_USER_KEY, user);
      navigate(landingPath(user.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) setError('系统已关闭注册');
        else setError(err.message);
      } else {
        setError('注册失败，请稍后重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-dots flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center">
            <span className="text-black font-bold">AG</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold">注册 AetherGate</h1>
            <p className="text-xs text-gray-500 font-mono">CREATE ACCOUNT</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="stat-card rounded-xl p-6 space-y-4 slide-up"
        >
          <div>
            <label className="text-xs text-gray-400 block mb-1">用户名 (3-32 位)</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="alice"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">邮箱 (可选)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="alice@example.com"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">密码 (≥ 6 位)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">确认密码</label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          {error && (
            <div className="text-xs text-rose-400 px-2 py-1.5 rounded bg-rose-500/10 border border-rose-500/20">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            {submitting && <Spinner className="border-black/30 border-t-black" />}
            {submitting ? '注册中...' : '注册并登录'}
          </button>

          <div className="text-center text-[11px]">
            <Link to="/login" className="text-cyan-400 hover:text-cyan-300">
              已有账号？返回登录
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
