import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Shield, ShieldOff, Search } from 'lucide-react';
import { adminApi, type User } from '@/api/admin';

export default function UsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const perPage = 20;

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.listUsers(page, perPage);
      setUsers(data.data);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]);

  const toggleActive = async (user: User) => {
    await adminApi.updateUser(user.id, { is_active: !user.is_active });
    load();
  };

  const filtered = users.filter(
    u => u.username.toLowerCase().includes(search.toLowerCase()) ||
         u.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold">{t('admin.users.title')}</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('admin.users.searchPlaceholder')}
            className="input-field pl-9 w-64"
          />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary font-display">
              <th className="px-4 py-3">{t('admin.users.username')}</th>
              <th className="px-4 py-3">{t('admin.users.email')}</th>
              <th className="px-4 py-3">{t('admin.users.role')}</th>
              <th className="px-4 py-3">{t('admin.users.balance')}</th>
              <th className="px-4 py-3">{t('admin.users.status')}</th>
              <th className="px-4 py-3">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-secondary">{t('common.loading')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-secondary">{t('common.noData')}</td></tr>
            ) : (
              filtered.map((user, i) => (
                <motion.tr
                  key={user.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="glass-row border-b border-border/50"
                >
                  <td className="px-4 py-3 font-code text-xs">{user.username}</td>
                  <td className="px-4 py-3 text-text-secondary">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      user.role === 'admin' ? 'bg-accent-amber/10 text-accent-amber' : 'bg-accent/10 text-accent'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-code text-xs text-accent-amber">
                    ${(user.balance / 1_000_000).toFixed(4)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${user.is_active ? 'text-success' : 'text-danger'}`}>
                      {user.is_active ? t('common.active') : t('common.disabled')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(user)}
                      className="text-xs text-text-secondary hover:text-text-primary transition-colors"
                      title={user.is_active ? t('common.disabled') : t('common.active')}
                    >
                      {user.is_active ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </button>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary text-xs disabled:opacity-30"
          >
            {t('common.prev')}
          </button>
          <span className="text-xs text-text-secondary font-code">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-secondary text-xs disabled:opacity-30"
          >
            {t('common.next')}
          </button>
        </div>
      )}
    </div>
  );
}
