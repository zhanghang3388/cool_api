import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Trash2, Power } from 'lucide-react';
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

export default function AdminTokensPage() {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<RelayToken[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<RelayToken[]>('/admin/tokens');
      setTokens(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (id: string) => {
    await api.patch(`/admin/tokens/${id}`);
    load();
  };

  const deleteToken = async (id: string) => {
    if (!confirm(t('admin.tokens.deleteConfirm'))) return;
    await api.delete(`/admin/tokens/${id}`);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold">{t('admin.tokens.title')}</h1>
        <span className="text-xs text-text-secondary">{t('admin.tokens.total', { count: tokens.length })}</span>
      </div>

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
