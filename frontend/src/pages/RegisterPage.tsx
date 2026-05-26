import { useEffect, useRef, useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { register, requestEmailCode, landingPath } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { CURRENT_USER_KEY, useCurrentUser } from '@/hooks/useCurrentUser';
import Spinner from '@/components/ui/Spinner';
import SiteLogo from '@/components/SiteLogo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const cooldownRef = useRef<number | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: current, isLoading } = useCurrentUser();

  useEffect(() => {
    return () => {
      if (cooldownRef.current != null) window.clearInterval(cooldownRef.current);
    };
  }, []);

  if (isLoading) return null;
  if (current) return <Navigate to={landingPath(current.role)} replace />;

  const startCooldown = (seconds: number) => {
    setCooldown(seconds);
    if (cooldownRef.current != null) window.clearInterval(cooldownRef.current);
    cooldownRef.current = window.setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (cooldownRef.current != null) window.clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const onSendCode = async () => {
    setError(null);
    setInfo(null);
    const e = email.trim();
    if (!EMAIL_RE.test(e)) {
      setError('请先输入有效的邮箱地址');
      return;
    }
    setSendingCode(true);
    try {
      await requestEmailCode(e);
      setInfo('验证码已发送，请查收邮箱（10 分钟内有效）');
      startCooldown(60);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('发送验证码失败，请稍后重试');
    } finally {
      setSendingCode(false);
    }
  };

  const onSubmit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    setError(null);
    setInfo(null);

    const u = username.trim();
    if (u.length < 3 || u.length > 32) {
      setError('用户名长度需在 3 到 32 之间');
      return;
    }
    const e = email.trim();
    if (!EMAIL_RE.test(e)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError('请输入 6 位数字验证码');
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
      const user = await register(u, password, e, code.trim());
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

  const sendDisabled = sendingCode || cooldown > 0;
  const sendLabel = sendingCode
    ? '发送中…'
    : cooldown > 0
      ? `${cooldown}s 后重发`
      : '获取验证码';

  return (
    <div className="min-h-screen bg-dots flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <SiteLogo
            subtitle="CREATE ACCOUNT"
            size="w-10 h-10"
            nameClass="text-lg font-semibold"
          />
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
            <label className="text-xs text-gray-400 block mb-1">邮箱</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
                placeholder="alice@example.com"
              />
              <button
                type="button"
                onClick={onSendCode}
                disabled={sendDisabled}
                className="shrink-0 px-3 py-2 text-xs rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
              >
                {sendingCode && <Spinner className="border-amber-300/30 border-t-amber-300" />}
                {sendLabel}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">邮箱验证码</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="6 位数字"
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

          {info && !error && (
            <div className="text-xs text-emerald-400 px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              {info}
            </div>
          )}
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
