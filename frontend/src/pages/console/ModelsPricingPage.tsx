import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import { formatPrice, type Model } from '@/hooks/useModels';
import { useUserGroups, type UserGroup } from '@/hooks/useUserGroups';
import { useUserModels } from '@/hooks/useUserModels';
import {
  multiplierAsNumber,
  formatMultiplier,
  PROVIDER_LABELS,
  PROVIDER_ORDER,
  type GroupProvider,
} from '@/hooks/useGroups';

function modelMatchesProvider(model: Model, provider: GroupProvider): boolean {
  return model.provider.toLowerCase() === provider;
}

export default function ModelsPricingPage() {
  const { data: models = [], isLoading } = useUserModels();
  const { data: groups = [] } = useUserGroups();

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-semibold">模型价格</h2>

      <div className="stat-card rounded-xl p-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="text-amber-400">说明：</span>
          每个令牌按厂商各绑定一个分组，实际计费 = 官方价格 × 分组倍率。官方价以 $ 标价，分组价以 ￥ 标价，本站 1 ￥ = 1 $ 等值计费。
        </p>
      </div>

      {PROVIDER_ORDER.map((provider) => (
        <ProviderSection
          key={provider}
          provider={provider}
          models={models.filter((m) => modelMatchesProvider(m, provider))}
          groups={groups.filter((g) => g.provider === provider)}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}

interface ProviderSectionProps {
  provider: GroupProvider;
  models: Model[];
  groups: UserGroup[];
  isLoading: boolean;
}

function ProviderSection({ provider, models, groups, isLoading }: ProviderSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? groups[0],
    [groups, selectedGroupId]
  );
  const selectedMultiplier = selectedGroup ? multiplierAsNumber(selectedGroup.multiplier) : null;

  const providerStyle =
    provider === 'anthropic'
      ? 'bg-amber-500/10 text-amber-400'
      : 'bg-emerald-500/10 text-emerald-400';

  return (
    <div className="stat-card rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full px-4 py-3 bg-base-200/50 border-b border-base-300 flex items-center gap-3 hover:bg-base-200 transition-colors"
      >
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
        />
        <span className={`px-2 py-0.5 rounded text-xs font-mono ${providerStyle}`}>
          {PROVIDER_LABELS[provider]}
        </span>
        <span className="text-[11px] text-gray-500">
          {models.length} 个模型 · {groups.length} 个分组
        </span>
      </button>

      {!collapsed && (
        <div className="p-4 space-y-3">
          {groups.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
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

          <div className="rounded-lg overflow-hidden border border-base-300/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-base-300 bg-base-200/30">
                  <th className="text-left p-4 font-medium">模型</th>
                  <th className="text-right p-4 font-medium">官方输入 ($/1M)</th>
                  <th className="text-right p-4 font-medium">官方输出 ($/1M)</th>
                  <th className="text-right p-4 font-medium">缓存读 ($/1M)</th>
                  <th className="text-right p-4 font-medium">缓存写 ($/1M)</th>
                  {selectedGroup && selectedMultiplier != null && (
                    <>
                      <th className="text-right p-4 font-medium">
                        <span className="text-amber-400">{selectedGroup.label}</span> 输入 (￥/1M)
                      </th>
                      <th className="text-right p-4 font-medium">
                        <span className="text-amber-400">{selectedGroup.label}</span> 输出 (￥/1M)
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
                {!isLoading && models.length === 0 && (
                  <tr>
                    <td colSpan={selectedGroup ? 7 : 5} className="p-8 text-center text-gray-500 text-xs">
                      该厂商暂无可用模型
                    </td>
                  </tr>
                )}
                {models.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-base-300/50 hover:bg-base-200/30 transition-colors last:border-0"
                  >
                    <td className="p-4">
                      <div className="font-mono text-amber-400/90 text-xs">{m.name}</div>
                      {m.description && (
                        <div className="text-[10px] text-gray-600 mt-0.5">{m.description}</div>
                      )}
                    </td>
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
                    <td className="p-4 text-right font-mono text-gray-500">
                      {m.cache_write_price_cents != null
                        ? `$${formatPrice(m.cache_write_price_cents)}`
                        : '—'}
                    </td>
                    {selectedGroup && selectedMultiplier != null && (
                      <>
                        <td className="p-4 text-right font-mono text-emerald-400">
                          ￥{formatPrice(Math.round(m.input_price_cents * selectedMultiplier))}
                        </td>
                        <td className="p-4 text-right font-mono text-emerald-400">
                          ￥{formatPrice(Math.round(m.output_price_cents * selectedMultiplier))}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
