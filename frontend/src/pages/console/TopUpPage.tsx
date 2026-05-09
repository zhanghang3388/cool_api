import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Spinner from '@/components/ui/Spinner';
import { ApiError } from '@/lib/api';
import { useCurrentUser, CURRENT_USER_KEY } from '@/hooks/useCurrentUser';
import {
  useCreateTopUpOrder,
  useTopUpInfo,
  useTopUpRecords,
  type TopUpRecord,
  type TopUpStatus,
} from '@/hooks/useTopUp';

const STATUS_STYLE: Record<TopUpStatus, { label: string; className: string }> = {
  pending: {
    label: '待支付',
    className: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  success: {
    label: '成功',
    className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  failed: {
    label: '失败',
    className: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  },
  refunded: {
    label: '已退款',
    className: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  },
};

function formatYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

export default function TopUpPage() {
  const { data: user } = useCurrentUser();
  const { data: info } = useTopUpInfo();
  const { data: records = [] } = useTopUpRecords();
  const createMut = useCreateTopUpOrder();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const presets = info?.presets_cents ?? [100, 500, 1000, 2000, 5000, 10000];
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(presets[0]);
  const [customYuan, setCustomYuan] = useState('');
  const [payType, setPayType] = useState<'alipay' | 'wxpay'>('alipay');
  const [error, setError] = useState<string | null>(null);

  // Returning from the payment provider: show a banner + force-refresh balance.
  const returnStatus = searchParams.get('status');
  useEffect(() => {
    if (!returnStatus) return;
    // Balance likely changed — drop the cache so the next render refetches.
    qc.invalidateQueries({ queryKey: CURRENT_USER_KEY });
  }, [returnStatus, qc]);

  const amountCents = useMemo(() => {
    if (selectedPreset !== 'custom') return selectedPreset;
    const y = parseFloat(customYuan);
    if (!Number.isFinite(y) || y < 1) return 0;
    return Math.round(y * 100);
  }, [selectedPreset, customYuan]);

  const submit = async () => {
    setError(null);
    const min = info?.min_amount_cents ?? 100;
    if (amountCents < min) {
      setError(`金额必须 >= ${formatYuan(min)}`);
      return;
    }
    try {
      const returnUrl = `${window.location.origin}/console/topup`;
      const notifyUrl = `${window.location.origin}/payment/epay/notify`;
      const res = await createMut.mutateAsync({
        amount_cents: amountCents,
        pay_type: payType,
        return_url: returnUrl,
        notify_url: notifyUrl,
      });
      window.location.href = res.submit_url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '创建订单失败');
    }
  };

  const dismissBanner = () => {
    searchParams.delete('status');
    searchParams.delete('out_trade_no');
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-semibold">充值</h2>

      {returnStatus && (
        <div
          className={`stat-card rounded-xl p-4 border ${
            returnStatus === 'TRADE_SUCCESS'
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-amber-500/30 bg-amber-500/5'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm">
              {returnStatus === 'TRADE_SUCCESS' ? (
                <span className="text-emerald-400">支付成功，余额会在几秒内到账</span>
              ) : (
                <span className="text-amber-400">
                  支付状态：{returnStatus} — 若已付款但余额未到账请稍等片刻
                </span>
              )}
            </p>
            <button
              onClick={dismissBanner}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="stat-card rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">当前余额</p>
          <p className="text-2xl font-mono font-bold text-emerald-400">
            {user ? formatYuan(user.balance_cents) : '—'}
          </p>
        </div>
        <div className="stat-card rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">支付方式</p>
          <p className="text-sm text-gray-300">
            {info?.payment_enabled ? info.payment_name : '当前未启用在线支付'}
          </p>
        </div>
      </div>

      {!info?.payment_enabled ? (
        <div className="stat-card rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400">
            站点暂未启用在线支付，请联系管理员手动充值。
          </p>
        </div>
      ) : (
        <div className="stat-card rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-medium text-gray-300">选择金额</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {presets.map((cents) => {
              const active = selectedPreset === cents;
              return (
                <button
                  key={cents}
                  onClick={() => setSelectedPreset(cents)}
                  className={`py-3 rounded-lg text-sm font-mono transition-colors border ${
                    active
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      : 'bg-base-200 border-base-300 text-gray-300 hover:border-amber-500/20'
                  }`}
                >
                  ¥{cents / 100}
                </button>
              );
            })}
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <input
                type="radio"
                name="amount-mode"
                checked={selectedPreset === 'custom'}
                onChange={() => setSelectedPreset('custom')}
                className="accent-amber-500"
              />
              自定义金额 (元)
            </label>
            <input
              type="number"
              step="0.01"
              min="1"
              value={customYuan}
              onChange={(e) => {
                setCustomYuan(e.target.value);
                setSelectedPreset('custom');
              }}
              className="w-full bg-base-200 border border-base-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
              placeholder="最低 1 元"
              disabled={selectedPreset !== 'custom'}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">支付渠道</label>
            <div className="flex gap-2">
              <button
                onClick={() => setPayType('alipay')}
                className={`flex-1 py-2 rounded-lg text-sm border ${
                  payType === 'alipay'
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                    : 'bg-base-200 border-base-300 text-gray-400'
                }`}
              >
                支付宝
              </button>
              <button
                onClick={() => setPayType('wxpay')}
                className={`flex-1 py-2 rounded-lg text-sm border ${
                  payType === 'wxpay'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-base-200 border-base-300 text-gray-400'
                }`}
              >
                微信支付
              </button>
            </div>
          </div>

          {error && (
            <div className="text-xs text-rose-400 px-2 py-1.5 rounded bg-rose-500/10 border border-rose-500/20">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={createMut.isPending || amountCents < 100}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            {createMut.isPending && <Spinner className="border-black/30 border-t-black" />}
            {amountCents >= 100 ? `支付 ${formatYuan(amountCents)}` : '选择金额'}
          </button>
          <p className="text-[10px] text-gray-600 text-center">
            点击支付后将跳转到第三方支付页面。支付完成后返回本页面即可看到余额更新。
          </p>
        </div>
      )}

      <div className="stat-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-base-300">
          <h3 className="text-sm font-medium text-gray-300">充值记录</h3>
          <span className="text-xs text-gray-600">最近 50 条</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-base-300 bg-base-200/30">
              <th className="text-left p-4 font-medium">时间</th>
              <th className="text-right p-4 font-medium">金额</th>
              <th className="text-left p-4 font-medium">方式</th>
              <th className="text-left p-4 font-medium">订单号</th>
              <th className="text-center p-4 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500 text-xs">
                  暂无充值记录
                </td>
              </tr>
            )}
            {records.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ r }: { r: TopUpRecord }) {
  const style = STATUS_STYLE[r.status];
  return (
    <tr className="border-b border-base-300/50 hover:bg-base-200/30 transition-colors">
      <td className="p-4 text-xs text-gray-500 font-mono">
        {new Date(r.created_at).toLocaleString('zh-CN')}
      </td>
      <td className="p-4 text-right font-mono text-gray-200">
        {formatYuan(r.amount_cents)}
        {r.bonus_cents > 0 && (
          <span className="ml-1 text-[10px] text-emerald-400">+{formatYuan(r.bonus_cents)}</span>
        )}
      </td>
      <td className="p-4 text-xs text-gray-400">{r.method}</td>
      <td className="p-4 text-[10px] text-gray-600 font-mono">
        {r.out_trade_no ?? '—'}
      </td>
      <td className="p-4 text-center">
        <span
          className={`inline-block px-2 py-0.5 rounded text-[10px] border ${style.className}`}
        >
          {style.label}
        </span>
      </td>
    </tr>
  );
}
