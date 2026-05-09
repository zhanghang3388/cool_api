import { useState } from 'react';
import { useNavigate, Navigate, Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { login, landingPath } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { CURRENT_USER_KEY, useCurrentUser } from '@/hooks/useCurrentUser';
import { usePublicSiteConfig } from '@/hooks/useAdminSettings';
import Spinner from '@/components/ui/Spinner';
import SiteLogo from '@/components/SiteLogo';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { data: current, isLoading } = useCurrentUser();
  const { data: siteCfg } = usePublicSiteConfig();

  if (isLoading) return null;
  if (current) return <Navigate to={landingPath(current.role)} replace />;

  const from = (location.state as { from?: string } | null)?.from;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(username.trim(), password);
      queryClient.setQueryData(CURRENT_USER_KEY, user);
      const target = from ?? landingPath(user.role);
      navigate(target, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError('用户名或密码错误');
        else if (err.status === 403) setError('账户已被禁用');
        else setError(err.message);
      } else {
        setError('登录失败，请稍后重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-dots flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <SiteLogo
            subtitle="AI GATEWAY"
            size="w-10 h-10"
            nameClass="text-lg font-semibold"
          />
        </div>

        {siteCfg?.announcement && (
          <div className="stat-card rounded-xl p-3 mb-4 border-amber-500/20">
            <p className="text-xs text-amber-400/90 leading-relaxed whitespace-pre-wrap">
              {siteCfg.announcement}
            </p>
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="stat-card rounded-xl p-6 space-y-4 slide-up"
        >
          <div>
            <label className="text-xs text-gray-400 block mb-1">用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="请输入用户名"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="请输入密码"
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
            {submitting ? '登录中...' : '登录'}
          </button>

          <div className="flex justify-between items-center text-[11px]">
            <Link to="/register" className="text-cyan-400 hover:text-cyan-300">
              还没有账号？注册
            </Link>
            <span className="text-gray-600 font-mono">admin 登录后自动进入管理后台</span>
          </div>
        </form>
      </div>
    </div>
  );
}
