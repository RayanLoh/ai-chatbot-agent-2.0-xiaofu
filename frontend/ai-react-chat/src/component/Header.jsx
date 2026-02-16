import React from 'react';
import '../styles/Header.css';
import Profile from './Profile';

function Header({ onToggleSidebar, theme, onThemeToggle }) {
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
          title={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <Profile />
      </div>
    </header>
  );
}

export default Header;