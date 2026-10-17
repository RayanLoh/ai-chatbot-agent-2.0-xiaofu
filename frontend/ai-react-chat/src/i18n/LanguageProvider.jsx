import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import messages from './messages.json';

export const LANGUAGES = [{ value: 'en', label: 'English' }, { value: 'zh', label: '中文' }, { value: 'ms', label: 'Bahasa Melayu' }];
const valid = (language) => LANGUAGES.some((item) => item.value === language);
export const translate = (language, key, values = {}) => {
  const text = messages[key]?.[language] || messages[key]?.en || String(key ?? '');
  return text.replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
};
const LanguageContext = createContext({ language: 'en', setLanguage: () => {}, t: (key, values) => translate('en', key, values) });
const readLanguage = () => {
  try { const saved = localStorage.getItem('xiaofu_language'); return valid(saved) ? saved : 'en'; }
  catch { return 'en'; }
};
export function LanguageProvider({ children }) {
  const [language, updateLanguage] = useState(readLanguage);
  const setLanguage = useCallback((next) => { if (valid(next)) updateLanguage(next); }, []);
  const t = useCallback((key, values) => translate(language, key, values), [language]);
  useEffect(() => {
    try { localStorage.setItem('xiaofu_language', language); } catch { /* Storage may be unavailable. */ }
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
    document.title = language === 'zh' ? '小芙 Xiaofu · 把想法，聊成可能' : language === 'ms' ? 'Xiaofu · Ubah idea menjadi kenyataan' : 'Xiaofu · A little thought, a new possibility';
  }, [language]);
  useEffect(() => {
    const sync = (event) => { if (event.key === 'xiaofu_language') updateLanguage(valid(event.newValue) ? event.newValue : 'en'); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export const useLanguage = () => useContext(LanguageContext);
