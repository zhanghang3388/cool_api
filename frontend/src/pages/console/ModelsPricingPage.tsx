import { useMemo, useState } from 'react';
import Spinner from '@/components/ui/Spinner';
import { formatPrice } from '@/hooks/useModels';
import { useUserGroups } from '@/hooks/useUserGroups';
import { useUserModels } from '@/hooks/useUserModels';
import { multiplierAsNumber, formatMultiplier } from '@/hooks/useGroups';

export default function ModelsPricingPage() {
  const { data: models = [], isLoading } = useUserModels();
  const { data: groups = [] } = useUserGroups();

  const providers = useMemo(() => {
    const set = new Set<string>();
    models.forEach((m) => set.add(m.provider));
    return Array.from(set).sort();
  }, [models]);
  const [providerFilter, setProviderFilter] = useState('all');
  const filtered =
    providerFilter === 'all' ? models : models.filter((m) => m.provider === providerFilter);

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? groups[0];
  const selectedMultiplier = selectedGroup
    ? multiplierAsNumber(selectedGroup.multiplier)
    : null;

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-semibold">模型价格</h2>

      <div className="stat-card rounded-xl p-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="text-amber-400">说明：</span>
          每个令牌绑定一个分组，实际计费 = 官方价格 × 分组倍率。下表展示官方价格及所选分组的实际价格。
        </p>
      </div>

      {groups.length > 0 && (
        <div className="stat-card rounded-xl p-4 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-500 whitespace-nowrap">按分组查看：</span>
          <div className="flex gap-2 flex-wrap flex-1">
            {groups.map((g) => {
              const active = selectedGroup?.id === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 ${
                    active
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-base-200 text-gray-400 border border-base-300 hover:text-gray-200'
                  }`}
                >
                  {g.label}
                  <span
                    className={`font-mono text-[10px] px-1 rounded ${
                      active ? 'bg-amber-500/20' : 'bg-base-300'
                    }`}
                  >
                    ×{formatMultiplier(g.multiplier)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {providers.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setProviderFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
              providerFilter === 'all'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-base-200 text-gray-400 border border-base-300 hover:text-gray-200'
            }`}
          >
            全部
          </button>
          {providers.map((p) => (
            <button
              key={p}
              onClick={() => setProviderFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                providerFilter === p
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-base-200 text-gray-400 border border-base-300 hover:text-gray-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="stat-card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-base-300 bg-base-200/50">
              <th className="text-left p-4 font-medium">模型</th>
              <th className="text-left p-4 font-medium">供应商</th>
              <th className="text-right p-4 font-medium">官方输入 ($/1M)</th>
              <th className="text-right p-4 font-medium">官方输出 ($/1M)</th>
              <th className="text-right p-4 font-medium">缓存读 ($/1M)</th>
              {selectedGroup && selectedMultiplier != null && (
                <>
                  <th className="text-right p-4 font-medium">
                    <span className="text-amber-400">{selectedGroup.label}</span> 输入
                  </th>
                  <th className="text-right p-4 font-medium">
                    <span className="text-amber-400">{selectedGroup.label}</span> 输出
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={selectedGroup ? 7 : 5} className="p-8 text-center text-gray-500 text-xs">
                  <Spinner className="mr-2" /> 加载中...
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={selectedGroup ? 7 : 5} className="p-8 text-center text-gray-500 text-xs">
                  暂无可用模型
                </td>
              </tr>
            )}
            {filtered.map((m) => (
              <tr
                key={m.id}
                className="border-b border-base-300/50 hover:bg-base-200/30 transition-colors"
              >
                <td className="p-4">
                  <div className="font-mono text-amber-400/90 text-xs">{m.name}</div>
                  {m.description && (
                    <div className="text-[10px] text-gray-600 mt-0.5">{m.description}</div>
                  )}
                </td>
                <td className="p-4 text-gray-400 text-xs">{m.provider}</td>
                <td className="p-4 text-right font-mono text-gray-400">
                  ${formatPrice(m.input_price_cents)}
                </td>
                <td className="p-4 text-right font-mono text-gray-400">
                  ${formatPrice(m.output_price_cents)}
                </td>
                <td className="p-4 text-right font-mono text-gray-500">
                  {m.cache_read_price_cents != null
                    ? `$${formatPrice(m.cache_read_price_cents)}`
                    : '—'}
                </td>
                {selectedGroup && selectedMultiplier != null && (
                  <>
                    <td className="p-4 text-right font-mono text-emerald-400">
                      ${formatPrice(Math.round(m.input_price_cents * selectedMultiplier))}
                    </td>
                    <td className="p-4 text-right font-mono text-emerald-400">
                      ${formatPrice(Math.round(m.output_price_cents * selectedMultiplier))}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
