import { Sparkles } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageProvider';

export default function HistoryLoading({ compact = false }) {
  const { t } = useLanguage();
  return <div className={`history-loading ${compact ? 'compact' : ''}`} role="status" aria-live="polite">
    <span className="history-loading-label"><Sparkles size={15} />{t(compact ? '正在找回你的对话…' : 'Loading messages...')}</span>
    <div className="history-skeleton" aria-hidden="true">
      {compact ? [0, 1, 2, 3, 4].map((row) => <div className="history-skeleton-row" key={row}><i /><span /></div>)
        : <><div className="history-skeleton-bubble user"><span /></div>
          <div className="history-skeleton-bubble"><i /><span /><span /><span /></div>
          <div className="history-skeleton-bubble user short"><span /></div></>}
    </div>
  </div>;
}
