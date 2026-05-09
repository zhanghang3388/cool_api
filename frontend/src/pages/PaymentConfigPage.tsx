import { useEffect, useState } from 'react';
import Spinner from '@/components/ui/Spinner';
import Toggle from '@/components/ui/Toggle';
import { ApiError } from '@/lib/api';
import {
  usePaymentConfig,
  useUpdatePaymentConfig,
} from '@/hooks/useAdminSettings';
import { useTopUpRecords } from '@/hooks/useTopUp';

export default function PaymentConfigPage() {
  const { data: cfg } = usePaymentConfig();
  const updateMut = useUpdatePaymentConfig();
  // Latest records — filtered to the current admin in our backend, but the
  // surface is "your payment activity" which is fine for a sanity check.
  const { data: records = [] } = useTopUpRecords();

  const [pid, setPid] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('epay');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (cfg) {
      setPid(cfg.pid);
      setApiUrl(cfg.api_url);
      setName(cfg.name);
      setProvider(cfg.provider);
    }
  }, [cfg]);

  const toggleEnabled = async () => {
    if (!cfg) return;
    try {
      await updateMut.mutateAsync({ enabled: !cfg.enabled });
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '更新失败');
    }
  };

  const save = async () => {
    setStatus(null);
    try {
      await updateMut.mutateAsync({
        provider,
        pid: pid.trim(),
        api_url: apiUrl.trim(),
        name: name.trim(),
        // Only send key when the admin typed something; empty = keep existing.
        ...(keyInput.trim() ? { key: keyInput.trim() } : {}),
      });
      setKeyInput('');
      setStatus({ kind: 'ok', text: '已保存' });
    } catch (e) {
      setStatus({ kind: 'err', text: e instanceof ApiError ? e.message : '保存失败' });
    }
  };

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-semibold">支付配置</h2>

      <div className="stat-card rounded-xl p-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="text-amber-400">说明：</span>
          支持「易支付 / 彩虹易支付」协议的 MD5 签名。商户密钥会加密存储，前端仅展示掩码。
          填写后点击右上开关启用，用户即可在充值页通过该通道付款。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="stat-card rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-300">
              通道：{cfg?.provider ?? 'epay'}
            </h3>
            {cfg && (
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs ${
                    cfg.enabled ? 'text-emerald-400' : 'text-gray-500'
                  }`}
                >
                  {cfg.enabled ? '已启用' : '未启用'}
                </span>
                <Toggle active={cfg.enabled} onToggle={toggleEnabled} />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">通道名称 (展示给用户)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="易支付"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">商户 PID</label>
            <input
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="10086"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">
              商户密钥 {cfg?.key_configured && `(当前: ${cfg.key_masked})`}
            </label>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder={cfg?.key_configured ? '留空保持不变，输入新值替换' : '首次填入商户密钥'}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">支付接口地址</label>
            <input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="https://pay.example.com"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              不要包含 /submit.php —— 由网关自动拼接
            </p>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">
              协议版本 (provider)
            </label>
            <input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500"
              placeholder="epay"
            />
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
            className="w-full py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {updateMut.isPending && <Spinner className="border-black/30 border-t-black" />}
            保存配置
          </button>
        </div>

        <div className="stat-card rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-3">最近充值记录</h3>
          <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-thin pr-1">
            {records.length === 0 && (
              <p className="text-xs text-gray-600 text-center py-6">暂无记录</p>
            )}
            {records.slice(0, 20).map((r) => (
              <div
                key={r.id}
                className="p-3 bg-base-200/50 rounded-lg border border-base-300/50 text-xs"
              >
                <div className="flex justify-between items-center">
                  <span className="font-mono text-gray-200">
                    ¥{(r.amount_cents / 100).toFixed(2)}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                      r.status === 'success'
                        ? 'text-emerald-400 bg-emerald-500/10'
                        : r.status === 'pending'
                        ? 'text-amber-400 bg-amber-500/10'
                        : 'text-rose-400 bg-rose-500/10'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-gray-600 font-mono">
                  {r.method} · {new Date(r.created_at).toLocaleString('zh-CN')}
                </div>
                {r.out_trade_no && (
                  <div className="mt-0.5 text-[10px] text-gray-600 font-mono truncate">
                    {r.out_trade_no}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 mt-3">
            用户的充值记录可在 <span className="text-cyan-400">用户管理</span> 里查看。
          </p>
        </div>
      </div>
    </div>
  );
}
