import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Zap, Layers, Radio, CreditCard, Code2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import LangSwitch from '@/components/ui/LangSwitch';

interface PublicChannel {
  name: string;
  model_pattern: string;
  strategy: string;
  provider: string;
}

const providerColors: Record<string, string> = {
  openai: 'text-success border-success/20 bg-success/5',
  claude: 'text-accent-amber border-accent-amber/20 bg-accent-amber/5',
  anthropic: 'text-accent-amber border-accent-amber/20 bg-accent-amber/5',
  gemini: 'text-accent border-accent/20 bg-accent/5',
  google: 'text-accent border-accent/20 bg-accent/5',
  deepseek: 'text-blue-400 border-blue-400/20 bg-blue-400/5',
  mistral: 'text-orange-400 border-orange-400/20 bg-orange-400/5',
  unknown: 'text-text-secondary border-border bg-bg-tertiary',
};

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  google: 'Google',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
};

export default function Home() {
  const { t } = useTranslation();
  const { isAuthenticated, isAdmin } = useAuthStore();
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/v1/channels/public')
      .then(r => r.json())
      .then(data => {
        setChannels(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const providers = ['all', ...new Set(channels.map(c => c.provider))];
  const filtered = tab === 'all' ? channels : channels.filter(c => c.provider === tab);

  const features = [
    { icon: Layers, title: t('home.features.multiModel'), desc: t('home.features.multiModelDesc'), color: 'text-accent' },
    { icon: Radio, title: t('home.features.streaming'), desc: t('home.features.streamingDesc'), color: 'text-success' },
    { icon: CreditCard, title: t('home.features.billing'), desc: t('home.features.billingDesc'), color: 'text-accent-amber' },
    { icon: Code2, title: t('home.features.compatible'), desc: t('home.features.compatibleDesc'), color: 'text-accent' },
  ];

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border/50 bg-bg-primary/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-accent" />
            <span className="font-display text-sm font-bold text-accent">COOL API</span>
          </div>
          <div className="flex items-center gap-3">
            <LangSwitch />
            {isAuthenticated() ? (
              <Link
                to={isAdmin() ? '/admin' : '/dashboard'}
                className="btn-primary text-xs"
              >
                {t('home.hero.console')}
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-secondary text-xs">{t('home.hero.login')}</Link>
                <Link to="/register" className="btn-primary text-xs">{t('home.hero.register')}</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-accent/5 rounded-full blur-[160px] pointer-events-none" />
        <div className="absolute top-40 left-1/4 w-[400px] h-[400px] bg-accent-amber/3 rounded-full blur-[120px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="relative max-w-3xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent/20 bg-accent/5 mb-8">
            <Zap className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-display text-accent">{t('home.hero.subtitle')}</span>
          </div>

          <h1 className="text-5xl sm:text-7xl font-display font-bold mb-6 tracking-tight">
            <span className="text-text-primary">COOL </span>
            <span className="text-accent">API</span>
          </h1>

          <p className="text-lg text-text-secondary max-w-xl mx-auto mb-10 leading-relaxed">
            {t('home.hero.description')}
          </p>

          <div className="flex items-center justify-center gap-4">
            {isAuthenticated() ? (
              <Link to={isAdmin() ? '/admin' : '/dashboard'} className="btn-primary px-8 py-3">
                {t('home.hero.console')}
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn-primary px-8 py-3">{t('home.hero.register')}</Link>
                <Link to="/login" className="btn-secondary px-8 py-3">{t('home.hero.login')}</Link>
              </>
            )}
            <Link to="/pricing" className="btn-secondary px-8 py-3">{t('home.hero.pricing')}</Link>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-display font-bold text-center mb-12"
          >
            {t('home.features.title')}
          </motion.h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="card card-glow"
              >
                <f.icon className={`w-8 h-8 ${f.color} mb-4`} />
                <h3 className="font-display text-sm font-semibold mb-2">{f.title}</h3>
                <p className="text-xs text-text-secondary leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Models */}
      <section className="py-20 px-6 bg-bg-secondary/50">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-3xl font-display font-bold mb-3">{t('home.models.title')}</h2>
            <p className="text-text-secondary text-sm">{t('home.models.subtitle')}</p>
          </motion.div>

          {/* Provider tabs */}
          <div className="flex justify-center gap-2 mb-8">
            {providers.map(p => (
              <button
                key={p}
                onClick={() => setTab(p)}
                className={`px-4 py-2 rounded-lg text-xs font-display transition-colors ${
                  tab === p
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                {p === 'all' ? t('home.models.all') : providerLabels[p] || p}
              </button>
            ))}
          </div>

          {/* Model cards */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <div key={i} className="card animate-pulse h-24" />)}
            </div>
          ) : (() => {
            const allModels = filtered.flatMap(ch =>
              ch.model_pattern.split(',').map(m => m.trim()).filter(Boolean).map(model => ({
                model,
                channel: ch.name,
                provider: ch.provider,
                strategy: ch.strategy,
              }))
            );
            return allModels.length === 0 ? (
              <div className="text-center text-text-secondary text-sm py-12">
                {t('home.models.noModels')}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allModels.map((item, i) => (
                  <motion.div
                    key={`${item.channel}-${item.model}`}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.03 }}
                    className="card card-glow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="font-code text-sm font-semibold text-text-primary">
                        {item.model}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${providerColors[item.provider] || providerColors.unknown}`}>
                        {providerLabels[item.provider] || item.provider}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-secondary">
                      <span>{t('home.models.channel')}: {item.channel}</span>
                      <span className="px-1.5 py-0.5 rounded bg-bg-tertiary text-[10px]">
                        {item.strategy.replace('_', ' ')}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            );
          })()}
        </div>
      </section>

      {/* Pricing CTA */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <h2 className="text-3xl font-display font-bold mb-3">{t('home.pricing.title')}</h2>
            <p className="text-text-secondary text-sm mb-8">{t('home.pricing.subtitle')}</p>
            <Link to="/pricing" className="btn-primary px-8 py-3 text-sm">
              {t('home.hero.pricing')}
            </Link>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      {!isAuthenticated() && (
        <section className="py-20 px-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/3 to-transparent pointer-events-none" />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative max-w-lg mx-auto text-center"
          >
            <h2 className="text-3xl font-display font-bold mb-4">{t('home.cta.title')}</h2>
            <p className="text-text-secondary text-sm mb-8">{t('home.cta.description')}</p>
            <Link to="/register" className="btn-primary px-10 py-3 text-sm">
              {t('home.cta.register')}
            </Link>
          </motion.div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-text-secondary">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-accent" />
            <span className="font-display">COOL API</span>
          </div>
          <span>Powered by Rust + React</span>
        </div>
      </footer>
    </div>
  );
}
