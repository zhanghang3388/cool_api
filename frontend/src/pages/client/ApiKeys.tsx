import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus, Trash2, Power, Copy, Check } from 'lucide-react';
import api from '@/api/client';

interface RelayKey {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  created_at: string;
}

interface CreateKeyResponse {
  key: RelayKey;
  full_key: string;
}

export default function ApiKeysPage() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<RelayKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
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

  useEffect(() => { load(); }, []);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post<CreateKeyResponse>('/client/keys', { name: newKeyName });
      setRevealedKey(data.full_key);
      setNewKeyName('');
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
      <h1 className="text-2xl font-display font-bold mb-6">{t('client.keys.title')}</h1>

      {/* Create key */}
      <div className="card mb-6">
        <h2 className="font-display text-sm font-semibold mb-3">{t('client.keys.generateNew')}</h2>
        <div className="flex gap-3">
          <input
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            className="input-field flex-1"
            placeholder={t('client.keys.keyNamePlaceholder')}
            onKeyDown={e => e.key === 'Enter' && createKey()}
          />
          <button onClick={createKey} disabled={creating || !newKeyName.trim()} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> {creating ? t('client.keys.creating') : t('common.create')}
          </button>
        </div>

        {/* Revealed key */}
        {revealedKey && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 p-3 rounded-lg bg-accent/5 border border-accent/20"
          >
            <p className="text-xs text-accent-amber mb-2 font-display">
              {t('client.keys.copyWarning')}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-code bg-bg-primary px-3 py-2 rounded break-all">
                {revealedKey}
              </code>
              <button onClick={copyKey} className="btn-secondary p-2">
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </motion.div>
        )}
      </div>

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
              className="card card-glow flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-display text-sm font-semibold">{key.name}</span>
                  <span className={`text-xs ${key.is_active ? 'text-success' : 'text-danger'}`}>
                    {key.is_active ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-secondary">
                  <span className="font-code">{key.key_prefix}</span>
                  <span>{t('client.keys.created')} {new Date(key.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleKey(key.id)}
                  className="p-2 rounded-lg hover:bg-bg-tertiary text-text-secondary transition-colors"
                  title={key.is_active ? 'Disable' : 'Enable'}
                >
                  <Power className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteKey(key.id)}
                  className="p-2 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors"
                  title="Revoke"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
