import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  usePublicSiteConfig,
  usePublicPricingShowcase,
  type PricingShowcaseGroup,
  type PricingShowcaseModel,
  type PricingShowcaseSection,
} from '@/hooks/useAdminSettings';
import { landingPath } from '@/lib/auth';
import SiteLogo from '@/components/SiteLogo';

const PROVIDER_LABEL: Record<PricingShowcaseSection['provider'], string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export default function LandingPage() {
  const { data: site } = usePublicSiteConfig();
  const { data: user } = useCurrentUser();

  const siteName = site?.site_name?.trim() || 'AetherGate';
  const announcement = site?.announcement?.trim();

  const consoleHref = user ? landingPath(user.role) : '/login';
  const consoleLabel = user ? '进入控制台' : '登录控制台';

  return (
    <div className="min-h-screen bg-base-50 text-gray-200 relative overflow-hidden">
      <AmbientBackdrop />

      <header className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 pt-6 flex items-center justify-between">
        <SiteLogo subtitle="AI GATEWAY" size="w-9 h-9" nameClass="text-base font-semibold" />
        <nav className="flex items-center gap-1 text-xs">
          <a
            href="#features"
            className="hidden sm:inline px-3 py-2 text-gray-400 hover:text-amber-400 transition"
          >
            特性
          </a>
          <a
            href="#providers"
            className="hidden sm:inline px-3 py-2 text-gray-400 hover:text-amber-400 transition"
          >
            模型
          </a>
          <a
            href="#pricing"
            className="hidden sm:inline px-3 py-2 text-gray-400 hover:text-amber-400 transition"
          >
            计费
          </a>
          {!user && (
            <Link
              to="/register"
              className="px-3 py-2 text-gray-400 hover:text-amber-400 transition hidden sm:inline"
            >
              注册
            </Link>
          )}
          <Link
            to={consoleHref}
            className="ml-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-medium transition-colors"
          >
            {consoleLabel}
            <Arrow />
          </Link>
        </nav>
      </header>

      <main className="relative z-10">
        <Hero
          siteName={siteName}
          announcement={announcement}
          consoleHref={consoleHref}
          consoleLabel={consoleLabel}
        />
        <Features />
        <Providers />
        <Pricing />
        <CallToAction consoleHref={consoleHref} consoleLabel={consoleLabel} />
        <Footer siteName={siteName} />
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function AmbientBackdrop() {
  return (
    <>
      <div className="absolute inset-0 bg-dots opacity-40 pointer-events-none" />
      <div
        aria-hidden
        className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0) 60%)',
        }}
      />
      <div
        aria-hidden
        className="absolute top-[420px] -right-40 w-[520px] h-[520px] rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(34,211,238,0.12) 0%, rgba(34,211,238,0) 60%)',
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

interface HeroProps {
  siteName: string;
  announcement?: string;
  consoleHref: string;
  consoleLabel: string;
}

