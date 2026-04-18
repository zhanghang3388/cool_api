import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Save } from 'lucide-react';
import { adminApi } from '@/api/admin';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data } = await adminApi.getSettings();
        const map: Record<string, string> = {};
        for (const [key, value] of data) {
          map[key] = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        }
        setSettings(map);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const parsed: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(settings)) {
        try {
          parsed[key] = JSON.parse(value);
        } catch {
          parsed[key] = value;
        }
      }
      await adminApi.updateSettings(parsed);
      setMsg('Settings saved');
    } catch {
      setMsg('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateKey = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const addKey = () => {
    const key = prompt('Setting key:');
    if (key && !settings[key]) {
      setSettings(prev => ({ ...prev, [key]: '' }));
    }
  };

  if (loading) return <div className="card animate-pulse h-40" />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold">System Settings</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs text-success">{msg}</span>}
          <button onClick={addKey} className="btn-secondary text-xs">Add Key</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {Object.entries(settings).map(([key, value], i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="card"
          >
            <label className="block text-xs text-accent font-code mb-2">{key}</label>
            <textarea
              value={value}
              onChange={e => updateKey(key, e.target.value)}
              className="input-field font-code text-xs min-h-[60px] resize-y"
              rows={value.split('\n').length}
            />
          </motion.div>
        ))}
        {Object.keys(settings).length === 0 && (
          <div className="card text-center text-text-secondary text-sm py-8">
            No settings configured. Click "Add Key" to create one.
          </div>
        )}
      </div>
    </div>
  );
}
