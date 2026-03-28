import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Settings.css";
import {
  Bell,
  BellRing,
  CheckCircle2,
  Cog,
  Database,
  KeyRound,
  Lock,
  MonitorDot,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";
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
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState(false);
  const [islandNotificationsEnabled, setIslandNotificationsEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState("default");
  const [notificationStatus, setNotificationStatus] = useState("Notification center is ready.");
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedDesktopPreference = window.localStorage.getItem("settings.notifications.desktop");
    const savedIslandPreference = window.localStorage.getItem("settings.notifications.island");

    setDesktopNotificationsEnabled(savedDesktopPreference === "true");
    setIslandNotificationsEnabled(savedIslandPreference !== "false");
    setNotificationPermission(window.Notification?.permission || "unsupported");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("settings.notifications.desktop", String(desktopNotificationsEnabled));
  }, [desktopNotificationsEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("settings.notifications.island", String(islandNotificationsEnabled));
  }, [islandNotificationsEnabled]);

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

  const permissionLabel = useMemo(() => {
    if (notificationPermission === "granted") return "Browser notifications allowed";
    if (notificationPermission === "denied") return "Browser notifications blocked";
    if (notificationPermission === "default") return "Browser permission not decided";
    return "Browser notifications not supported";
  }, [notificationPermission]);

  const dispatchDynamicIsland = (payload) => {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(new CustomEvent('xiaofu:dynamic-island', {
      detail: payload,
    }));
  };

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      setDesktopNotificationsEnabled(false);
      setNotificationStatus("This browser does not support desktop notifications.");
      return false;
    }

    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      setDesktopNotificationsEnabled(true);
      setNotificationStatus("Desktop notifications enabled.");
      return true;
    }

    setDesktopNotificationsEnabled(false);
    setNotificationStatus(
      permission === "denied"
        ? "Desktop notifications were denied by the browser."
        : "Desktop notification permission was dismissed.",
    );

    return false;
  };

  const handleDesktopToggle = async () => {
    if (desktopNotificationsEnabled) {
      setDesktopNotificationsEnabled(false);
      setNotificationStatus("Desktop notifications turned off for this app.");
      return;
    }

    if (notificationPermission === "granted") {
      setDesktopNotificationsEnabled(true);
      setNotificationStatus("Desktop notifications enabled.");
      return;
    }

    await requestNotificationPermission();
  };

  const handleIslandToggle = () => {
    setIslandNotificationsEnabled((previous) => {
      const nextValue = !previous;
      setNotificationStatus(nextValue ? "Dynamic Island alerts enabled." : "Dynamic Island alerts paused.");
      return nextValue;
    });
  };

  const handleNotificationTest = async () => {
    const payload = {
      title: "XiaoFu Agent",
      subtitle: "Notification test",
      message: "Your notification settings are active and ready for new replies.",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    let desktopShown = false;

    if (desktopNotificationsEnabled && notificationPermission === "granted" && typeof window !== "undefined" && "Notification" in window) {
      new window.Notification(payload.title, {
        body: payload.message,
        tag: "xiaofu-settings-test",
        renotify: true,
      });
      desktopShown = true;
    }

    if (islandNotificationsEnabled) {
      dispatchDynamicIsland(payload);
    }

    if (desktopShown && islandNotificationsEnabled) {
      setNotificationStatus("Desktop notification and Dynamic Island test sent.");
      return;
    }

    if (desktopShown) {
      setNotificationStatus("Desktop notification test sent.");
      return;
    }

    if (islandNotificationsEnabled) {
      setNotificationStatus("Dynamic Island test animation played.");
      return;
    }

    setNotificationStatus("Enable at least one notification channel before testing.");
  };

  const renderToggle = (isActive, onToggle, label) => (
    <button
      type="button"
      className={`settings-toggle ${isActive ? "active" : "inactive"}`}
      onClick={onToggle}
      role="switch"
      aria-checked={isActive}
      aria-label={label}
    >
      <span className="settings-toggle-thumb" />
    </button>
  );

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
              <div className="notification-hero-card">
                <div>
                  <p className="notification-kicker">Live alerts</p>
                  <h4>Build a notification flow that feels active, not generic.</h4>
                  <p className="notification-description">
                    Use browser notifications for background alerts and the Dynamic Island animation for rich in-app feedback.
                  </p>
                </div>
                <div className="notification-permission-chip">
                  <MonitorDot size={16} />
                  <span>{permissionLabel}</span>
                </div>
              </div>

              <div className="settings-grid-cards">
                <div className="settings-surface-card">
                  <div className="settings-surface-head">
                    <div>
                      <h4>Desktop notification</h4>
                      <p>Send a native browser notification when the app needs attention.</p>
                    </div>
                    {renderToggle(desktopNotificationsEnabled, handleDesktopToggle, "Toggle desktop notifications")}
                  </div>
                  <div className="settings-surface-footer">
                    <button type="button" className="settings-secondary-btn" onClick={requestNotificationPermission}>
                      Request permission
                    </button>
                    <span className="settings-status-inline">{notificationPermission}</span>
                  </div>
                </div>

                <div className="settings-surface-card island-card">
                  <div className="settings-surface-head">
                    <div>
                      <h4>Dynamic Island effect</h4>
                      <p>Animate a compact floating alert at the top of the page for in-app reply cues.</p>
                    </div>
                    {renderToggle(islandNotificationsEnabled, handleIslandToggle, "Toggle Dynamic Island notifications")}
                  </div>
                  <div className="island-preview-mini">
                    <div className="island-preview-pill" />
                    <div className="island-preview-wave wave-one" />
                    <div className="island-preview-wave wave-two" />
                    <Sparkles size={14} />
                    <span>Smooth top-drop animation preview</span>
                  </div>
                </div>
              </div>

              <div className="notification-test-panel">
                <div>
                  <h4>Run a test</h4>
                  <p>Trigger the configured notification channels and confirm the animation appears.</p>
                </div>
                <button type="button" className="settings-primary-btn" onClick={handleNotificationTest}>
                  Test notifications
                </button>
              </div>

              <div className="notification-status-banner">
                <CheckCircle2 size={18} />
                <span>{notificationStatus}</span>
              </div>
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