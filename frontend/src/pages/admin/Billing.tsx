import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { DollarSign } from 'lucide-react';
import { adminApi, type BillingTransaction } from '@/api/admin';

export default function BillingPage() {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [topupUserId, setTopupUserId] = useState('');
  const [topupAmount, setTopupAmount] = useState('');
  const [topupDesc, setTopupDesc] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupMsg, setTopupMsg] = useState('');
  const [topupSuccess, setTopupSuccess] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.listTransactions();
      setTransactions(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    setTopupLoading(true);
    setTopupMsg('');
    setTopupSuccess(false);
    try {
      const amountDollars = parseFloat(topupAmount);
      if (isNaN(amountDollars) || amountDollars <= 0) {
        setTopupMsg('Invalid amount');
        return;
      }
      const microCents = Math.round(amountDollars * 1_000_000);
      await adminApi.topup({
        user_id: topupUserId,
        amount: microCents,
        description: topupDesc || undefined,
      });
      setTopupMsg(t('admin.billing.topupSuccess'));
      setTopupSuccess(true);
      setTopupUserId('');
      setTopupAmount('');
      setTopupDesc('');
      load();
    } catch (err: any) {
      setTopupMsg(err.response?.data?.error?.message || 'Topup failed');
      setTopupSuccess(false);
    } finally {
      setTopupLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-display font-bold mb-6">{t('admin.billing.title')}</h1>

      {/* Topup form */}
      <div className="card mb-6">
        <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-accent-amber" /> {t('admin.billing.topupTitle')}
        </h2>
        <form onSubmit={handleTopup} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.billing.userId')}</label>
            <input value={topupUserId} onChange={e => setTopupUserId(e.target.value)} className="input-field font-code text-xs" placeholder="UUID" required />
          </div>
          <div className="w-32">
            <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.billing.amount')}</label>
            <input type="number" step="0.01" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} className="input-field" placeholder="10.00" required />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs text-text-secondary mb-1 font-display">{t('admin.billing.description')}</label>
            <input value={topupDesc} onChange={e => setTopupDesc(e.target.value)} className="input-field" placeholder="Optional" />
          </div>
          <button type="submit" disabled={topupLoading} className="btn-primary">
            {topupLoading ? t('admin.billing.processing') : t('admin.billing.topup')}
          </button>
        </form>
        {topupMsg && <p className={`text-xs mt-2 ${topupSuccess ? 'text-success' : 'text-danger'}`}>{topupMsg}</p>}
      </div>

      {/* Transaction history */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary font-display">
              <th className="px-4 py-3">{t('admin.billing.type')}</th>
              <th className="px-4 py-3">{t('admin.billing.amountCol')}</th>
              <th className="px-4 py-3">{t('admin.billing.balanceAfter')}</th>
              <th className="px-4 py-3">{t('admin.billing.description')}</th>
              <th className="px-4 py-3">{t('admin.billing.time')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-text-secondary">{t('common.loading')}</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-text-secondary">{t('admin.billing.noTransactions')}</td></tr>
            ) : (
              transactions.map((tx, i) => (
                <motion.tr
                  key={tx.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="glass-row border-b border-border/50"
                >
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      tx.type === 'topup' ? 'bg-success/10 text-success' :
                      tx.type === 'usage' ? 'bg-accent/10 text-accent' :
                      'bg-accent-amber/10 text-accent-amber'
                    }`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-code text-xs ${tx.amount > 0 ? 'text-success' : 'text-danger'}`}>
                    {tx.amount > 0 ? '+' : ''}{(tx.amount / 1_000_000).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 font-code text-xs text-accent-amber">
                    ${(tx.balance_after / 1_000_000).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{tx.description || '-'}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {new Date(tx.created_at).toLocaleString()}
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
