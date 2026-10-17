import { Globe2 } from 'lucide-react';
import { LANGUAGES, useLanguage } from '../i18n/LanguageProvider';

export default function LanguageSwitcher({ compact = false }) {
  const { language, setLanguage, t } = useLanguage();
  return <label className={`language-switcher ${compact ? 'compact' : ''}`}>
    <Globe2 size={15} aria-hidden="true" />
    <select aria-label={t('界面语言')} value={language} onChange={(event) => setLanguage(event.target.value)}>
      {LANGUAGES.map((item) => <option key={item.value} value={item.value}>{compact ? { en: 'EN', zh: '中文', ms: 'BM' }[item.value] : item.label}</option>)}
    </select>
  </label>;
}
