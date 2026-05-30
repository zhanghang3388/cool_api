import { useEffect, useMemo, useState } from 'react';
import Spinner from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api';
import {
  useSiteConfig,
  useUpdateSiteConfig,
  useDefaultUserGroups,
  useUpdateDefaultUserGroups,
  useLandingPricingGroups,
  useUpdateLandingPricingGroups,
  useEmailConfig,
  useUpdateEmailConfig,
  useProbeConfig,
  useUpdateProbeConfig,
  type ProbeTarget,
} from '@/hooks/useAdminSettings';
import { useGroups } from '@/hooks/useGroups';
import { PROVIDER_LABELS, PROVIDER_ORDER, type GroupProvider } from '@/hooks/useGroups';
import { useChannels } from '@/hooks/useChannels';
import { useRunProbes } from '@/hooks/useProbes';

export default function AdminSettingsPage() {
  const { data: site } = useSiteConfig();
  const updateMut = useUpdateSiteConfig();

  const [siteName, setSiteName] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (site) {
      setSiteName(site.site_name);
      setAnnouncement(site.announcement);
    }
  }, [site]);

  const save = async () => {
    setStatus(null);
    if (!siteName.trim()) {
      setStatus({ kind: 'err', text: '站点名称不能为空' });
      return;
    }
    try {
      // logo_url is no longer admin-configurable — the bundled /logo.png is
      // served by the static frontend. We send an empty string so any legacy
      // value sitting in the row gets cleared the first time someone saves.
      await updateMut.mutateAsync({
        site_name: siteName.trim(),
        logo_url: '',
        announcement,
      });
      setStatus({ kind: 'ok', text: '已保存' });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof ApiError ? e.message : '保存失败' });
    }
  };

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-semibold">系统设置</h2>

      <div className="stat-card rounded-xl p-5 space-y-4 max-w-2xl">
        <h3 className="text-sm font-medium text-gray-300">站点</h3>

        <div>
          <label className="text-xs text-gray-500 block mb-1">站点名称</label>
          <input
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
            placeholder="AetherGate"
          />
          <p className="text-[10px] text-gray-600 mt-1">显示在登录页、侧边栏和浏览器标题</p>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">系统公告</label>
          <textarea
            rows={4}
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500 resize-none"
            placeholder="留空表示不显示公告。支持纯文本。"
          />
          <p className="text-[10px] text-gray-600 mt-1">显示在登录页顶部</p>
        </div>

        {status && (
          <div
            className={`text-xs px-2 py-1.5 rounded border ${
              status.kind === 'ok'
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
            }`}
          >
            {status.text}
          </div>
        )}

        <button
          onClick={save}
          disabled={updateMut.isPending}
          className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium rounded-lg transition-colors text-sm flex items-center gap-2"
        >
          {updateMut.isPending && <Spinner className="border-black/30 border-t-black" />}
          保存设置
        </button>
      </div>

      <DefaultUserGroupsCard />
      <LandingPricingGroupCard />
      <ProbeConfigCard />
      <EmailConfigCard />
    </div>
  );
}

