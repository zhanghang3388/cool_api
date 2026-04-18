import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Save } from 'lucide-react';

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
  claude: 'text-accent-amber border-accent-amber/20 bg-accent-amber/5',
  gemini: 'text-accent border-accent/20 bg-accent/5',
};

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
};

export default function PricingPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchMultiplier, setBatchMultiplier] = useState('1.0');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ multiplier: '', is_active: true });

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchPricing = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/pricing', { headers });
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchPricing(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult('');
    try {
      const res = await fetch('/api/admin/pricing/sync', { method: 'POST', headers });
      const data = await res.json();
      setSyncResult(t('admin.pricing.syncResult', { added: data.added, updated: data.updated, total: data.total }));
      fetchPricing();
    } catch { setSyncResult('Error'); }
    setSyncing(false);
  };

  const handleToggle = async (item: PricingItem) => {
    await fetch(`/api/admin/pricing/${item.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ is_active: !item.is_active }),
    });
    fetchPricing();
  };

  const handleSaveEdit = async (id: string) => {
    await fetch(`/api/admin/pricing/${id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({
        multiplier: parseFloat(editValues.multiplier) || 1.0,
        is_active: editValues.is_active,
      }),
    });
    setEditingId(null);
    fetchPricing();
  };

  const handleBatchMultiplier = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    await fetch('/api/admin/pricing/batch-multiplier', {
      method: 'PATCH', headers,
      body: JSON.stringify({ ids, multiplier: parseFloat(batchMultiplier) || 1.0 }),
    });
    setSelected(new Set());
    fetchPricing();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('admin.pricing.deleteConfirm'))) return;
    await fetch(`/api/admin/pricing/${id}`, { method: 'DELETE', headers });
    fetchPricing();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map(i => i.id)));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-display">{t('admin.pricing.title')}</h1>
        <div className="flex items-center gap-3">
          {syncResult && <span className="text-xs text-success">{syncResult}</span>}
          <button onClick={handleSync} disabled={syncing} className="btn-primary text-xs flex items-center gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? t('admin.pricing.syncing') : t('admin.pricing.syncBtn')}
          </button>
        </div>
      </div>

      {/* Batch multiplier */}
      {selected.size > 0 && (
        <div className="card flex items-center gap-4">
          <span className="text-sm text-text-secondary">
            {t('admin.pricing.selectedCount', { count: selected.size })}
          </span>
          <input
            type="number" step="0.1" min="0.1"
            value={batchMultiplier}
            onChange={e => setBatchMultiplier(e.target.value)}
            className="input w-24 text-sm"
          />
          <button onClick={handleBatchMultiplier} className="btn-primary text-xs flex items-center gap-1">
            <Save className="w-3.5 h-3.5" />
            {t('admin.pricing.batchSet')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="card animate-pulse h-40" />
      ) : items.length === 0 ? (
        <div className="card text-center text-text-secondary text-sm py-12">
          {t('admin.pricing.empty')}
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary font-display">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={selected.size === items.length} onChange={toggleAll} className="accent-accent" />
                </th>
                <th className="px-4 py-3">{t('admin.pricing.model')}</th>
                <th className="px-4 py-3">{t('admin.pricing.provider')}</th>
                <th className="px-4 py-3 text-right">{t('admin.pricing.inputPrice')}</th>
                <th className="px-4 py-3 text-right">{t('admin.pricing.outputPrice')}</th>
                <th className="px-4 py-3 text-center">{t('admin.pricing.multiplier')}</th>
                <th className="px-4 py-3 text-right">{t('admin.pricing.effectiveInput')}</th>
                <th className="px-4 py-3 text-right">{t('admin.pricing.effectiveOutput')}</th>
                <th className="px-4 py-3 text-center">{t('admin.pricing.status')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className={`border-b border-border/50 ${!item.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} className="accent-accent" />
                  </td>
                  <td className="px-4 py-3 font-code text-xs">{item.model}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${providerColors[item.provider] || 'text-text-secondary border-border'}`}>
                      {providerLabels[item.provider] || item.provider}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-code text-xs">${item.input_price.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-code text-xs">${item.output_price.toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    {editingId === item.id ? (
                      <input
                        type="number" step="0.1" min="0.1"
                        value={editValues.multiplier}
                        onChange={e => setEditValues({ ...editValues, multiplier: e.target.value })}
                        className="input w-20 text-xs text-center"
                      />
                    ) : (
                      <span className="font-code text-xs text-accent">{item.multiplier}x</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-code text-xs text-accent">
                    ${(item.input_price * item.multiplier).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-code text-xs text-accent-amber">
                    ${(item.output_price * item.multiplier).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggle(item)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        item.is_active ? 'text-success border-success/20 bg-success/5' : 'text-text-secondary border-border bg-bg-tertiary'
                      }`}
                    >
                      {item.is_active ? t('common.active') : t('common.disabled')}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {editingId === item.id ? (
                        <>
                          <button onClick={() => handleSaveEdit(item.id)} className="text-xs text-success hover:underline">{t('common.save')}</button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-text-secondary hover:underline">{t('common.cancel')}</button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditingId(item.id); setEditValues({ multiplier: String(item.multiplier), is_active: item.is_active }); }}
                            className="text-xs text-accent hover:underline"
                          >{t('common.edit')}</button>
                          <button onClick={() => handleDelete(item.id)} className="text-xs text-danger hover:underline">{t('common.delete')}</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
