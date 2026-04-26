import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  BadgeDollarSign,
  Bolt,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  User,
  UserRound,
  Zap,
} from 'lucide-react';
import api from '@/api/client';
import type { UserInfo } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import type { LucideIcon } from 'lucide-react';

interface RequestLog {
  id: string;
  cost: number;
}

interface ReferralStats {
  referral_code: string;
  referral_count: number;
}

type PasswordFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

function PasswordField({ value, onChange, placeholder, disabled }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="input-field h-10 pr-11 bg-[#151922] border-[#2b3240] placeholder:text-text-secondary/45 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary transition-colors hover:text-text-primary"
        aria-label={visible ? '隐藏密码' : '显示密码'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function FieldLabel({ children, required = false }: { children: string; required?: boolean }) {
  return (
    <label className="mb-2 block text-sm font-semibold text-text-primary">
      {required && <span className="mr-1 text-danger">*</span>}
      {children}
    </label>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-xl border border-[#222938] bg-[#0d1119]"
    >
      <div className="flex h-12 items-center gap-2 border-b border-[#222938] px-5">
        <Icon className="h-4 w-4 text-text-primary" />
        <h2 className="text-sm font-bold text-text-primary">{title}</h2>
      </div>
      <div className="space-y-7 p-5">{children}</div>
    </motion.section>
  );
}

export default function ProfilePage() {
  const storedUser = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [profile, setProfile] = useState<UserInfo | null>(storedUser);
  const [displayName, setDisplayName] = useState(storedUser?.display_name || storedUser?.username || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    Promise.all([
      api.get<UserInfo>('/client/profile'),
      api.get<RequestLog[]>('/client/usage/logs', { params: { page: 1, per_page: 100 } }),
      api.get<ReferralStats>('/client/profile/referrals'),
    ]).then(([profileRes, logsRes, referralsRes]) => {
      if (!mounted) return;
      setProfile(profileRes.data);
      setUser(profileRes.data);
      setDisplayName(profileRes.data.display_name || profileRes.data.username);
      setLogs(logsRes.data);
      setReferralStats(referralsRes.data);
    }).catch(() => {
      if (mounted) setProfile(storedUser);
    });

    return () => {
      mounted = false;
    };
  }, [setUser, storedUser]);

  const usedQuota = useMemo(
    () => logs.reduce((sum, log) => sum + log.cost, 0),
    [logs],
  );
  const visibleName = profile?.display_name || profile?.username || 'User';
  const roleLabel = profile?.role === 'admin' ? '管理员' : '普通用户';
  const inviteLink = useMemo(() => {
    const code = referralStats?.referral_code || profile?.id;
    if (!code) return '';
    return `${window.location.origin}/register?ref=${encodeURIComponent(code)}`;
  }, [profile?.id, referralStats?.referral_code]);

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopiedInvite(true);
    window.setTimeout(() => setCopiedInvite(false), 1600);
  };

  const submitProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentPassword) {
      setProfileMessage('请输入当前密码以验证身份');
      return;
    }

    setProfileSaving(true);
    setProfileMessage('');
    try {
      const { data } = await api.patch<UserInfo>('/client/profile', {
        display_name: displayName,
        current_password: currentPassword,
      });
      setProfile(data);
      setUser(data);
      setCurrentPassword('');
      setProfileMessage('保存成功');
    } catch (error: any) {
      setProfileMessage(error?.response?.data?.error?.message || '保存失败，请稍后重试');
    } finally {
      setProfileSaving(false);
    }
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage('两次输入的新密码不一致');
      return;
    }

    setPasswordSaving(true);
    setPasswordMessage('');
    try {
      await api.patch('/client/profile/password', {
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage('密码更新成功');
    } catch (error: any) {
      setPasswordMessage(error?.response?.data?.error?.message || '更新失败，请稍后重试');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-5">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-accent-amber/45 bg-[radial-gradient(circle_at_left,rgba(255,184,0,0.12),transparent_34%),linear-gradient(90deg,rgba(255,184,0,0.08),rgba(255,184,0,0.02)_42%,rgba(28,20,18,0.92))] px-5 py-6 shadow-[0_0_30px_rgba(255,184,0,0.06)]"
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-amber text-xl font-black text-bg-primary">
              {visibleName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-text-primary">{visibleName}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-text-primary">{roleLabel}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-accent-amber/25 px-2 py-1 text-xs font-semibold text-text-primary">
                  <UserRound className="h-3 w-3" />
                  default
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-text-secondary">账户余额</p>
              <p className="mt-2 flex items-center gap-1 font-display text-sm font-bold text-accent-amber">
                <BadgeDollarSign className="h-4 w-4" />
                ${((profile?.balance ?? 0) / 1_000_000).toFixed(4)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">已用额度</p>
              <p className="mt-2 flex items-center gap-1 font-display text-sm font-bold text-text-primary">
                <Zap className="h-4 w-4 text-accent-amber" />
                ¥{(usedQuota / 1_000_000).toFixed(4)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">调用次数</p>
              <p className="mt-2 flex items-center gap-1 font-display text-sm font-bold text-text-primary">
                <Bolt className="h-4 w-4 text-accent-amber" />
                {logs.length.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">用户 ID</p>
              <p className="mt-2 flex items-center gap-1 font-display text-sm font-bold text-text-primary">
                <User className="h-4 w-4 text-accent-amber" />
                {profile?.id ? profile.id.slice(0, 8) : '-'}
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="基本信息" icon={UserRound}>
          <form onSubmit={submitProfile} className="space-y-7">
            <div>
              <FieldLabel>用户名</FieldLabel>
              <input
                value={profile?.username || ''}
                disabled
                className="input-field h-10 bg-[#151922] border-[#2b3240] text-text-secondary"
              />
            </div>
            <div>
              <FieldLabel>显示名称</FieldLabel>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="input-field h-10 bg-[#151922] border-[#2b3240]"
              />
            </div>
            <div>
              <FieldLabel required>当前密码</FieldLabel>
              <PasswordField
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder="输入当前密码以验证身份"
                disabled={profileSaving}
              />
            </div>
            {profileMessage && <p className="text-xs text-accent-amber">{profileMessage}</p>}
            <button type="submit" disabled={profileSaving} className="btn-primary bg-accent-amber shadow-[0_8px_22px_rgba(255,184,0,0.22)] disabled:cursor-not-allowed disabled:opacity-60">
              {profileSaving ? '保存中...' : '保存修改'}
            </button>
          </form>
        </SectionCard>

        <SectionCard title="修改密码" icon={LockKeyhole}>
          <form onSubmit={submitPassword} className="space-y-7">
            <div>
              <FieldLabel required>当前密码</FieldLabel>
              <PasswordField
                value={passwordForm.currentPassword}
                onChange={(value) => setPasswordForm((form) => ({ ...form, currentPassword: value }))}
                disabled={passwordSaving}
              />
            </div>
            <div>
              <FieldLabel required>新密码</FieldLabel>
              <PasswordField
                value={passwordForm.newPassword}
                onChange={(value) => setPasswordForm((form) => ({ ...form, newPassword: value }))}
                disabled={passwordSaving}
              />
            </div>
            <div>
              <FieldLabel required>确认密码</FieldLabel>
              <PasswordField
                value={passwordForm.confirmPassword}
                onChange={(value) => setPasswordForm((form) => ({ ...form, confirmPassword: value }))}
                disabled={passwordSaving}
              />
            </div>
            {passwordMessage && <p className="text-xs text-accent-amber">{passwordMessage}</p>}
            <button type="submit" disabled={passwordSaving} className="btn-primary bg-accent-amber shadow-[0_8px_22px_rgba(255,184,0,0.22)] disabled:cursor-not-allowed disabled:opacity-60">
              <KeyRound className="mr-2 inline h-4 w-4" />
              {passwordSaving ? '更新中...' : '更新密码'}
            </button>
          </form>
        </SectionCard>
      </div>

      <SectionCard title="邀请好友" icon={UserRound}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <FieldLabel>专属邀请链接</FieldLabel>
            <div
              className="h-10 overflow-hidden truncate whitespace-nowrap rounded-lg border border-[#2b3240] bg-[#151922] px-3 py-2.5 font-code text-xs text-text-primary"
              title={inviteLink || '正在生成邀请链接...'}
            >
              {inviteLink || '正在生成邀请链接...'}
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              已邀请 {referralStats?.referral_count ?? 0} 人
            </p>
          </div>
          <button
            type="button"
            onClick={copyInviteLink}
            disabled={!inviteLink}
            className="btn-primary h-10 whitespace-nowrap bg-accent-amber shadow-[0_8px_22px_rgba(255,184,0,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copiedInvite ? <Check className="mr-2 inline h-4 w-4" /> : <Copy className="mr-2 inline h-4 w-4" />}
            {copiedInvite ? '已复制' : '复制链接'}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
