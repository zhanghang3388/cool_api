import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Power, X, Download } from 'lucide-react';
import { adminApi, type ProviderKey } from '@/api/admin';

const PROVIDERS = ['openai', 'claude', 'gemini'] as const;

export default function ProviderKeysPage() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ProviderKey[]>([]);
  const [tab, setTab] = useState<string>('openai');
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.listProviderKeys();
      setKeys(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = keys.filter(k => k.provider === tab);

  const toggleActive = async (key: ProviderKey) => {
    await adminApi.updateProviderKey(key.id, { is_active: !key.is_active });
    load();
  };

  const deleteKey = async (id: string) => {
    if (!confirm(t('admin.keys.deleteConfirm'))) return;
    await adminApi.deleteProviderKey(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold">{t('admin.keys.title')}</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('admin.keys.addKey')}
        </button>
      </div>

      {/* Provider tabs */}
      <div className="flex gap-1 mb-4">
        {PROVIDERS.map(p => (
          <button
            key={p}
            onClick={() => setTab(p)}
            className={`px-4 py-2 rounded-lg text-xs font-display transition-colors ${
              tab === p ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="card animate-pulse h-20" />
        ) : filtered.length === 0 ? (
          <div className="card text-center text-text-secondary text-sm py-8">
            {t('admin.keys.noKeys', { provider: tab })}
          </div>
        ) : (
          filtered.map((key, i) => (
            <motion.div
              key={key.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card card-glow flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-display text-sm font-semibold">{key.name}</span>
                  <span className={`text-xs ${key.is_active ? 'text-success' : 'text-danger'}`}>
                    {key.is_active ? t('common.active') : t('common.disabled')}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-secondary">
                  <span className="font-code">{key.api_key.slice(0, 8)}...{key.api_key.slice(-4)}</span>
                  <span>W:{key.weight}</span>
                  <span>P:{key.priority}</span>
                  {key.models && <span>Models: {(key.models as string[]).join(', ')}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => toggleActive(key)}
                  className={`p-2 rounded-lg transition-colors ${
                    key.is_active ? 'hover:bg-danger/10 text-text-secondary hover:text-danger' : 'hover:bg-success/10 text-text-secondary hover:text-success'
                  }`}
                >
                  <Power className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteKey(key.id)}
                  className="p-2 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Add Key Modal */}
      <AnimatePresence>
        {showAdd && <AddKeyModal provider={tab} onClose={() => setShowAdd(false)} onSaved={load} />}
      </AnimatePresence>
    </div>
  );
}

function AddKeyModal({ provider, onClose, onSaved }: { provider: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [weight, setWeight] = useState('1');
  const [priority, setPriority] = useState('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const handleFetchModels = async () => {
    if (!apiKey) return;
    setFetching(true);
    setFetchError('');
    setFetchedModels([]);
    setSelectedModels([]);
    try {
      const { data } = await adminApi.fetchModels({
        provider,
        api_key: apiKey,
        base_url: baseUrl || undefined,
      });
      const ids = data.models.map(m => m.id);
      setFetchedModels(ids);
    } catch (err: any) {
      setFetchError(err.response?.data?.error?.message || t('admin.keys.fetchError'));
    } finally {
      setFetching(false);
    }
  };

  const toggleModel = (id: string) => {
    setSelectedModels(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const toggleAllModels = () => {
    if (selectedModels.length === fetchedModels.length) {
      setSelectedModels([]);
    } else {
      setSelectedModels([...fetchedModels]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await adminApi.createProviderKey({
        provider,
        name,
        api_key: apiKey,
        base_url: baseUrl || null,
        weight: parseInt(weight) || 1,
        priority: parseInt(priority) || 0,
        rpm_limit: null,
        tpm_limit: null,
        models: selectedModels.length > 0 ? selectedModels : null,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="card w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold">{t('admin.keys.addKey')}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.keys.name')}</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="My API Key" required />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.keys.apiKey')}</label>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} className="input-field font-code text-xs" placeholder="sk-..." required />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.keys.baseUrl')}</label>
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className="input-field text-xs" placeholder="https://api.openai.com/v1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.keys.weight')}</label>
              <input type="number" value={weight} onChange={e => setWeight(e.target.value)} className="input-field" min="1" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.keys.priority')}</label>
              <input type="number" value={priority} onChange={e => setPriority(e.target.value)} className="input-field" min="0" />
            </div>
          </div>

          {/* Fetch Models */}
          <div>
            <button
              type="button"
              onClick={handleFetchModels}
              disabled={!apiKey || fetching}
              className="btn-secondary text-xs flex items-center gap-2 w-full justify-center"
            >
              <Download className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} />
              {fetching ? t('admin.keys.fetching') : t('admin.keys.fetchModels')}
            </button>
            {fetchError && <p className="text-danger text-xs mt-1">{fetchError}</p>}
          </div>

          {fetchedModels.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-text-secondary font-display">
                  {t('admin.keys.modelsFound', { count: fetchedModels.length })}
                </label>
                <button type="button" onClick={toggleAllModels} className="text-xs text-accent hover:underline">
                  {selectedModels.length === fetchedModels.length ? t('admin.keys.deselectAll') : t('admin.keys.selectAll')}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-0.5 rounded-lg border border-border p-2 bg-bg-tertiary">
                {fetchedModels.map(id => (
                  <label key={id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-bg-secondary cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(id)}
                      onChange={() => toggleModel(id)}
                      className="accent-accent"
                    />
                    <span className="font-code">{id}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-danger text-xs">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t('admin.keys.creating') : t('admin.keys.createKey')}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
