import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUsageSummary } from '@/hooks/useUsage';

function formatYuan(cents: number): string {
  return `¥${(cents / 10000).toFixed(2)}`;
}

export default function ConsoleDashboardPage() {
  const { data: user } = useCurrentUser();
  const { data: summary, isLoading } = useUsageSummary();
  if (!user) return null;

  const balance = (user.balance_cents / 10000).toFixed(2);

  return (
    <div className="fade-in space-y-4">
      <h2 className="text-lg font-semibold">仪表盘</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-2">账户余额</p>
          <p className="text-2xl font-mono font-bold text-emerald-400">¥{balance}</p>
          <p className="text-[10px] text-gray-600 mt-2">
            不足时请到 <Link to="/console/topup" className="text-amber-400 hover:underline">充值</Link> 页面补充
          </p>
        </div>
        <div className="stat-card rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-2">今日消耗</p>
          <p className="text-2xl font-mono font-bold text-amber-400">
            {summary ? formatYuan(summary.today_cost_cents) : isLoading ? '—' : '¥0.00'}
          </p>
          <p className="text-[10px] text-gray-600 mt-2">
            今日请求 {summary?.today_requests ?? 0} 次 · {summary?.today_tokens.toLocaleString() ?? 0} tokens
          </p>
        </div>
        <div className="stat-card rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-2">累计消耗</p>
          <p className="text-2xl font-mono font-bold text-gray-200">
            {summary ? formatYuan(summary.total_cost_cents) : isLoading ? '—' : '¥0.00'}
          </p>
          <p className="text-[10px] text-gray-600 mt-2">
            累计请求 {summary?.total_requests.toLocaleString() ?? 0} 次
          </p>
        </div>
      </div>

      <div className="stat-card rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-3">快速开始</h3>
        <div className="space-y-3 text-xs text-gray-400">
          <p>1. 到 <Link to="/console/keys" className="text-amber-400 hover:underline">令牌</Link> 页面创建一个令牌（只在创建时显示一次，记得保存）</p>
          <p>2. 使用 OpenAI SDK，把 <code className="font-mono px-1 bg-base-200 rounded">base_url</code> 指向本网关：</p>
          <pre className="bg-base-200 rounded-lg p-3 font-mono text-[11px] text-gray-300 overflow-x-auto">
{`from openai import OpenAI
client = OpenAI(
    api_key="sk-ag-...",           # 你在本站创建的令牌
    base_url="http://localhost:3000/v1"
)
resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role":"user","content":"你好"}]
)
print(resp.choices[0].message.content)`}
          </pre>
          <p>3. 到 <Link to="/console/usage" className="text-amber-400 hover:underline">用量日志</Link> 查看每次请求的 token 与费用明细</p>
        </div>
      </div>
    </div>
  );
}
