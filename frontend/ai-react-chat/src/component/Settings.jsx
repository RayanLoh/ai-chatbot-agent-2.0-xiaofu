import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Settings.css";
import { Cog, Bell, User, Shield, Database, Lock, Users, KeyRound, X } from "lucide-react";
import Footer from "./Footer";

const menuItems = [
  { id: "general", label: "general", icon: <Cog size={18} /> },
  { id: "notifications", label: "notifications", icon: <Bell size={18} /> },
  { id: "personalization", label: "personalization", icon: <User size={18} /> },
  { id: "apps", label: "apps", icon: <Database size={18} /> },
  { id: "security", label: "security", icon: <Lock size={18} /> },
  { id: "family", label: "family", icon: <Users size={18} /> },
  { id: "account", label: "account", icon: <KeyRound size={18} /> },
];

function Settings({ theme, onThemeChange }) {
  const [selected, setSelected] = useState("general");
  const navigate = useNavigate();

  // 计算实际应用的主题（处理 system）
  const getEffectiveTheme = () => {
    if (theme === "system") {
      if (typeof window !== 'undefined') {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      return "light";
    }
    return theme;
  };

  const effectiveTheme = getEffectiveTheme();

  return (
    <div className={`settings-page-container ${effectiveTheme}-theme`} style={{ background: "var(--bg-primary)", minHeight: "100vh" }}>
      <button className="close-settings-btn" onClick={() => navigate("/")}>
        <X size={28} />
      </button>
      <div className="settings-container">
        <aside className="settings-sidebar">
          <h2 className="sidebar-title">settings</h2>
          <ul>
            {menuItems.map((item) => (
              <li
                key={item.id}
                className={selected === item.id ? "active" : ""}
                onClick={() => setSelected(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </aside>

        <main className="settings-content">
          {selected === "general" && (
            <div className="settings-section">
              <h3>General</h3>
              <div className="setting-item">
                <label>Appearance</label>
                <select value={theme} onChange={(e) => onThemeChange(e.target.value)}>
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
              <div className="setting-item">
                <label>Language</label>
                <select>
                  <option>Auto Detect</option>
                  <option>Chinese</option>
                  <option>English</option>
                </select>
              </div>
            </div>
          )}
          {selected === "notifications" && (
            <div className="settings-section">
              <h3>Notifications</h3>
              <p>Here you can set your notification preferences.</p>
            </div>
          )}
          {selected === "security" && (
            <div className="settings-section">
              <h3>Security</h3>
              <p>Enable two-factor authentication or change your password.</p>
            </div>
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}

export default Settings;