function Hero({ siteName, announcement, consoleHref, consoleLabel }: HeroProps) {
  return (
    <section className="max-w-6xl mx-auto px-6 lg:px-10 pt-16 lg:pt-24 pb-20 grid lg:grid-cols-12 gap-10 items-center">
      <div className="lg:col-span-6 slide-up">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/5 mb-6">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full pulse-dot" />
          <span className="text-[11px] font-mono tracking-widest text-amber-300/90">
            SYSTEM&nbsp;ONLINE
          </span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight">
          一个网关
          <span className="block mt-1">
            接入<span className="text-amber-400"> {siteName}</span>
          </span>
          <span className="block mt-1 text-gray-500 text-2xl sm:text-3xl lg:text-4xl">
            背后的所有模型。
          </span>
        </h1>

        <p className="mt-6 text-gray-400 max-w-xl leading-relaxed">
          OpenAI 与 Anthropic 协议原生兼容的多渠道转发层。
          统一密钥、统一计费、自动路由与故障转移，再加上 Prompt 缓存——
          把上游的复杂留给我们，你只管写 prompt。
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to={consoleHref}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-medium transition-colors text-sm"
          >
            {consoleLabel}
            <Arrow />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-base-300 hover:border-amber-500/40 text-sm text-gray-300 transition-colors"
          >
            了解特性
          </a>
        </div>

        {announcement && (
          <div className="mt-8 stat-card rounded-xl p-4 border-amber-500/20 max-w-xl">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-amber-400 font-mono text-xs shrink-0">
                NOTICE&nbsp;//
              </span>
              <p className="text-xs text-amber-300/90 leading-relaxed whitespace-pre-wrap">
                {announcement}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="lg:col-span-6 slide-up" style={{ animationDelay: '120ms' }}>
        <EndpointCard />
      </div>
    </section>
  );
}

function EndpointCard() {
  const tabs: {
    id: string;
    label: string;
    model: string;
    endpoint: string;
    code: string;
  }[] = [
    {
      id: 'openai',
      label: 'OpenAI',
      model: 'gpt-4o',
      endpoint: '/v1/chat/completions',
      code: `curl $GATEWAY/v1/chat/completions \\
  -H "Authorization: Bearer $AETHER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      { "role": "user", "content": "Hello" }
    ]
  }'`,
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      model: 'claude-opus-4',
      endpoint: '/v1/messages',
      code: `curl $GATEWAY/v1/messages \\
  -H "x-api-key: $AETHER_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-opus-4",
    "max_tokens": 1024,
    "messages": [
      { "role": "user", "content": "Hello" }
    ]
  }'`,
    },
  ];

  const [active, setActive] = useState(tabs[0].id);
  const [copied, setCopied] = useState(false);
  const [typed, setTyped] = useState('');
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  // Typewriter — restarts whenever the active tab flips. Pull characters in
  // small bursts so longer snippets don't take painfully long to finish.
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    setTyped('');
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
    }
    const code = current.code;
    let i = 0;
    timerRef.current = window.setInterval(() => {
      // Speed up after the first ~80 chars so the bottom of the JSON body
      // isn't a slog.
      const step = i < 80 ? 1 : 2;
      i = Math.min(i + step, code.length);
      setTyped(code.slice(0, i));
      if (i >= code.length && timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, 18);
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [current.code]);

  const isTyping = typed.length < current.code.length;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="stat-card rounded-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-base-300/60">
        <span className="text-xs font-mono tracking-widest text-gray-500">
          QUICKSTART · CURL
        </span>
        <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
          LIVE
        </span>
      </div>

      <div className="flex items-center gap-1.5 px-4 pt-3 overflow-x-auto no-scrollbar">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={
                'px-3.5 py-2 rounded-md text-xs font-mono tracking-wide transition-colors whitespace-nowrap ' +
                (isActive
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-gray-500 hover:text-gray-300 border border-transparent')
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-cyan-400">POST</span>
          <span className="text-gray-400">{current.endpoint}</span>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="text-[11px] font-mono px-2.5 py-1 rounded border border-base-300/80 text-gray-400 hover:text-amber-300 hover:border-amber-500/40 transition-colors"
        >
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>

      <pre className="px-5 pb-5 text-[14px] leading-[1.65] font-mono text-gray-300 whitespace-pre-wrap break-words min-h-[280px]">
        <code>
          {renderCurl(typed)}
          {isTyping && (
            <span className="inline-block w-[0.55em] h-[1.05em] -mb-[2px] bg-amber-400/90 align-middle animate-caret-blink" />
          )}
        </code>
      </pre>
    </div>
  );
}

function renderCurl(code: string) {
  const tokens: { text: string; cls?: string }[] = [];
  const re =
    /(curl\b)|(-[A-Za-z]\b)|("(?:[^"\\]|\\.)*")|(\$[A-Z_][A-Z0-9_]*)|(https?:\/\/\S+)|(\\\n)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) tokens.push({ text: code.slice(last, m.index) });
    if (m[1]) tokens.push({ text: m[1], cls: 'text-amber-400' });
    else if (m[2]) tokens.push({ text: m[2], cls: 'text-cyan-400' });
    else if (m[3]) tokens.push({ text: m[3], cls: 'text-emerald-300' });
    else if (m[4]) tokens.push({ text: m[4], cls: 'text-amber-300' });
    else if (m[5]) tokens.push({ text: m[5], cls: 'text-cyan-300/90' });
    else if (m[6]) tokens.push({ text: m[6], cls: 'text-gray-600' });
    last = m.index + m[0].length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last) });
  return tokens.map((t, i) =>
    t.cls ? (
      <span key={i} className={t.cls}>
        {t.text}
      </span>
    ) : (
      <span key={i}>{t.text}</span>
    ),
  );
}

