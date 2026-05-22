import { Link } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePublicSiteConfig } from '@/hooks/useAdminSettings';
import { landingPath } from '@/lib/auth';
import SiteLogo from '@/components/SiteLogo';

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
      <div className="lg:col-span-7 slide-up">
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

      <div className="lg:col-span-5 slide-up" style={{ animationDelay: '120ms' }}>
        <TelemetryCard />
      </div>
    </section>
  );
}

function TelemetryCard() {
  const rows: { label: string; value: string; tone?: 'amber' | 'emerald' | 'cyan' }[] = [
    { label: 'gateway.status', value: 'OPERATIONAL', tone: 'emerald' },
    { label: 'protocol.openai', value: '/v1/chat/completions', tone: 'cyan' },
    { label: 'protocol.anthropic', value: '/v1/messages', tone: 'cyan' },
    { label: 'routing', value: 'priority + weighted', tone: 'amber' },
    { label: 'failover', value: 'auto', tone: 'amber' },
    { label: 'prompt.cache', value: 'enabled', tone: 'amber' },
  ];
  return (
    <div className="stat-card rounded-2xl p-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl" />
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-mono tracking-widest text-gray-500">
          GATEWAY · TELEMETRY
        </span>
        <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
          LIVE
        </span>
      </div>

      <div className="font-mono text-[12px] divide-y divide-base-300/60">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between py-2.5">
            <span className="text-gray-500">{r.label}</span>
            <span
              className={
                r.tone === 'emerald'
                  ? 'text-emerald-400'
                  : r.tone === 'cyan'
                    ? 'text-cyan-400'
                    : 'text-amber-400'
              }
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
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
      title: '多渠道路由',
      desc: '按优先级分层、同层加权随机；任一上游异常自动切到下一档，对调用方完全透明。',
    },
    {
      n: '03',
      title: '按量计费',
      desc: '每个分组独立倍率，输入/输出/缓存 token 分桶定价，所有调用都有可审计的账本。',
    },
    {
      n: '04',
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
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
  return (
    <section
      id="pricing"
      className="max-w-6xl mx-auto px-6 lg:px-10 py-16 lg:py-24"
    >
      <SectionLabel kicker="// 计费" title="按量结算，分桶清晰" />
      <div className="mt-10 grid md:grid-cols-3 gap-4">
        <PriceCell title="充值即用" mono="prepaid" desc="充值进余额，随调随扣。0 月费、0 起步金额。" />
        <PriceCell title="分组倍率" mono="× multiplier" desc="管理员可为不同用户分组配置统一倍率，B 端转售场景一行配置。" />
        <PriceCell title="缓存折扣" mono="cache hit" desc="命中 prompt 缓存的 token 走单独的低单价，长上下文场景成本可观。" />
      </div>
    </section>
  );
}

function PriceCell({ title, mono, desc }: { title: string; mono: string; desc: string }) {
  return (
    <div className="stat-card rounded-xl p-6">
      <div className="font-mono text-[10px] tracking-widest text-gray-500 mb-3">
        {mono}
      </div>
      <h3 className="text-base font-semibold text-gray-100 mb-2">{title}</h3>
      <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
    </div>
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
