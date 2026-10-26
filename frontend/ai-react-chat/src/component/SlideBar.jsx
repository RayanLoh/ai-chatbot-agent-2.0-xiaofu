import { useLanguage } from '../i18n/LanguageProvider';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import DeleteConfirmModal from './DeleteConfirmModal';
import HistoryLoading from './HistoryLoading';
import '../styles/SlideBar.css';

export default function SlideBar({
  conversations, isLoading, error, onRetry, onSelectConversation, onDeleteConversation, onNewChat,
  onUpdateTitle, currentConversationId, isOpen,
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState('');
  const [pending, setPending] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const filtered = conversations.filter((item) => (item.title || '新对话').toLowerCase().includes(search.toLowerCase()));
  const save = async (id) => { setEditing(null); if (title.trim()) await onUpdateTitle(id, title); };
  return <>
    <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`} aria-label={t("会话列表")} inert={!isOpen ? true : undefined}>
      <div className="sidebar-top">
        <button className="new-chat-btn" onClick={onNewChat}><Plus size={18} /><span>{t("开启新对话")}</span></button>
        <label className="search-box"><Search size={16} /><input aria-label={t("搜索对话")} placeholder={t("搜索") } value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      <div className="history-heading"><span>{t("最近对话")}</span>{isLoading && conversations.length > 0 && <span className="history-refresh-dot" role="status" aria-label={t('正在找回你的对话…')} />}</div>
      <div className="conversation-list" aria-busy={isLoading}>
        {isLoading && !conversations.length ? <HistoryLoading compact />
          : error ? <div className="sidebar-empty"><p>{t("暂时连接不上对话")}</p><button className="retry-history" onClick={onRetry}>{t("重新连接")}</button></div>
          : !filtered.length ? <div className="sidebar-empty"><p>{search ? t("暂时没有找到") : t("暂无对话")}</p></div>
          : filtered.map((item) => <div key={item.id} className={`conversation-item ${item.id === currentConversationId ? 'active' : ''}`}>
            <MessageCircle className="conversation-symbol" size={16} />
            {editing === item.id ? <input className="title-editor" aria-label={t("修改对话标题")} value={title} autoFocus maxLength={200}
              onChange={(event) => setTitle(event.target.value)} onBlur={() => save(item.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
                if (event.key === 'Escape') { event.preventDefault(); setEditing(null); }
              }} />
              : <button className="conversation-content" onClick={() => onSelectConversation(item.id)} aria-current={item.id === currentConversationId ? 'page' : undefined}>
                <span className="conversation-title">{item.title || t('新对话')}</span>
              </button>}
            <div className="conversation-actions">
              <button aria-label={`${t('重命名')} ${item.title || t('新对话')}`} className="edit-btn" onClick={() => { setEditing(item.id); setTitle(item.title || ''); }}><Pencil size={13} /></button>
              <button aria-label={`${t('删除')} ${item.title || t('新对话')}`} className="delete-btn" onClick={() => setPending(item)}><Trash2 size={13} /></button>
            </div>
          </div>)}
      </div>
      <div className="sidebar-bottom">
        <Link className="sidebar-settings" to="/settings"><span>{t("偏好设置")}</span></Link>
      </div>
    </aside>
    <DeleteConfirmModal isOpen={Boolean(pending)} conversationTitle={pending?.title || '新对话'} isDeleting={deleting}
      onCancel={() => { if (!deleting) setPending(null); }} onConfirm={async () => {
        if (!pending) return;
        setDeleting(true);
        try { await onDeleteConversation(pending.id); setPending(null); } finally { setDeleting(false); }
      }} />
  </>;
}
