import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

export default function LangSwitch() {
  const { i18n } = useTranslation();

  const toggle = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
      title="Switch language"
    >
      <Globe className="w-3.5 h-3.5" />
      {i18n.language === 'zh' ? 'EN' : '中文'}
    </button>
  );
}
