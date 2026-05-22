import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api';
import {
  useSiteConfig,
  useUpdateSiteConfig,
  useDefaultUserGroups,
  useUpdateDefaultUserGroups,
  useLandingPricingGroup,
  useUpdateLandingPricingGroup,
} from '@/hooks/useAdminSettings';
import { useGroups } from '@/hooks/useGroups';

// Cap uploaded logos at 512 KB raw (~680 KB as base64) to keep the JSONB
// row reasonable. Most brand marks fit well inside that budget.
const LOGO_MAX_BYTES = 512 * 1024;

export default function AdminSettingsPage() {
  const { data: site } = useSiteConfig();
  const updateMut = useUpdateSiteConfig();

  const [siteName, setSiteName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (site) {
      setSiteName(site.site_name);
      setLogoUrl(site.logo_url);
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
      await updateMut.mutateAsync({
        site_name: siteName.trim(),
        logo_url: logoUrl.trim(),
        announcement,
      });
      setStatus({ kind: 'ok', text: '已保存' });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof ApiError ? e.message : '保存失败' });
    }
  };

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    setStatus(null);
    if (!file.type.startsWith('image/')) {
      setStatus({ kind: 'err', text: '请选择图片文件' });
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setStatus({
        kind: 'err',
        text: `图片过大，请压缩到 ${Math.round(LOGO_MAX_BYTES / 1024)} KB 以内（当前 ${Math.round(
          file.size / 1024
        )} KB）`,
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL gives us a `data:<mime>;base64,<payload>` string that
      // <img src> + <SiteLogo> can render directly without any extra plumbing.
      setLogoUrl(String(reader.result ?? ''));
    };
    reader.onerror = () => {
      setStatus({ kind: 'err', text: '读取图片失败' });
    };
    reader.readAsDataURL(file);
  };

  const clearLogo = () => {
    setLogoUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
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
          <label className="text-xs text-gray-500 block mb-1">Logo</label>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl.trim() ? (
                <img
                  src={logoUrl.trim()}
                  alt="logo preview"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <span className="text-black font-bold text-sm">AG</span>
              )}
            </div>
            <div className="flex-1 flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 bg-base-200 hover:bg-base-300 border border-base-300 rounded-lg text-xs text-gray-200 flex items-center gap-1.5 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                上传图片
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={clearLogo}
                  className="px-3 py-2 bg-base-200 hover:bg-base-300 border border-base-300 rounded-lg text-xs text-gray-400 hover:text-rose-400 transition-colors"
                >
                  清除
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </div>
          <input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            className="w-full mt-2 bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-400 focus:outline-none focus:border-amber-500 truncate"
            placeholder="或直接粘贴图片 URL / data: URL"
          />
          <p className="text-[10px] text-gray-600 mt-1">
            支持上传本地图片（≤ {Math.round(LOGO_MAX_BYTES / 1024)} KB，会直接内嵌为 base64）或填写外链地址；留空则显示默认 AG 字标。推荐 1:1 正方形图片。
          </p>
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
  const { data: current } = useLandingPricingGroup();
  const updateMut = useUpdateLandingPricingGroup();
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (current !== undefined) setSelected(current?.group_id ?? null);
  }, [current]);

  const enabledGroups = useMemo(() => groups.filter((g) => g.enabled), [groups]);

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
          选一个分组作为公开首页"模型定价"区的展示样本。访客会看到该分组的折扣价（base × 倍率）与官网价（base × 1.0）的对比。选"不展示"则首页隐藏整个定价区。
        </p>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">展示分组</label>
        <select
          value={selected == null ? '' : String(selected)}
          onChange={(e) =>
            setSelected(e.target.value === '' ? null : Number(e.target.value))
          }
          className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
        >
          <option value="">不展示</option>
          {enabledGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}（×{Number(g.multiplier).toFixed(2)}）
            </option>
          ))}
        </select>
        {enabledGroups.length === 0 && (
          <p className="text-[10px] text-gray-600 mt-1">还没有启用的分组。</p>
        )}
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
        保存展示分组
      </button>
    </div>
  );
}
