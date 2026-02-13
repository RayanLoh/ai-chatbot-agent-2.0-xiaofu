import React from 'react';
import '../styles/Header.css';
import Profile from './Profile';

function Header({ onToggleSidebar, onShowApiModal }) {
  return (
    <header className="header">
      {/* 左边：侧边栏按钮 */}
      <button className="menu-btn" onClick={onToggleSidebar}>☰</button>

      {/* 中间：LOGO */}
      <div className="logo">
        <span className="logo-text">rAyAn</span>
        <span className="logo-text-highlight">ChbT</span>
      </div>

      {/* 右边：使用 Profile 组件和 ngrok 按钮 */}
      <div className="header-controls">
        {onShowApiModal && (
          <button className="ngrok-btn" onClick={onShowApiModal} title="更换 ngrok">
            ⚙️
          </button>
        )}
        <Profile />
      </div>
    </header>
  );
}

export default Header;