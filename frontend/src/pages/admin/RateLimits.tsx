import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, Zap, AlertTriangle, Search, Edit2, Save, X, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { adminApi, type User } from '@/api/admin';

export default function RateLimits() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    withLimits: 0,
    unlimited: 0,
    avgLimit: 0,
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.listUsers(1, 1000);
      setUsers(data.data);
      setFilteredUsers(data.data);

      // Calculate stats
      const withLimits = data.data.filter(u => u.rpm_limit !== null).length;
      const unlimited = data.data.filter(u => u.rpm_limit === null).length;
      const avgLimit = data.data
        .filter(u => u.rpm_limit !== null)
        .reduce((sum, u) => sum + (u.rpm_limit || 0), 0) / (withLimits || 1);

      setStats({
        totalUsers: data.data.length,
        withLimits,
        unlimited,
        avgLimit: Math.round(avgLimit),
      });
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredUsers(users);
    } else {
      const term = searchTerm.toLowerCase();
      setFilteredUsers(
        users.filter(
          u =>
            u.username.toLowerCase().includes(term) ||
            u.email.toLowerCase().includes(term)
        )
      );
    }
  }, [searchTerm, users]);

  const startEdit = (user: User) => {
    setEditingUserId(user.id);
    setEditValue(user.rpm_limit?.toString() || '');
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditValue('');
  };

  const saveEdit = async (userId: string) => {
    setSaving(true);
    try {
      const value = editValue.trim() === '' ? null : parseInt(editValue, 10);
      if (value !== null && (isNaN(value) || value < 0)) {
        alert(t('admin.rateLimits.invalidNumber'));
        return;
      }
      await adminApi.updateUser(userId, { rpm_limit: value });
      await loadUsers();
      setEditingUserId(null);
      setEditValue('');
    } catch (err) {
      console.error('Failed to update rate limit:', err);
      alert(t('admin.rateLimits.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const statCards = [
    {
      key: 'totalUsers',
      icon: Users,
      color: '#00D4FF',
      bg: 'rgba(0, 212, 255, 0.08)',
      value: stats.totalUsers,
      label: t('admin.rateLimits.totalUsers'),
    },
    {
      key: 'withLimits',
      icon: Shield,
      color: '#00E676',
      bg: 'rgba(0, 230, 118, 0.08)',
      value: stats.withLimits,
      label: t('admin.rateLimits.withLimits'),
    },
    {
      key: 'unlimited',
      icon: Zap,
      color: '#FFB800',
      bg: 'rgba(255, 184, 0, 0.08)',
      value: stats.unlimited,
      label: t('admin.rateLimits.unlimited'),
    },
    {
      key: 'avgLimit',
      icon: TrendingUp,
      color: '#B388FF',
      bg: 'rgba(179, 136, 255, 0.08)',
      value: stats.avgLimit,
      label: t('admin.rateLimits.avgLimit'),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-5 h-5 text-accent" />
        <h1 className="text-2xl font-display font-bold">{t('admin.rateLimits.title')}</h1>
      </div>

      {/* Info banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card bg-accent/5 border border-accent/20"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div className="text-xs text-text-secondary space-y-1">
            <p className="font-display font-semibold text-text-primary">{t('admin.rateLimits.infoTitle')}</p>
            <p>{t('admin.rateLimits.infoDesc')}</p>
          </div>
        </div>
      </motion.div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((cfg, i) => {
          const Icon = cfg.icon;
          return (
            <motion.div
              key={cfg.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className="card card-glow group"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                  style={{ background: cfg.bg }}
                >
                  <Icon className="w-4.5 h-4.5" style={{ color: cfg.color }} />
                </div>
              </div>
              <p className="text-2xl font-display font-bold tracking-tight">{cfg.value}</p>
              <p className="text-[10px] text-text-secondary font-display uppercase tracking-wider mt-1">
                {cfg.label}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* User list */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="card"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-sm font-semibold">{t('admin.rateLimits.userRateLimits')}</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder={t('admin.rateLimits.searchPlaceholder')}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-bg-primary/60 border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs font-display text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent/40 w-64"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-text-secondary">
            <p className="text-xs">{t('admin.rateLimits.noUsers')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1.5">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-secondary text-left border-b border-border/50">
                  <th className="pb-3 px-1.5 font-display font-medium text-[10px] uppercase tracking-wider">
                    {t('admin.rateLimits.username')}
                  </th>
                  <th className="pb-3 px-1.5 font-display font-medium text-[10px] uppercase tracking-wider">
                    {t('admin.rateLimits.email')}
                  </th>
                  <th className="pb-3 px-1.5 font-display font-medium text-[10px] uppercase tracking-wider">
                    {t('admin.rateLimits.role')}
                  </th>
                  <th className="pb-3 px-1.5 font-display font-medium text-[10px] uppercase tracking-wider">
                    {t('admin.rateLimits.status')}
                  </th>
                  <th className="pb-3 px-1.5 font-display font-medium text-[10px] uppercase tracking-wider text-right">
                    {t('admin.rateLimits.rpmLimit')}
                  </th>
                  <th className="pb-3 px-1.5 font-display font-medium text-[10px] uppercase tracking-wider text-right">
                    {t('admin.rateLimits.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, i) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + i * 0.02 }}
                    className="glass-row border-b border-border/30 last:border-0"
                  >
                    <td className="py-3 px-1.5 font-code">{user.username}</td>
                    <td className="py-3 px-1.5 text-text-secondary truncate max-w-[200px]">
                      {user.email}
                    </td>
                    <td className="py-3 px-1.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-display font-medium ${
                          user.role === 'admin'
                            ? 'bg-accent/10 text-accent'
                            : 'bg-text-secondary/10 text-text-secondary'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 px-1.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-display font-medium ${
                          user.is_active
                            ? 'bg-success/10 text-success'
                            : 'bg-danger/10 text-danger'
                        }`}
                      >
                        {user.is_active ? t('admin.rateLimits.active') : t('admin.rateLimits.inactive')}
                      </span>
                    </td>
                    <td className="py-3 px-1.5 text-right">
                      {editingUserId === user.id ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          placeholder={t('admin.rateLimits.defaultPlaceholder')}
                          className="bg-bg-primary border border-accent/40 rounded px-2 py-1 text-xs font-code text-right w-24 focus:outline-none focus:border-accent"
                          autoFocus
                        />
                      ) : (
                        <span
                          className={`font-code tabular-nums ${
                            user.rpm_limit === null
                              ? 'text-text-secondary italic'
                              : 'text-text-primary font-semibold'
                          }`}
                        >
                          {user.rpm_limit === null ? t('admin.rateLimits.defaultLimit') : `${user.rpm_limit} ${t('admin.rateLimits.rpmSuffix')}`}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-1.5 text-right">
                      {editingUserId === user.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => saveEdit(user.id)}
                            disabled={saving}
                            className="p-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-50"
                            title={t('admin.rateLimits.save')}
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={saving}
                            className="p-1.5 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
                            title={t('admin.rateLimits.cancel')}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(user)}
                          className="p-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                          title={t('admin.rateLimits.editLimit')}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