function Features() {
  const items = [
    {
      n: '01',
      title: '统一接入',
      desc: '同时暴露 OpenAI 与 Anthropic 两套原生协议，已有 SDK 改个 base_url 就能跑。',
    },
    {
      n: '02',
      title: '按量计费',
      desc: '每个分组独立倍率，输入/输出/缓存 token 分桶定价，所有调用都有可审计的账本。',
    },
    {
      n: '03',
      title: 'Prompt 缓存',
      desc: '确定性请求自动落 Redis，命中走更便宜的 cached 单价；保留缓存读写计费记录。',
    },
  ];
  return (
    <section
      id="features"
      className="max-w-6xl mx-auto px-6 lg:px-10 py-16 lg:py-24"
    >
      <SectionLabel kicker="// 特性" title="为什么用网关" />
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((it, i) => (
          <div
            key={it.n}
            className="stat-card card-glow rounded-xl p-6 fade-in"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-baseline justify-between mb-4">
              <span className="font-mono text-xs text-gray-500 tracking-widest">
                {it.n}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
            </div>
            <h3 className="text-base font-semibold text-gray-100 mb-2">{it.title}</h3>
            <p className="text-xs text-gray-400 leading-relaxed">{it.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Providers() {
  return (
    <section
      id="providers"
      className="max-w-6xl mx-auto px-6 lg:px-10 py-16 lg:py-24"
    >
      <SectionLabel kicker="// 上游" title="原生协议接入主流模型供应商" />

      <div className="mt-10 stat-card rounded-2xl p-6 lg:p-10">
        <ProviderTopology />
        <p className="mt-6 text-xs text-gray-500 text-center font-mono tracking-wider">
          // 渠道可按模型、用户分组、优先级、权重灵活配置
        </p>
      </div>
    </section>
  );
}

function ProviderTopology() {
  const upstreams = [
    { id: 'openai', label: 'OpenAI', sub: 'gpt-4o · gpt-4.1 · o1' },
    { id: 'anthropic', label: 'Anthropic', sub: 'claude-opus-4 · claude-sonnet · claude-haiku' },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-6">
      {/* clients */}
      <div className="space-y-3">
        <ClientPill label="OpenAI SDK" sub="base_url 改这里" />
        <ClientPill label="Anthropic SDK" sub="base_url 改这里" />
        <ClientPill label="curl / 自研" sub="HTTP 直连" />
      </div>

      {/* center hub */}
      <div className="relative flex items-center justify-center">
        <svg
          aria-hidden
          className="hidden md:block absolute inset-y-0 -left-6 w-12 h-full text-amber-500/40"
          viewBox="0 0 40 200"
          preserveAspectRatio="none"
        >
          <path
            d="M0 30 C 20 30, 20 100, 40 100 M0 100 C 20 100, 20 100, 40 100 M0 170 C 20 170, 20 100, 40 100"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        </svg>
        <svg
          aria-hidden
          className="hidden md:block absolute inset-y-0 -right-6 w-12 h-full text-amber-500/40"
          viewBox="0 0 40 200"
          preserveAspectRatio="none"
        >
          <path
            d="M40 60 C 20 60, 20 100, 0 100 M40 140 C 20 140, 20 100, 0 100"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        </svg>

        <div className="w-40 h-40 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-transparent flex flex-col items-center justify-center text-center px-4">
          <div className="font-mono text-[10px] tracking-widest text-amber-400/80 mb-2">
            GATEWAY
          </div>
          <div className="text-amber-400 text-2xl font-semibold">∞</div>
          <div className="text-[10px] text-gray-400 mt-2 leading-tight">
            路由 · 计费 · 缓存
          </div>
        </div>
      </div>

      {/* upstreams */}
      <div className="space-y-3">
        {upstreams.map((u) => (
          <div
            key={u.id}
            className="rounded-xl border border-base-300 bg-base-200/60 p-3 hover:border-amber-500/30 transition"
          >
            <div className="text-sm font-medium text-gray-100">{u.label}</div>
            <div className="text-[11px] text-gray-500 font-mono mt-0.5 truncate">
              {u.sub}
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-dashed border-base-300 p-3 text-center">
          <div className="text-[11px] text-gray-500 font-mono">// 自定义渠道</div>
        </div>
      </div>
    </div>
  );
}

function ClientPill({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-200/60 p-3 hover:border-cyan-500/30 transition">
      <div className="text-sm font-medium text-gray-100">{label}</div>
      <div className="text-[11px] text-gray-500 font-mono mt-0.5">{sub}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Pricing() {
  const { data, isLoading } = usePublicPricingShowcase();
  // Hide entire section while loading or when no provider has a valid
  // showcase group (admin hasn't picked anything, or every pick was disabled).
  if (isLoading) return null;
  if (!data || data.sections.length === 0) return null;

  // 1 storage unit = 0.01 unit per 1M tokens. Project policy 1 USD = 1 ¥,
  // so the same numeric value is displayed as `$` for the official price
  // and `¥` for the local (group) price after multiplier.
  const fmt = (cents: number | null | undefined) =>
    cents == null ? null : (cents / 100).toFixed(cents < 100 ? 3 : 2);

  return (
    <section
      id="pricing"
      className="max-w-6xl mx-auto px-6 lg:px-10 py-16 lg:py-24"
    >
      <SectionLabel kicker="// 计费" title="模型定价" />

      <div className="mt-6 mb-4 flex items-center justify-end">
        <div className="text-[10px] text-gray-600 font-mono">
          官网价 $ · 本站价 ¥ · 单价 / 1M tokens
        </div>
      </div>

      <div className="space-y-8">
        {data.sections.map((section) => (
          <PricingSection key={section.provider} section={section} fmt={fmt} />
        ))}
      </div>
    </section>
  );
}

interface PricingSectionProps {
  section: PricingShowcaseSection;
  fmt: (cents: number | null | undefined) => string | null;
}

function PricingSection({ section, fmt }: PricingSectionProps) {
  const [activeId, setActiveId] = useState<number>(section.groups[0]?.id ?? -1);
  if (section.groups.length === 0) return null;
  const active: PricingShowcaseGroup =
    section.groups.find((g) => g.id === activeId) ?? section.groups[0];
  const multiplier = parseFloat(active.multiplier);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="text-sm text-gray-300">
          <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono text-xs">
            {PROVIDER_LABEL[section.provider]}
          </span>
          <span className="ml-3">展示分组：</span>
          <span className="ml-2 px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-xs">
            {active.label}
          </span>
        </div>
        <div className="text-xs text-gray-500 font-mono">倍率 ×{multiplier.toFixed(2)}</div>
      </div>

      {section.groups.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {section.groups.map((g) => {
            const isActive = g.id === active.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveId(g.id)}
                className={`px-2.5 py-1 rounded text-xs transition-colors border ${
                  isActive
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

      <div className="stat-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-gray-500 border-b border-base-300 bg-base-200/50">
                <th className="text-left p-3 pl-4 font-medium">模型</th>
                <th className="text-right p-3 font-medium">输入</th>
                <th className="text-right p-3 font-medium">输出</th>
                <th className="text-right p-3 font-medium">缓存读</th>
                <th className="text-right p-3 pr-4 font-medium">缓存写</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-300/50">
              {active.models.map((m) => (
                <PriceRow key={m.name} model={m} multiplier={multiplier} fmt={fmt} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-gray-500 font-mono">
        // 官网价 $（base）；本站价 ¥ = base × 倍率（{multiplier.toFixed(2)}）
      </p>
    </div>
  );
}

interface PriceRowProps {
  model: PricingShowcaseModel;
  multiplier: number;
  fmt: (cents: number | null | undefined) => string | null;
}

function PriceRow({ model, multiplier, fmt }: PriceRowProps) {
  const cell = (cents: number | null | undefined) => {
    const base = fmt(cents);
    if (base == null) {
      return <span className="text-gray-700">—</span>;
    }
    const effectiveCents = cents == null ? cents : Math.round((cents ?? 0) * multiplier);
    const effective = fmt(effectiveCents);
    if (Math.abs(multiplier - 1) < 1e-6) {
      // Group price equals the official base — show one line, in ¥ since
      // it's what the user pays.
      return <span className="text-amber-400 font-mono">¥{base}</span>;
    }
    return (
      <div className="leading-tight">
        <div className="text-amber-400 font-mono">¥{effective}</div>
        <div className="text-[10px] text-gray-600 font-mono line-through">${base}</div>
      </div>
    );
  };
  return (
    <tr className="hover:bg-base-200/30 transition-colors">
      <td className="p-3 pl-4">
        <div className="font-mono text-gray-200 truncate max-w-[260px]" title={model.name}>
          {model.name}
        </div>
        <div className="text-[10px] text-gray-600 font-mono">{model.provider}</div>
      </td>
      <td className="p-3 text-right">{cell(model.input_price_cents)}</td>
      <td className="p-3 text-right">{cell(model.output_price_cents)}</td>
      <td className="p-3 text-right">{cell(model.cache_read_price_cents)}</td>
      <td className="p-3 pr-4 text-right">{cell(model.cache_write_price_cents)}</td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */

function CallToAction({
  consoleHref,
  consoleLabel,
}: {
  consoleHref: string;
  consoleLabel: string;
}) {
  return (
    <section className="max-w-6xl mx-auto px-6 lg:px-10 py-16 lg:py-24">
      <div className="relative stat-card rounded-2xl p-10 lg:p-14 overflow-hidden text-center">
        <div className="absolute inset-0 bg-dots opacity-30 pointer-events-none" />
        <div
          aria-hidden
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-[480px] h-[240px] rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse, rgba(245,158,11,0.22) 0%, rgba(245,158,11,0) 70%)',
          }}
        />
        <div className="relative">
          <div className="font-mono text-[11px] tracking-widest text-amber-400/80 mb-4">
            // READY?
          </div>
          <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight">
            把上游的麻烦交给网关
          </h2>
          <p className="mt-4 text-sm text-gray-400 max-w-md mx-auto">
            注册账号，创建一把 key，粘到你已经写好的 SDK 里——就这样。
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              to={consoleHref}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-medium transition-colors text-sm"
            >
              {consoleLabel}
              <Arrow />
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-base-300 hover:border-amber-500/40 text-sm text-gray-300 transition-colors"
            >
              注册新账号
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Footer({ siteName }: { siteName: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className="max-w-6xl mx-auto px-6 lg:px-10 pb-10 pt-4">
      <div className="border-t border-base-300/60 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-mono text-gray-500">
        <span>
          © {year} {siteName}
        </span>
        <span className="tracking-widest">// powered by aether-gateway</span>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */

function SectionLabel({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <div className="font-mono text-[11px] tracking-widest text-amber-400/80">
        {kicker}
      </div>
      <h2 className="mt-2 text-2xl lg:text-3xl font-semibold tracking-tight text-gray-100">
        {title}
      </h2>
    </div>
  );
}

function Arrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
