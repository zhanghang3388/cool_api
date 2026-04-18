import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus, Trash2, Power, Copy, Check } from 'lucide-react';
import api from '@/api/client';

interface RelayToken {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  group_id: string | null;
  created_at: string;
}

interface PublicGroup {
  id: string;
  name: string;
  multiplier: number;
  models: string[];
}

export default function AdminTokensPage() {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<RelayToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<PublicGroup[]>([]);

  // create form
  const [userId, setUserId] = useState('');
  const [newName, setNewName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<RelayToken[]>('/admin/tokens');
      setTokens(data);
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const { data } = await api.get<PublicGroup[]>('/v1/groups');
      setGroups(data);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); loadGroups(); }, []);

  const createToken = async () => {
    if (!userId.trim() || !newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post<{ key: RelayToken; full_key: string }>('/admin/tokens', {
        user_id: userId.trim(),
        name: newName.trim(),
        group_id: selectedGroup || null,
      });
      setRevealedKey(data.full_key);
      setNewName('');
      setUserId('');
      load();
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string) => {
    await api.patch(`/admin/tokens/${id}`);
    load();
  };

  const deleteToken = async (id: string) => {
    if (!confirm(t('admin.tokens.deleteConfirm'))) return;
    await api.delete(`/admin/tokens/${id}`);
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
        <h1 className="text-2xl font-display font-bold">{t('admin.tokens.title')}</h1>
        <span className="text-xs text-text-secondary">{t('admin.tokens.total', { count: tokens.length })}</span>
      </div>

      {/* Create token */}
      <div className="card mb-6">
        <h2 className="font-display text-sm font-semibold mb-3">{t('admin.tokens.createToken')}</h2>
        <div className="flex gap-3 flex-wrap">
          <input
            value={userId}
            onChange={e => setUserId(e.target.value)}
            className="input-field flex-1 min-w-[200px]"
            placeholder={t('admin.tokens.userIdPlaceholder')}
          />
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="input-field flex-1 min-w-[160px]"
            placeholder={t('admin.tokens.namePlaceholder')}
            onKeyDown={e => e.key === 'Enter' && createToken()}
          />
          {groups.length > 0 && (
            <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} className="input-field w-40">
              <option value="">{t('admin.tokens.noGroup')}</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name} ({g.multiplier}x)</option>
              ))}
            </select>
          )}
          <button onClick={createToken} disabled={creating || !userId.trim() || !newName.trim()} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> {creating ? t('admin.tokens.creating') : t('common.create')}
          </button>
        </div>

        {revealedKey && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 p-3 rounded-lg bg-accent/5 border border-accent/20"
          >
            <p className="text-xs text-accent-amber mb-2 font-display">
              {t('admin.tokens.copyWarning')}
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

      {/* Token list */}
      <div className="space-y-3">
        {loading ? (
          <div className="card animate-pulse h-20" />
        ) : tokens.length === 0 ? (
          <div className="card text-center text-text-secondary text-sm py-8">{t('admin.tokens.noTokens')}</div>
        ) : (
          tokens.map((token, i) => (
            <motion.div
              key={token.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`card card-glow flex items-center justify-between ${!token.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-display text-sm font-semibold">{token.name}</span>
                  <span className={`text-xs ${token.is_active ? 'text-success' : 'text-danger'}`}>
                    {token.is_active ? t('common.active') : t('common.disabled')}
                  </span>
                  {token.group_id && groups.find(g => g.id === token.group_id) && (
                    <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px]">
                      {groups.find(g => g.id === token.group_id)!.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-text-secondary">
                  <span className="font-code">{token.key_prefix}</span>
                  <span>User: {token.user_id.slice(0, 8)}...</span>
                  <span>{new Date(token.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => toggleActive(token.id)}
                  className="p-2 rounded-lg hover:bg-bg-tertiary text-text-secondary transition-colors"
                >
                  <Power className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteToken(token.id)}
                  className="p-2 rounded-lg hover:bg-danger/10 text-text-secondary hover:text-danger transition-colors"
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
