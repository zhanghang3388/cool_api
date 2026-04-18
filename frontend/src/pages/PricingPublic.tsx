import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Zap, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import LangSwitch from '@/components/ui/LangSwitch';

interface PricingItem {
  model: string;
  provider: string;
  input_price: number;
  output_price: number;
}

interface PublicGroup {
  id: string;
  name: string;
  multiplier: number;
  models: string[];
}

const providerColors: Record<string, string> = {
  openai: 'text-success border-success/20 bg-success/5',
  anthropic: 'text-accent-amber border-accent-amber/20 bg-accent-amber/5',
  google: 'text-accent border-accent/20 bg-accent/5',
  deepseek: 'text-blue-400 border-blue-400/20 bg-blue-400/5',
  mistral: 'text-orange-400 border-orange-400/20 bg-orange-400/5',
};

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
};

export default function PricingPublic() {
  const { t } = useTranslation();
  const { isAuthenticated, isAdmin } = useAuthStore();
  const [pricingData, setPricingData] = useState<PricingItem[]>([]);
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    Promise.all([
      fetch('/v1/pricing').then(r => r.json()).catch(() => []),
      fetch('/v1/groups').then(r => r.json()).catch(() => []),
    ]).then(([pricing, grps]) => {
      setPricingData(Array.isArray(pricing) ? pricing : []);
      setGroups(Array.isArray(grps) ? grps : []);
      setLoading(false);
    });
  }, []);

  const selectedGroup = filter.startsWith('group:') ? groups.find(g => g.id === filter.slice(6)) : null;
  const filteredPricing = pricingData.filter(row => {
    if (filter === 'all') return true;
    if (filter.startsWith('provider:')) return row.provider === filter.slice(9);
    if (selectedGroup) return selectedGroup.models.includes(row.model);
    return true;
  });
  const displayPricing = filteredPricing.map(row => ({
    ...row,
    original_input: row.input_price,
    original_output: row.output_price,
    input_price: selectedGroup ? row.input_price * selectedGroup.multiplier : row.input_price,
    output_price: selectedGroup ? row.output_price * selectedGroup.multiplier : row.output_price,
  }));

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border/50 bg-bg-primary/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent" />
              <span className="font-display text-sm font-bold text-accent">COOL API</span>
            </Link>
            <Link to="/" className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              {t('home.pricing.backHome')}
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <LangSwitch />
            {isAuthenticated() ? (
              <Link to={isAdmin() ? '/admin' : '/dashboard'} className="btn-primary text-xs">{t('home.hero.console')}</Link>
            ) : (
              <>
                <Link to="/login" className="btn-secondary text-xs">{t('home.hero.login')}</Link>
                <Link to="/register" className="btn-primary text-xs">{t('home.hero.register')}</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
            <h1 className="text-4xl font-display font-bold mb-3">{t('home.pricing.title')}</h1>
            <p className="text-text-secondary text-sm">{t('home.pricing.subtitle')}</p>
          </motion.div>

          {/* Filter tabs */}
          <div className="flex justify-center gap-2 mb-8 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-xs font-display transition-colors ${
                filter === 'all' ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              {t('home.models.all')}
            </button>
            {groups.map(g => (
              <button
                key={`g-${g.id}`}
                onClick={() => setFilter(`group:${g.id}`)}
                className={`px-4 py-2 rounded-lg text-xs font-display transition-colors ${
                  filter === `group:${g.id}` ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                {g.name} <span className="text-[10px] opacity-60">{g.multiplier}x</span>
              </button>
            ))}
            {[...new Set(pricingData.map(d => d.provider))].map(p => (
              <button
                key={`p-${p}`}
                onClick={() => setFilter(`provider:${p}`)}
                className={`px-4 py-2 rounded-lg text-xs font-display transition-colors ${
                  filter === `provider:${p}` ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                }`}
              >
                {providerLabels[p] || p}
              </button>
            ))}
          </div>

          {/* Cards */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="card animate-pulse h-32" />)}
            </div>
          ) : displayPricing.length === 0 ? (
            <div className="text-center text-text-secondary text-sm py-20">{t('common.noData')}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {displayPricing.map((item, i) => (
                <motion.div
                  key={item.model}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="card card-glow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="font-code text-xs font-semibold text-text-primary leading-tight">{item.model}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ml-2 ${providerColors[item.provider] || 'text-text-secondary border-border'}`}>
                      {providerLabels[item.provider] || item.provider}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-text-secondary">{t('home.pricing.inputPrice')}</span>
                      <div className="font-code text-xs">
                        {selectedGroup && item.original_input !== item.input_price ? (
                          <>
                            <span className="line-through text-text-secondary mr-1">¥{item.original_input.toFixed(2)}</span>
                            <span className="text-accent">¥{item.input_price.toFixed(2)}</span>
                          </>
                        ) : (
                          <span className="text-accent">¥{item.input_price.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-text-secondary">{t('home.pricing.outputPrice')}</span>
                      <div className="font-code text-xs">
                        {selectedGroup && item.original_output !== item.output_price ? (
                          <>
                            <span className="line-through text-text-secondary mr-1">¥{item.original_output.toFixed(2)}</span>
                            <span className="text-accent-amber">¥{item.output_price.toFixed(2)}</span>
                          </>
                        ) : (
                          <span className="text-accent-amber">¥{item.output_price.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <span className="text-[10px] text-text-secondary">{t('home.pricing.unit')}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

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
