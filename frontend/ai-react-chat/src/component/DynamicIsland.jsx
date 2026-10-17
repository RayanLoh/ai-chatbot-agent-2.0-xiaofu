import { useLanguage } from '../i18n/LanguageProvider';
import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';

export default function DynamicIsland() {
  const { t, language } = useLanguage();
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    let timer;
    const show = (event) => {
      if (localStorage.getItem('settings.notifications.island') === 'false') return;
      clearTimeout(timer);
      setNotice(event.detail);
      timer = setTimeout(() => setNotice(null), 5000);
    };
    window.addEventListener('xiaofu:dynamic-island', show);
    return () => { clearTimeout(timer); window.removeEventListener('xiaofu:dynamic-island', show); };
  }, []);
  if (!notice) return null;
  return <div className="workspace-toast" role="status"><span className="toast-symbol"><Bell size={17} /></span>
    <div><strong>{t(notice.title)}</strong><p>{t(notice.message)}</p></div>
    <button aria-label={t("关闭通知")} onClick={() => setNotice(null)}><X size={14} /></button>
  </div>;
}
