import React from 'react';
import '../styles/Header.css';
import Profile from './Profile';
import { Sun, Moon } from 'lucide-react';

function Header({ onToggleSidebar, theme, onThemeToggle, user, isLoggedIn, onLogout, onLogin }) {
  return (
    <header className="header">
      {/* 左边：侧边栏按钮 */}
      <button className="menu-btn" onClick={onToggleSidebar}>☰</button>

      {/* 中间：LOGO */}
      <div className="logo">
        <span className="logo-text">rAyAn</span>
        <span className="logo-text-highlight">ChbT</span>
      </div>

      {/* 右边：使用 Profile 组件和主题切换按钮 */}
      <div className="header-controls">
        <button 
          className="theme-btn" 
          onClick={onThemeToggle}
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
        <Profile 
          user={user}
          isLoggedIn={isLoggedIn}
          onLogout={onLogout}
          onLogin={onLogin}
        />
      </div>
    </header>
  );
}

export default Header;