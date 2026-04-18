import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import api from '@/api/client';

interface BillingOverview {
  balance: number;
  transactions: Transaction[];
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

export default function ClientBilling() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<BillingOverview>('/client/billing').then(({ data }) => {
      setOverview(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="card animate-pulse h-40" />;
  if (!overview) return null;

  return (
    <div>
      <h1 className="text-2xl font-display font-bold mb-6">{t('client.billing.title')}</h1>

      <div className="card card-glow mb-6">
        <p className="text-xs text-text-secondary font-display mb-1">{t('client.billing.currentBalance')}</p>
        <p className="text-4xl font-display font-bold text-accent-amber">
          ${(overview.balance / 1_000_000).toFixed(4)}
        </p>
      </div>

      <h2 className="font-display text-sm font-semibold mb-3 text-text-secondary">{t('client.billing.recentTransactions')}</h2>
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary font-display">
              <th className="px-4 py-3">{t('client.billing.type')}</th>
              <th className="px-4 py-3">{t('client.billing.amount')}</th>
              <th className="px-4 py-3">{t('client.billing.balance')}</th>
              <th className="px-4 py-3">{t('client.billing.description')}</th>
              <th className="px-4 py-3">{t('client.billing.time')}</th>
            </tr>
          </thead>
          <tbody>
            {overview.transactions.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-text-secondary">{t('client.billing.noTransactions')}</td></tr>
            ) : (
              overview.transactions.map((tx, i) => (
                <motion.tr
                  key={tx.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="glass-row border-b border-border/50"
                >
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      tx.type === 'topup' ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent'
                    }`}>{tx.type}</span>
                  </td>
                  <td className={`px-4 py-3 font-code text-xs ${tx.amount > 0 ? 'text-success' : 'text-danger'}`}>
                    {tx.amount > 0 ? '+' : ''}{(tx.amount / 1_000_000).toFixed(6)}
                  </td>
                  <td className="px-4 py-3 font-code text-xs text-accent-amber">
                    ${(tx.balance_after / 1_000_000).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{tx.description || '-'}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{new Date(tx.created_at).toLocaleString()}</td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
