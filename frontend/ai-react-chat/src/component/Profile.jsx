import { useLanguage } from '../i18n/LanguageProvider';
import { useEffect, useRef, useState } from 'react';
import { LogOut, Settings, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '../styles/Profile.css';

export default function Profile({ user, isLoggedIn, onLogout, onLogin }) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    const dismiss = (event) => {
      if (event.type === 'keydown' && event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      if (event.type === 'pointerdown' && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss); };
  }, []);
  return <div className="profile" ref={root}>
    {isLoggedIn ? <>
      <button className="profile-trigger" ref={trigger} aria-label={t("打开账户菜单")} aria-expanded={open} onClick={() => setOpen(!open)}>
        <img src={user?.picture || user?.avatar_url || '/default-avatar.svg'} className="profile-icon" alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = '/default-avatar.svg'; }} /><ChevronDown size={12} />
      </button>
      {open && <div className="dropdown-menu"><p>{user?.name || t('我的账户')}</p>
        <button onClick={() => { setOpen(false); navigate('/settings'); }}><Settings size={15} />{t("偏好设置")}</button>
        <button onClick={() => { setOpen(false); onLogout(); }}><LogOut size={15} />{t("退出登录")}</button>
      </div>}
    </> : <button className="login-btn" onClick={onLogin}>{t("登录 / 开始")}</button>}
  </div>;
}
