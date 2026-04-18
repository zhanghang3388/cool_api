import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Power, X } from 'lucide-react';
import { adminApi, type ProviderKey } from '@/api/admin';

const PROVIDERS = ['openai', 'claude', 'gemini'] as const;

export default function ProviderKeysPage() {
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
    if (!confirm('Delete this key?')) return;
    await adminApi.deleteProviderKey(id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold">Provider Keys</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Key
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
            No {tab} keys configured
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
                    {key.is_active ? 'Active' : 'Disabled'}
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
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [weight, setWeight] = useState('1');
  const [priority, setPriority] = useState('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        models: null,
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
        className="card w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold">Add {provider} Key</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="My API Key" required />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">API Key</label>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} className="input-field font-code text-xs" placeholder="sk-..." required />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">Base URL (optional)</label>
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className="input-field text-xs" placeholder="https://api.openai.com/v1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1 font-display">Weight</label>
              <input type="number" value={weight} onChange={e => setWeight(e.target.value)} className="input-field" min="1" />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1 font-display">Priority</label>
              <input type="number" value={priority} onChange={e => setPriority(e.target.value)} className="input-field" min="0" />
            </div>
          </div>
          {error && <p className="text-danger text-xs">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Creating...' : 'Create Key'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
