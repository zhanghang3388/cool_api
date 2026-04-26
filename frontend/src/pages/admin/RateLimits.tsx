import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, Zap, AlertTriangle, Search, Edit2, Save, X, TrendingUp, Settings, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { adminApi, type User, type RateLimitConfig } from '@/api/admin';

export default function RateLimits() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [batchValue, setBatchValue] = useState<string>('');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [rateLimitConfig, setRateLimitConfig] = useState<RateLimitConfig | null>(null);
  const [editingConfig, setEditingConfig] = useState(false);
  const [configValues, setConfigValues] = useState({ defaultUserRpm: '', globalRpm: '' });
  const [stats, setStats] = useState({
    totalUsers: 0,
    withLimits: 0,
    unlimited: 0,
    avgLimit: 0,
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, configRes] = await Promise.all([
        adminApi.listUsers(1, 1000),
        adminApi.getRateLimits(),
      ]);

      setUsers(usersRes.data.data);
      setFilteredUsers(usersRes.data.data);
      setRateLimitConfig(configRes.data);

      // Calculate stats
      const withLimits = usersRes.data.data.filter(u => u.rpm_limit !== null).length;
      const unlimited = usersRes.data.data.filter(u => u.rpm_limit === null).length;
      const avgLimit = usersRes.data.data
        .filter(u => u.rpm_limit !== null)
        .reduce((sum, u) => sum + (u.rpm_limit || 0), 0) / (withLimits || 1);

      setStats({
        totalUsers: usersRes.data.data.length,
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

  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUsers);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUsers(newSelection);
  };

  const toggleAllSelection = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const batchUpdateLimits = async () => {
    if (selectedUsers.size === 0) {
      alert(t('admin.rateLimits.noUsersSelected'));
      return;
    }

    setSaving(true);
    try {
      const value = batchValue.trim() === '' ? null : parseInt(batchValue, 10);
      if (value !== null && (isNaN(value) || value < 0)) {
        alert(t('admin.rateLimits.invalidNumber'));
        return;
      }

      await Promise.all(
        Array.from(selectedUsers).map(userId =>
          adminApi.updateUser(userId, { rpm_limit: value })
        )
      );

      await loadUsers();
      setSelectedUsers(new Set());
      setBatchValue('');
      setShowBatchModal(false);
    } catch (err) {
      console.error('Failed to batch update:', err);
      alert(t('admin.rateLimits.batchUpdateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const startEditConfig = () => {
    if (rateLimitConfig) {
      setConfigValues({
        defaultUserRpm: rateLimitConfig.default_user_rpm_limit.toString(),
        globalRpm: rateLimitConfig.global_rpm_limit?.toString() || '',
      });
      setEditingConfig(true);
    }
  };

  const cancelEditConfig = () => {
    setEditingConfig(false);
    setConfigValues({ defaultUserRpm: '', globalRpm: '' });
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const defaultUserRpm = parseInt(configValues.defaultUserRpm, 10);
      const globalRpm = configValues.globalRpm.trim() === '' ? null : parseInt(configValues.globalRpm, 10);

      if (isNaN(defaultUserRpm) || defaultUserRpm < 1) {
        alert(t('admin.rateLimits.invalidDefaultUserRpm'));
        return;
      }

      if (globalRpm !== null && (isNaN(globalRpm) || globalRpm < 1)) {
        alert(t('admin.rateLimits.invalidGlobalRpm'));
        return;
      }

      await adminApi.updateSettings({
        default_user_rpm_limit: defaultUserRpm,
        global_rpm_limit: globalRpm,
      });

      await loadUsers();
      setEditingConfig(false);
    } catch (err) {
      console.error('Failed to update config:', err);
      alert(t('admin.rateLimits.configUpdateFailed'));
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

      {/* Global Config Info */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card bg-gradient-to-br from-accent/5 to-accent/10 border border-accent/20"
      >
        <div className="flex items-start gap-3">
          <Settings className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <p className="font-display font-semibold text-text-primary text-sm">{t('admin.rateLimits.globalConfig')}</p>
              {!editingConfig && (
                <button
                  onClick={startEditConfig}
                  className="px-2 py-1 text-xs font-display bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" />
                  {t('admin.rateLimits.edit')}
                </button>
              )}
            </div>
            {editingConfig ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">
                      {t('admin.rateLimits.defaultUserLimit')}
                    </label>
                    <input
                      type="text"
                      value={configValues.defaultUserRpm}
                      onChange={e => setConfigValues({ ...configValues, defaultUserRpm: e.target.value })}
                      className="w-full bg-bg-primary border border-border rounded px-2 py-1 text-xs font-code focus:outline-none focus:border-accent/40"
                      placeholder="60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1">
                      {t('admin.rateLimits.globalLimit')}
                    </label>
                    <input
                      type="text"
                      value={configValues.globalRpm}
                      onChange={e => setConfigValues({ ...configValues, globalRpm: e.target.value })}
                      className="w-full bg-bg-primary border border-border rounded px-2 py-1 text-xs font-code focus:outline-none focus:border-accent/40"
                      placeholder={t('admin.rateLimits.optional')}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={cancelEditConfig}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs font-display bg-bg-primary text-text-secondary rounded-lg hover:bg-bg-secondary transition-colors disabled:opacity-50"
                  >
                    {t('admin.rateLimits.cancel')}
                  </button>
                  <button
                    onClick={saveConfig}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs font-display bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        {t('admin.rateLimits.saving')}
                      </>
                    ) : (
                      <>
                        <Save className="w-3 h-3" />
                        {t('admin.rateLimits.save')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-text-secondary">{t('admin.rateLimits.defaultUserLimit')}:</span>
                    <span className="font-code font-semibold text-accent">
                      {rateLimitConfig?.default_user_rpm_limit || 60} RPM
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-text-secondary">{t('admin.rateLimits.globalLimit')}:</span>
                    <span className="font-code font-semibold text-accent">
                      {rateLimitConfig?.global_rpm_limit ? `${rateLimitConfig.global_rpm_limit} RPM` : t('admin.rateLimits.notSet')}
                    </span>
                  </div>
                </div>
                <p className="text-text-secondary text-[11px] mt-2">
                  {t('admin.rateLimits.configEditNote')}
                </p>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* Info banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
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
          <div className="flex items-center gap-3">
            <h3 className="font-display text-sm font-semibold">{t('admin.rateLimits.userRateLimits')}</h3>
            {selectedUsers.size > 0 && (
              <span className="text-xs text-accent font-code">
                {t('admin.rateLimits.selectedCount', { count: selectedUsers.size })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedUsers.size > 0 && (
              <button
                onClick={() => setShowBatchModal(true)}
                className="px-3 py-1.5 text-xs font-display bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors flex items-center gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" />
                {t('admin.rateLimits.batchUpdate')}
              </button>
            )}
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
                  <th className="pb-3 px-1.5 font-display font-medium text-[10px] uppercase tracking-wider w-8">
                    <input
                      type="checkbox"
                      checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                      onChange={toggleAllSelection}
                      className="w-3.5 h-3.5 rounded border-border bg-bg-primary checked:bg-accent checked:border-accent cursor-pointer"
                    />
                  </th>
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
                    <td className="py-3 px-1.5">
                      <input
                        type="checkbox"
                        checked={selectedUsers.has(user.id)}
                        onChange={() => toggleUserSelection(user.id)}
                        className="w-3.5 h-3.5 rounded border-border bg-bg-primary checked:bg-accent checked:border-accent cursor-pointer"
                      />
                    </td>
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

      {/* Batch Update Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card max-w-md w-full mx-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-sm">{t('admin.rateLimits.batchUpdate')}</h3>
              <button
                onClick={() => setShowBatchModal(false)}
                className="p-1 rounded-lg hover:bg-bg-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-text-secondary mb-4">
              {t('admin.rateLimits.batchUpdateDesc', { count: selectedUsers.size })}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-display text-text-secondary mb-1.5">
                  {t('admin.rateLimits.newRpmLimit')}
                </label>
                <input
                  type="text"
                  value={batchValue}
                  onChange={e => setBatchValue(e.target.value)}
                  placeholder={t('admin.rateLimits.defaultPlaceholder')}
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-code focus:outline-none focus:border-accent/40"
                  autoFocus
                />
                <p className="text-[10px] text-text-secondary mt-1">
                  {t('admin.rateLimits.batchUpdateHint')}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBatchModal(false)}
                  disabled={saving}
                  className="flex-1 px-3 py-2 text-xs font-display bg-bg-primary text-text-secondary rounded-lg hover:bg-bg-secondary transition-colors disabled:opacity-50"
                >
                  {t('admin.rateLimits.cancel')}
                </button>
                <button
                  onClick={batchUpdateLimits}
                  disabled={saving}
                  className="flex-1 px-3 py-2 text-xs font-display bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      {t('admin.rateLimits.updating')}
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      {t('admin.rateLimits.update')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
