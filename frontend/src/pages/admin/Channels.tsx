import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Power, X, Download } from 'lucide-react';
import { adminApi, type Channel, type ProviderKey } from '@/api/admin';

export default function ChannelsPage() {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [keys, setKeys] = useState<ProviderKey[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [chRes, kRes] = await Promise.all([
        adminApi.listChannels(),
        adminApi.listProviderKeys(),
      ]);
      setChannels(chRes.data);
      setKeys(kRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (ch: Channel) => {
    await adminApi.updateChannel(ch.id, { is_active: !ch.is_active });
    load();
  };

  const deleteChannel = async (id: string) => {
    if (!confirm(t('admin.channels.deleteConfirm'))) return;
    await adminApi.deleteChannel(id);
    load();
  };

  const keyName = (id: string) => keys.find(k => k.id === id)?.name ?? id.slice(0, 8);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold">{t('admin.channels.title')}</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('admin.channels.addChannel')}
        </button>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="card animate-pulse h-20" />
        ) : channels.length === 0 ? (
          <div className="card text-center text-text-secondary text-sm py-8">{t('admin.channels.noChannels')}</div>
        ) : (
          channels.map((ch, i) => (
            <motion.div
              key={ch.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card card-glow"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-display text-sm font-semibold">{ch.name}</span>
                    <span className={`text-xs ${ch.is_active ? 'text-success' : 'text-danger'}`}>
                      {ch.is_active ? t('common.active') : t('common.disabled')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-text-secondary mb-2">
                    <span className="px-2 py-0.5 rounded bg-bg-tertiary">{ch.strategy}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {ch.model_pattern.split(',').map(m => m.trim()).filter(Boolean).map(model => (
                      <span key={model} className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-bg-tertiary font-code">
                        {model}
                      </span>
                    ))}
                  </div>
                  {ch.key_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {ch.key_ids.map(kid => (
                        <span key={kid} className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                          {keyName(kid)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button onClick={() => toggleActive(ch)} className="p-2 rounded-lg hover:bg-bg-tertiary text-text-secondary transition-colors">
                    <Power className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteChannel(ch.id)} className="p-2 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {showAdd && <AddChannelModal keys={keys} onClose={() => setShowAdd(false)} onSaved={load} />}
      </AnimatePresence>
    </div>
  );
}

function AddChannelModal({ keys, onClose, onSaved }: { keys: ProviderKey[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const PROVIDERS = ['openai', 'claude', 'gemini'] as const;
  const DEFAULT_URLS: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    claude: 'https://api.anthropic.com',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
  };

  const [name, setName] = useState('');
  const [provider, setProvider] = useState<string>('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch models state
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Also allow selecting existing keys
  const [useExistingKey, setUseExistingKey] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

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
      setFetchError(err.response?.data?.error?.message || t('admin.channels.fetchError'));
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

  const toggleKey = (id: string) => {
    setSelectedKeys(prev => prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!useExistingKey && selectedModels.length === 0) {
      setError(t('admin.channels.noModelsSelected'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      let keyIds = selectedKeys;

      // If using new credentials, create provider key first
      if (!useExistingKey) {
        const keyRes = await adminApi.createProviderKey({
          provider,
          name: `${name}-key`,
          api_key: apiKey,
          base_url: baseUrl || null,
          weight: 1,
          priority: 0,
          rpm_limit: null,
          tpm_limit: null,
          models: selectedModels,
        });
        keyIds = [keyRes.data.id];
      }

      const modelPattern = useExistingKey
        ? (document.getElementById('manual-pattern') as HTMLInputElement)?.value || ''
        : selectedModels.join(',');

      await adminApi.createChannel({ name, model_pattern: modelPattern, key_ids: keyIds });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create channel');
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
        className="card w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold">{t('admin.channels.addChannel')}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.channels.name')}</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="GPT-4o Channel" required />
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setUseExistingKey(false)}
              className={`flex-1 py-2 rounded-lg text-xs font-display transition-colors ${!useExistingKey ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-tertiary'}`}
            >
              {t('admin.channels.newCredentials')}
            </button>
            <button
              type="button"
              onClick={() => setUseExistingKey(true)}
              className={`flex-1 py-2 rounded-lg text-xs font-display transition-colors ${useExistingKey ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-tertiary'}`}
            >
              {t('admin.channels.existingKeys')}
            </button>
          </div>

          {!useExistingKey ? (
            <>
              {/* Provider + credentials */}
              <div>
                <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.channels.provider')}</label>
                <select value={provider} onChange={e => { setProvider(e.target.value); setFetchedModels([]); setSelectedModels([]); }} className="input-field">
                  {PROVIDERS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1 font-display">Base URL</label>
                <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className="input-field text-xs font-code" placeholder={DEFAULT_URLS[provider]} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1 font-display">API Key</label>
                <input value={apiKey} onChange={e => setApiKey(e.target.value)} className="input-field text-xs font-code" placeholder="sk-..." required={!useExistingKey} />
              </div>

              {/* Fetch models button */}
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={!apiKey || fetching}
                className="btn-secondary text-xs flex items-center gap-2 w-full justify-center"
              >
                <Download className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} />
                {fetching ? t('admin.channels.fetching') : t('admin.channels.fetchModels')}
              </button>
              {fetchError && <p className="text-danger text-xs">{fetchError}</p>}

              {/* Model selection */}
              {fetchedModels.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-text-secondary font-display">
                      {t('admin.channels.selectModels')} ({selectedModels.length}/{fetchedModels.length})
                    </label>
                    <button type="button" onClick={toggleAllModels} className="text-xs text-accent hover:underline">
                      {selectedModels.length === fetchedModels.length ? t('admin.keys.deselectAll') : t('admin.keys.selectAll')}
                    </button>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-0.5 rounded-lg border border-border p-2 bg-bg-tertiary">
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
            </>
          ) : (
            <>
              {/* Existing keys mode */}
              <div>
                <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.channels.providerKeys')}</label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {keys.filter(k => k.is_active).map(k => (
                    <label key={k.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg-tertiary cursor-pointer text-sm">
                      <input type="checkbox" checked={selectedKeys.includes(k.id)} onChange={() => toggleKey(k.id)} className="accent-accent" />
                      <span>{k.name}</span>
                      <span className="text-xs text-text-secondary ml-auto">{k.provider}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.channels.modelPattern')}</label>
                <input id="manual-pattern" className="input-field font-code text-xs" placeholder="gpt-4o*" required={useExistingKey} />
              </div>
            </>
          )}

          {error && <p className="text-danger text-xs">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t('admin.channels.creating') : t('admin.channels.createChannel')}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
