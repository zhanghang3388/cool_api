import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api';
import { useSiteConfig, useUpdateSiteConfig } from '@/hooks/useAdminSettings';

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
    </div>
  );
}
