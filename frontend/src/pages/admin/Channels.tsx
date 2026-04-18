import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Power, X } from 'lucide-react';
import { adminApi, type Channel, type ProviderKey } from '@/api/admin';

const STRATEGIES = ['round_robin', 'weighted', 'priority'] as const;

export default function ChannelsPage() {
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
    if (!confirm('Delete this channel?')) return;
    await adminApi.deleteChannel(id);
    load();
  };

  const keyName = (id: string) => keys.find(k => k.id === id)?.name ?? id.slice(0, 8);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold">Channels</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Channel
        </button>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="card animate-pulse h-20" />
        ) : channels.length === 0 ? (
          <div className="card text-center text-text-secondary text-sm py-8">No channels configured</div>
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
                      {ch.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-text-secondary">
                    <span className="font-code">{ch.model_pattern}</span>
                    <span className="px-2 py-0.5 rounded bg-bg-tertiary">{ch.strategy}</span>
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
  const [name, setName] = useState('');
  const [modelPattern, setModelPattern] = useState('');
  const [strategy, setStrategy] = useState<string>('round_robin');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleKey = (id: string) => {
    setSelectedKeys(prev => prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await adminApi.createChannel({ name, model_pattern: modelPattern, strategy, key_ids: selectedKeys });
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
        className="card w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold">Add Channel</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="GPT-4o Channel" required />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">Model Pattern</label>
            <input value={modelPattern} onChange={e => setModelPattern(e.target.value)} className="input-field font-code text-xs" placeholder="gpt-4o*" required />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">Strategy</label>
            <select value={strategy} onChange={e => setStrategy(e.target.value)} className="input-field">
              {STRATEGIES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">Provider Keys</label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {keys.filter(k => k.is_active).map(k => (
                <label key={k.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg-tertiary cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selectedKeys.includes(k.id)}
                    onChange={() => toggleKey(k.id)}
                    className="accent-accent"
                  />
                  <span>{k.name}</span>
                  <span className="text-xs text-text-secondary ml-auto">{k.provider}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-danger text-xs">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Creating...' : 'Create Channel'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
