import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus, Trash2, Power, Copy, Check, X } from 'lucide-react';
import axios from 'axios';
import api from '@/api/client';

interface RelayKey {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  group_id: string | null;
  remark: string;
  created_at: string;
}

interface PublicGroup {
  id: string;
  name: string;
  multiplier: number;
  models: string[];
}

export default function ApiKeysPage() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<RelayKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<PublicGroup[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [remark, setRemark] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<RelayKey[]>('/client/keys');
      setKeys(data);
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const { data } = await axios.get<PublicGroup[]>('/v1/groups');
      setGroups(data);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); loadGroups(); }, []);

  const createKey = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post<{ key: RelayKey; full_key: string }>('/client/keys', {
        name: newName.trim(),
        group_id: selectedGroup || null,
        remark: remark.trim() || null,
      });
      setRevealedKey(data.full_key);
      setNewName('');
      setSelectedGroup('');
      setRemark('');
      setShowModal(false);
      load();
    } finally {
      setCreating(false);
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm(t('client.keys.revokeConfirm'))) return;
    await api.delete(`/client/keys/${id}`);
    load();
  };

  const toggleKey = async (id: string) => {
    await api.patch(`/client/keys/${id}`);
    load();
  };

  const copyKey = () => {
    if (revealedKey) {
      navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold">{t('client.keys.title')}</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {t('client.keys.generateNew')}
        </button>
      </div>

      {/* Revealed key banner */}
      {revealedKey && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="card mb-6 p-4 border border-accent/20 bg-accent/5"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-accent-amber font-display">{t('client.keys.copyWarning')}</p>
            <button onClick={() => setRevealedKey(null)} className="text-text-secondary hover:text-text-primary">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-code bg-bg-primary px-3 py-2 rounded break-all">{revealedKey}</code>
            <button onClick={copyKey} className="btn-secondary p-2">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </motion.div>
      )}

      {/* Key list */}
      <div className="space-y-3">
        {loading ? (
          <div className="card animate-pulse h-16" />
        ) : keys.length === 0 ? (
          <div className="card text-center text-text-secondary text-sm py-8">
            {t('client.keys.noKeys')}
          </div>
        ) : (
          keys.map((key, i) => (
            <motion.div
              key={key.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`card card-glow flex items-center justify-between ${!key.is_active ? 'opacity-50' : ''}`}
            >
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-display text-sm font-semibold">{key.name}</span>
                  <span className={`text-xs ${key.is_active ? 'text-success' : 'text-danger'}`}>
                    {key.is_active ? t('common.active') : t('common.disabled')}
                  </span>
                  {key.group_id && groups.find(g => g.id === key.group_id) && (
                    <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px]">
                      {groups.find(g => g.id === key.group_id)!.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-text-secondary">
                  <span className="font-code">{key.key_prefix}</span>
                  {key.remark && <span>{key.remark}</span>}
                  <span>{t('client.keys.created')} {new Date(key.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleKey(key.id)}
                  className="p-2 rounded-lg hover:bg-bg-tertiary text-text-secondary transition-colors"
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

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold">{t('client.keys.generateNew')}</h2>
              <button onClick={() => setShowModal(false)} className="text-text-secondary hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1">{t('client.keys.keyName')}</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="input-field w-full"
                  placeholder={t('client.keys.keyNamePlaceholder')}
                  autoFocus
                />
              </div>
              {groups.length > 0 && (
                <div>
                  <label className="block text-xs text-text-secondary mb-1">{t('client.keys.group')}</label>
                  <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} className="input-field w-full">
                    <option value="">{t('client.keys.noGroup')}</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.multiplier}x)</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-text-secondary mb-1">{t('client.keys.remark')}</label>
                <input
                  value={remark}
                  onChange={e => setRemark(e.target.value)}
                  className="input-field w-full"
                  placeholder={t('client.keys.remarkPlaceholder')}
                />
              </div>
              <button
                onClick={createKey}
                disabled={creating || !newName.trim()}
                className="btn-primary w-full"
              >
                {creating ? t('client.keys.creating') : t('common.create')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