function DefaultUserGroupsCard() {
  const { data: groups = [] } = useGroups();
  const { data: defaultsRes } = useDefaultUserGroups();
  const updateMut = useUpdateDefaultUserGroups();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (defaultsRes) setSelected(new Set(defaultsRes.group_ids));
  }, [defaultsRes]);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const enabledGroups = useMemo(() => groups.filter((g) => g.enabled), [groups]);
  const disabledSelected = useMemo(
    () => groups.filter((g) => !g.enabled && selected.has(g.id)),
    [groups, selected]
  );

  const save = async () => {
    setStatus(null);
    try {
      await updateMut.mutateAsync(Array.from(selected));
      setStatus({ kind: 'ok', text: '已保存' });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof ApiError ? e.message : '保存失败' });
    }
  };

  return (
    <div className="stat-card rounded-xl p-5 space-y-4 max-w-2xl">
      <div>
        <h3 className="text-sm font-medium text-gray-300">普通用户默认分组</h3>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
          这里勾选的分组会自动授予给所有普通用户（包括已注册的老用户）。可在「用户管理 → 编辑」里对单个用户做"强制启用 / 强制禁用"覆盖。管理员账号不受此设置约束，自动可用全部启用的分组。
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="text-xs text-gray-500">暂无任何分组，先去「分组管理」创建。</div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <span>已选 {selected.size} / 共 {enabledGroups.length} 个启用分组</span>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-gray-400 hover:text-gray-200"
              >
                全部清除
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => {
              const active = selected.has(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggle(g.id)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors border ${
                    active
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-base-200 text-gray-400 border-base-300 hover:text-gray-200'
                  } ${!g.enabled ? 'opacity-60' : ''}`}
                  title={!g.enabled ? '此分组已停用' : undefined}
                >
                  <span className="text-[9px] opacity-70 mr-1">[{PROVIDER_LABELS[g.provider]}]</span>
                  {g.label}
                  {!g.enabled && <span className="ml-1 text-[10px] text-rose-400">·停</span>}
                </button>
              );
            })}
          </div>
          {disabledSelected.length > 0 && (
            <div className="text-[10px] text-amber-400">
              注意：所选项中包含已停用的分组（{disabledSelected.map((g) => g.label).join('、')}），用户能在该分组重新启用后即时获得访问权。
            </div>
          )}
        </div>
      )}

      {status && (
        <div
          className={`text-xs px-2 py-1.5 rounded border ${
            status.kind === 'ok'
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
          }`}
        >
          {status.text}
        </div>
      )}

      <button
        onClick={save}
        disabled={updateMut.isPending}
        className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium rounded-lg transition-colors text-sm flex items-center gap-2"
      >
        {updateMut.isPending && <Spinner className="border-black/30 border-t-black" />}
        保存默认分组
      </button>
    </div>
  );
}

function LandingPricingGroupCard() {
  const { data: groups = [] } = useGroups();
  const { data: current } = useLandingPricingGroups();
  const updateMut = useUpdateLandingPricingGroups();
  const [selected, setSelected] = useState<Record<GroupProvider, number[]>>({
    openai: [],
    anthropic: [],
  });
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (current) {
      setSelected({
        openai: current.openai ?? [],
        anthropic: current.anthropic ?? [],
      });
    }
  }, [current]);

  const groupsByProvider = useMemo(() => {
    const map: Record<GroupProvider, typeof groups> = { openai: [], anthropic: [] };
    for (const g of groups) {
      if (g.enabled) map[g.provider].push(g);
    }
    return map;
  }, [groups]);

  const toggle = (provider: GroupProvider, id: number) => {
    setSelected((prev) => {
      const list = prev[provider];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      return { ...prev, [provider]: next };
    });
  };

  const clear = (provider: GroupProvider) =>
    setSelected((prev) => ({ ...prev, [provider]: [] }));

  const save = async () => {
    setStatus(null);
    try {
      await updateMut.mutateAsync(selected);
      setStatus({ kind: 'ok', text: '已保存' });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof ApiError ? e.message : '保存失败' });
    }
  };

  return (
    <div className="stat-card rounded-xl p-5 space-y-4 max-w-2xl">
      <div>
        <h3 className="text-sm font-medium text-gray-300">首页定价展示分组</h3>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
          为每种上游协议选择一个或多个分组作为公开首页"模型定价"的展示样本。访客在该协议区段可切换不同分组，看到对应折扣价（base × 倍率）与官网价（base × 1.0）的对比。该协议下不选任何分组则首页隐藏对应区段。
        </p>
      </div>

      {PROVIDER_ORDER.map((provider) => {
        const list = groupsByProvider[provider];
        const picked = selected[provider];
        return (
          <div key={provider} className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span>
                {PROVIDER_LABELS[provider]} · 已选 {picked.length} / 共 {list.length} 个启用分组
              </span>
              {picked.length > 0 && (
                <button
                  type="button"
                  onClick={() => clear(provider)}
                  className="text-gray-400 hover:text-gray-200"
                >
                  清除
                </button>
              )}
            </div>
            {list.length === 0 ? (
              <div className="text-[10px] text-gray-600">
                还没有启用的 {PROVIDER_LABELS[provider]} 分组。
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {list.map((g) => {
                  const active = picked.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggle(provider, g.id)}
                      className={`px-2.5 py-1 rounded text-xs transition-colors border ${
                        active
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-base-200 text-gray-400 border-base-300 hover:text-gray-200'
                      }`}
                    >
                      {g.label}
                      <span className="ml-1 text-[10px] opacity-70 font-mono">
                        ×{Number(g.multiplier).toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {status && (
        <div
          className={`text-xs px-2 py-1.5 rounded border ${
            status.kind === 'ok'
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
          }`}
        >
          {status.text}
        </div>
      )}

      <button
        onClick={save}
        disabled={updateMut.isPending}
        className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium rounded-lg transition-colors text-sm flex items-center gap-2"
      >
        {updateMut.isPending && <Spinner className="border-black/30 border-t-black" />}
        保存展示分组
      </button>
    </div>
  );
}

function EmailConfigCard() {
  const { data: cfg } = useEmailConfig();
  const updateMut = useUpdateEmailConfig();

  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (cfg) {
      setEnabled(cfg.enabled);
      setFromEmail(cfg.from_email);
      setFromName(cfg.from_name);
      setApiKey('');
    }
  }, [cfg]);

  const save = async () => {
    setStatus(null);
    if (enabled && !cfg?.key_configured && !apiKey.trim()) {
      setStatus({ kind: 'err', text: '启用前需先填写 API Key' });
      return;
    }
    if (enabled && !fromEmail.trim()) {
      setStatus({ kind: 'err', text: '启用前需先填写发件邮箱' });
      return;
    }
    try {
      await updateMut.mutateAsync({
        enabled,
        // Empty string = keep existing on the backend, so we only send the
        // field when the admin actually entered a new value.
        api_key: apiKey.trim() ? apiKey.trim() : undefined,
        from_email: fromEmail.trim(),
        from_name: fromName.trim(),
      });
      setApiKey('');
      setStatus({ kind: 'ok', text: '已保存' });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof ApiError ? e.message : '保存失败' });
    }
  };

  return (
    <div className="stat-card rounded-xl p-5 space-y-4 max-w-2xl">
      <div>
        <h3 className="text-sm font-medium text-gray-300">邮件服务 (Resend)</h3>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
          注册时通过邮件下发 6 位验证码。使用 <a className="text-cyan-400 hover:text-cyan-300" href="https://resend.com/" target="_blank" rel="noreferrer">Resend</a> 发送，发件域名需要先在 Resend 控制台完成 DNS 验证（测试期可使用 onboarding@resend.dev）。
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-300">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-amber-500"
        />
        启用邮件服务
      </label>

      <div>
        <label className="text-xs text-gray-500 block mb-1">
          API Key {cfg?.key_configured && <span className="text-emerald-400 ml-1">已配置 · {cfg.key_masked}</span>}
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
          placeholder={cfg?.key_configured ? '留空表示保留现有 Key' : 're_xxxxxxxxxxxx'}
        />
        <p className="text-[10px] text-gray-600 mt-1">在 Resend 后台 API Keys 页面创建。保存后仅显示掩码。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">发件邮箱</label>
          <input
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
            placeholder="noreply@your-domain.com"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">发件人名称</label>
          <input
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
            placeholder="AetherGate"
          />
        </div>
      </div>

      {status && (
        <div
          className={`text-xs px-2 py-1.5 rounded border ${
            status.kind === 'ok'
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
          }`}
        >
          {status.text}
        </div>
      )}

      <button
        onClick={save}
        disabled={updateMut.isPending}
        className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium rounded-lg transition-colors text-sm flex items-center gap-2"
      >
        {updateMut.isPending && <Spinner className="border-black/30 border-t-black" />}
        保存邮件配置
      </button>
    </div>
  );
}

function ProbeConfigCard() {
  const { data: cfg } = useProbeConfig();
  const { data: groups = [] } = useGroups();
  const { data: channels = [] } = useChannels();
  const updateMut = useUpdateProbeConfig();
  const runMut = useRunProbes();

  const [enabled, setEnabled] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(1);
  const [retentionDays, setRetentionDays] = useState(7);
  const [targets, setTargets] = useState<ProbeTarget[]>([]);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Add-target draft state.
  const [draftGroupId, setDraftGroupId] = useState<number | ''>('');
  const [draftChannelId, setDraftChannelId] = useState<number | ''>('');
  const [draftModel, setDraftModel] = useState('');

  useEffect(() => {
    if (cfg) {
      setEnabled(cfg.enabled);
      setIntervalMinutes(cfg.interval_minutes);
      setRetentionDays(cfg.retention_days);
      setTargets(cfg.targets);
    }
  }, [cfg]);

  const draftGroup = groups.find((g) => g.id === draftGroupId);

  // Channels reachable from the chosen group: provider must match and the
  // channel must either be unrestricted (empty allowed_group_ids) or list this
  // group. When no group is picked, allow any enabled channel.
  const channelsForGroup = useMemo(() => {
    return channels.filter((c) => {
      if (!c.enabled) return false;
      if (!draftGroup) return true;
      if (c.provider !== draftGroup.provider) return false;
      return c.allowed_group_ids.length === 0 || c.allowed_group_ids.includes(draftGroup.id);
    });
  }, [channels, draftGroup]);

  const draftChannel = channels.find((c) => c.id === draftChannelId);

  const groupLabel = (id: number | null) =>
    id == null ? '任意分组' : groups.find((g) => g.id === id)?.label ?? `#${id}`;
  const channelName = (id: number) =>
    channels.find((c) => c.id === id)?.name ?? `#${id}`;

  const addTarget = () => {
    setStatus(null);
    if (!draftChannelId) {
      setStatus({ kind: 'err', text: '请选择渠道' });
      return;
    }
    const model = draftModel.trim();
    if (!model) {
      setStatus({ kind: 'err', text: '请选择或填写模型' });
      return;
    }
    const groupId = draftGroupId === '' ? null : draftGroupId;
    const dup = targets.some(
      (t) => t.channel_id === draftChannelId && t.model === model && t.group_id === groupId,
    );
    if (dup) {
      setStatus({ kind: 'err', text: '该探测目标已存在' });
      return;
    }
    setTargets((prev) => [...prev, { channel_id: draftChannelId, model, group_id: groupId }]);
    setDraftModel('');
  };

  const removeTarget = (i: number) =>
    setTargets((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    setStatus(null);
    if (enabled && targets.length === 0) {
      setStatus({ kind: 'err', text: '启用前请至少添加一个探测目标' });
      return;
    }
    try {
      await updateMut.mutateAsync({
        enabled,
        interval_minutes: Math.min(1440, Math.max(1, intervalMinutes || 1)),
        retention_days: Math.min(90, Math.max(1, retentionDays || 7)),
        targets,
      });
      setStatus({ kind: 'ok', text: '已保存' });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof ApiError ? e.message : '保存失败' });
    }
  };

  const runOnce = async () => {
    setStatus(null);
    try {
      const res = await runMut.mutateAsync();
      setStatus({ kind: 'ok', text: `已立即探测 ${res.probed} 个目标` });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof ApiError ? e.message : '探测失败' });
    }
  };

  return (
    <div className="stat-card rounded-xl p-5 space-y-4 max-w-2xl">
      <div>
        <h3 className="text-sm font-medium text-gray-300">活体监控（主动验活）</h3>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
          开启后，后台会按设定间隔，针对每个目标用指定模型发送一个最小请求（max_tokens=1）验证可用性。结果记录在「活体监控」页面与用户仪表盘的分组状态中。注意：这是真实请求，会产生极少量 token 消耗，不计入用量账单。
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-300">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-amber-500"
        />
        启用定时验活
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">验活间隔（分钟）</label>
          <input
            type="number"
            min={1}
            max={1440}
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(Number(e.target.value))}
            className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
          />
          <p className="text-[10px] text-gray-600 mt-1">最小 1 分钟。每个目标每分钟约 1 次请求。</p>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">历史保留（天）</label>
          <input
            type="number"
            min={1}
            max={90}
            value={retentionDays}
            onChange={(e) => setRetentionDays(Number(e.target.value))}
            className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
          />
          <p className="text-[10px] text-gray-600 mt-1">超过保留期的探测记录会被自动清理。</p>
        </div>
      </div>

      {/* target editor */}
      <div className="space-y-2">
        <label className="text-xs text-gray-500 block">探测目标</label>

        {targets.length === 0 ? (
          <div className="text-[10px] text-gray-600">还没有目标。在下面选择分组 → 渠道 → 模型后添加。</div>
        ) : (
          <div className="space-y-1.5">
            {targets.map((t, i) => (
              <div
                key={`${t.channel_id}-${t.model}-${t.group_id}-${i}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-base-300 bg-base-200/40 px-3 py-2"
              >
                <div className="min-w-0 text-xs">
                  <span className="font-mono text-gray-200 truncate">{t.model}</span>
                  <span className="text-gray-500 ml-2">
                    {channelName(t.channel_id)} · {groupLabel(t.group_id)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeTarget(i)}
                  className="text-[11px] text-gray-500 hover:text-rose-400 shrink-0"
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <select
            value={draftGroupId}
            onChange={(e) => {
              setDraftGroupId(e.target.value === '' ? '' : Number(e.target.value));
              setDraftChannelId('');
              setDraftModel('');
            }}
            className="bg-base-200 border border-base-300 rounded-lg px-2 py-2 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
          >
            <option value="">分组（任意）</option>
            {groups
              .filter((g) => g.enabled)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {PROVIDER_LABELS[g.provider]} · {g.label}
                </option>
              ))}
          </select>

          <select
            value={draftChannelId}
            onChange={(e) => {
              setDraftChannelId(e.target.value === '' ? '' : Number(e.target.value));
              setDraftModel('');
            }}
            className="bg-base-200 border border-base-300 rounded-lg px-2 py-2 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
          >
            <option value="">选择渠道</option>
            {channelsForGroup.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {draftChannel && draftChannel.allowed_models.length > 0 ? (
            <select
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              className="bg-base-200 border border-base-300 rounded-lg px-2 py-2 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
            >
              <option value="">选择模型</option>
              {draftChannel.allowed_models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              placeholder="模型名称"
              className="bg-base-200 border border-base-300 rounded-lg px-2 py-2 text-xs text-gray-200 focus:outline-none focus:border-amber-500"
            />
          )}
        </div>
        <button
          type="button"
          onClick={addTarget}
          className="text-xs px-3 py-1.5 rounded-lg border border-base-300 text-gray-300 hover:border-amber-500/40 hover:text-amber-300 transition-colors"
        >
          + 添加目标
        </button>
      </div>

      {status && (
        <div
          className={`text-xs px-2 py-1.5 rounded border ${
            status.kind === 'ok'
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
          }`}
        >
          {status.text}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={updateMut.isPending}
          className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium rounded-lg transition-colors text-sm flex items-center gap-2"
        >
          {updateMut.isPending && <Spinner className="border-black/30 border-t-black" />}
          保存验活配置
        </button>
        <button
          onClick={runOnce}
          disabled={runMut.isPending || targets.length === 0}
          className="px-5 py-2 border border-base-300 hover:border-amber-500/40 disabled:opacity-50 text-gray-300 hover:text-amber-300 rounded-lg transition-colors text-sm flex items-center gap-2"
          title="对当前已保存的目标立即探测一次"
        >
          {runMut.isPending && <Spinner />}
          立即探测一次
        </button>
      </div>
    </div>
  );
}
