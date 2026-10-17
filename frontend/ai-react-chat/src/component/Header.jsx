import { useLanguage } from '../i18n/LanguageProvider';
import { Menu, Sun, Moon } from 'lucide-react';
import xiaofuAvatar from '../assets/樱桃少女漫画版014.png';
import Profile from './Profile';
import LanguageSwitcher from './LanguageSwitcher';
import '../styles/Header.css';

export default function Header({ onToggleSidebar, theme, onThemeToggle, user, isLoggedIn, onLogout, onLogin, sidebarOpen }) {
  const { t, language } = useLanguage();
  return <header className="header">
    <div className="header-brand">
      <button className="menu-btn" onClick={onToggleSidebar} aria-label={t("切换会话侧栏")} aria-expanded={sidebarOpen}><Menu size={19} /></button>
      <a className="logo" href="/" aria-label={t("小芙首页")}><span className="brand-symbol brand-avatar"><img src={xiaofuAvatar} alt={language === 'zh' ? '小芙' : 'Xiaofu'} /></span><span>{language === 'zh' ? '小芙' : 'Xiaofu'}<span className="brand-english">{language === 'zh' ? 'xiaofu' : '小芙'}</span></span></a>
    </div>
    <span className="header-caption">{t("留一点空间，给新的灵感。")}</span>
    <div className="header-controls">
      <LanguageSwitcher compact />
      <span className="workspace-badge">{t("PERSONAL SPACE")}</span>
      <button className="theme-btn" onClick={onThemeToggle} aria-label={t("切换明暗主题")} title={t("切换明暗主题")}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
      <Profile user={user} isLoggedIn={isLoggedIn} onLogout={onLogout} onLogin={onLogin} />
    </div>
  </header>;
}
