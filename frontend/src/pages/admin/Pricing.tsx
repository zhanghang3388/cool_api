import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Plus, Pencil, Trash2, X } from 'lucide-react';
import { adminApi, type Channel, type PricingGroupWithChannels } from '@/api/admin';

interface PricingItem {
  id: string;
  model: string;
  provider: string;
  input_price: number;
  output_price: number;
  multiplier: number;
  is_active: boolean;
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

export default function PricingPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PricingItem[]>([]);
  const [groups, setGroups] = useState<PricingGroupWithChannels[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editGroup, setEditGroup] = useState<PricingGroupWithChannels | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const fetchPricing = async () => {
    setLoading(true);
    try { const { data } = await adminApi.listPricing(); setItems(Array.isArray(data) ? data : []); } catch {}
    setLoading(false);
  };

  const fetchGroups = async () => {
    try {
      const { data } = await adminApi.listGroups();
      setGroups(data);
      if (!activeGroupId && data.length > 0) setActiveGroupId(data[0].id);
    } catch {}
  };

  const fetchChannels = async () => {
    try { const { data } = await adminApi.listChannels(); setChannels(data); } catch {}
  };

  useEffect(() => { fetchPricing(); fetchGroups(); fetchChannels(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult('');
    try {
      const { data } = await adminApi.syncPricing();
      setSyncResult(t('admin.pricing.syncResult', { added: data.added, updated: data.updated, total: data.total }));
      fetchPricing();
    } catch { setSyncResult('Error'); }
    setSyncing(false);
  };

  const handleToggle = async (item: PricingItem) => {
    await adminApi.updatePricing(item.id, { is_active: !item.is_active });
    fetchPricing();
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm(t('admin.pricing.deleteConfirm'))) return;
    await adminApi.deleteGroup(id);
    fetchGroups();
    if (activeGroupId === id) setActiveGroupId(groups.find(g => g.id !== id)?.id || null);
  };

  const channelName = (id: string) => channels.find(c => c.id === id)?.name ?? id.slice(0, 8);

  const getGroupModels = (g: PricingGroupWithChannels) => {
    const models: string[] = [];
    for (const cid of g.channel_ids) {
      const ch = channels.find(c => c.id === cid);
      if (ch) ch.model_pattern.split(',').map(m => m.trim()).filter(Boolean).forEach(m => { if (!models.includes(m)) models.push(m); });
    }
    return models;
  };

  const activeGroup = groups.find(g => g.id === activeGroupId) || null;
  const groupModels = activeGroup ? getGroupModels(activeGroup) : [];
  const groupPricing = activeGroup ? items.filter(p => groupModels.includes(p.model)) : items;
  const multiplier = activeGroup?.multiplier ?? 1;

  return (
    <div className="space-y-6">
      {/* Header: Groups + Sync */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-display">{t('admin.pricing.title')}</h1>
        <div className="flex items-center gap-2">
          {syncResult && <span className="text-xs text-success">{syncResult}</span>}
          <button onClick={handleSync} disabled={syncing} className="btn-secondary text-xs flex items-center gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? t('admin.pricing.syncing') : t('admin.pricing.syncBtn')}
          </button>
          <button onClick={() => { setEditGroup(null); setShowGroupModal(true); }} className="btn-primary text-xs flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" /> {t('admin.pricing.addGroup')}
          </button>
        </div>
      </div>

      {/* Group tabs */}
      {groups.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setActiveGroupId(g.id)}
              className={`px-4 py-2 rounded-lg text-xs font-display transition-colors flex items-center gap-2 ${
                activeGroupId === g.id ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              {g.name}
              <span className="text-[10px] opacity-60">{g.multiplier}x</span>
            </button>
          ))}
        </div>
      )}

      {/* Active group info */}
      {activeGroup && (
        <div className="card flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-display text-sm font-semibold">{activeGroup.name}</span>
            <span className="font-code text-xs text-accent px-2 py-0.5 rounded-full bg-accent/10">{t('admin.pricing.multiplier')}: {activeGroup.multiplier}x</span>
            <div className="flex flex-wrap gap-1">
              {activeGroup.channel_ids.map(cid => (
                <span key={cid} className="text-[10px] px-2 py-0.5 rounded-full bg-bg-tertiary border border-border">{channelName(cid)}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { setEditGroup(activeGroup); setShowGroupModal(true); }} className="p-1.5 rounded hover:bg-accent/10 text-text-secondary hover:text-accent">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => handleDeleteGroup(activeGroup.id)} className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Pricing table */}
      {loading ? (
        <div className="card animate-pulse h-40" />
      ) : groupPricing.length === 0 ? (
        <div className="card text-center text-text-secondary text-sm py-12">{t('admin.pricing.empty')}</div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary font-display">
                <th className="px-4 py-3">{t('admin.pricing.model')}</th>
                <th className="px-4 py-3">{t('admin.pricing.provider')}</th>
                <th className="px-4 py-3 text-right">{t('admin.pricing.inputPrice')}</th>
                <th className="px-4 py-3 text-right">{t('admin.pricing.outputPrice')}</th>
                <th className="px-4 py-3 text-center">{t('admin.pricing.status')}</th>
              </tr>
            </thead>
            <tbody>
              {groupPricing.map(item => (
                <tr key={item.id} className={`border-b border-border/50 ${!item.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-code text-xs">{item.model}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${providerColors[item.provider] || 'text-text-secondary border-border'}`}>
                      {providerLabels[item.provider] || item.provider}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-code text-xs">
                    {multiplier !== 1 && <span className="line-through text-text-secondary mr-1">¥{item.input_price.toFixed(2)}</span>}
                    <span className="text-accent">¥{(item.input_price * multiplier).toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-code text-xs">
                    {multiplier !== 1 && <span className="line-through text-text-secondary mr-1">¥{item.output_price.toFixed(2)}</span>}
                    <span className="text-accent-amber">¥{(item.output_price * multiplier).toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleToggle(item)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${item.is_active ? 'text-success border-success/20 bg-success/5' : 'text-text-secondary border-border bg-bg-tertiary'}`}>
                      {item.is_active ? t('common.active') : t('common.disabled')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {showGroupModal && (
          <GroupModal group={editGroup} channels={channels} onClose={() => setShowGroupModal(false)}
            onSaved={() => { fetchGroups(); setShowGroupModal(false); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function GroupModal({ group, channels, onClose, onSaved }: {
  group: PricingGroupWithChannels | null; channels: Channel[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(group?.name || '');
  const [multiplier, setMultiplier] = useState(String(group?.multiplier ?? 1.0));
  const [selectedChannels, setSelectedChannels] = useState<string[]>(group?.channel_ids || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleChannel = (id: string) => {
    setSelectedChannels(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (group) {
        await adminApi.updateGroup(group.id, { name, multiplier: parseFloat(multiplier) || 1.0, channel_ids: selectedChannels });
      } else {
        await adminApi.createGroup({ name, multiplier: parseFloat(multiplier) || 1.0, channel_ids: selectedChannels });
      }
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="card w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold">{group ? t('admin.pricing.editGroup') : t('admin.pricing.addGroup')}</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.pricing.groupName')}</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder={t('admin.pricing.groupNamePlaceholder')} required />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.pricing.multiplier')}</label>
            <input type="number" step="0.1" min="0.1" value={multiplier} onChange={e => setMultiplier(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.pricing.selectChannels')}</label>
            <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-border p-2 bg-bg-tertiary">
              {channels.filter(c => c.is_active).map(ch => (
                <label key={ch.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-secondary cursor-pointer text-xs">
                  <input type="checkbox" checked={selectedChannels.includes(ch.id)} onChange={() => toggleChannel(ch.id)} className="accent-accent" />
                  <span className="font-display">{ch.name}</span>
                  <span className="text-text-secondary ml-auto font-code text-[10px]">
                    {ch.model_pattern.split(',').filter(Boolean).length} models
                  </span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-danger text-xs">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t('common.loading') : t('common.save')}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
