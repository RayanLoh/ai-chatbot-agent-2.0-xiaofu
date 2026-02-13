import React, { useState, useEffect, useRef } from "react";
import { MoreVertical } from "lucide-react";
import { jwtDecode } from "jwt-decode";
import LoginModal from "./LoginModal";
import "../styles/Profile.css";
import { useNavigate } from "react-router-dom";

function Profile() {
  const navigate = useNavigate(); // ✅ 移到最上面（所有 Hook 前）

  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const menuRef = useRef(null);

  // 确保只在客户端执行 localStorage 读取
  useEffect(() => {
    setIsClient(true);
    const token = localStorage.getItem("auth_token");
    if (token) {
      try {
        const decoded = jwtDecode(token);
        setUser(decoded);
        setIsLoggedIn(true);
      } catch (e) {
        console.error("Invalid token:", e);
        localStorage.removeItem("auth_token");
      }
    }
  }, []);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    setIsLoggedIn(false);
    setUser(null);
    setMenuOpen(false);
  };

  // ✅ 这一行放到 Hooks 之后才 return
  if (!isClient) return null;

  return (
    <div className="profile" ref={menuRef}>
      {isLoggedIn ? (
        <>
          <img
            src={user?.picture || "/default-avatar.png"}
            alt="profile"
            className="profile-icon"
            onClick={() => setMenuOpen(!menuOpen)}
          />
          <MoreVertical
            className="menu-dots"
            size={22}
            onClick={() => setMenuOpen(!menuOpen)}
          />
          {menuOpen && (
            <div className="dropdown-menu">
              <p style={{ margin: "5px 0", fontWeight: "bold" }}>{user?.name}</p>
              <button onClick={() => navigate("/settings")}>Settings</button>
              <button onClick={handleLogout}>Logout</button>
            </div>
          )}
        </>
      ) : (
        <button className="login-btn" onClick={() => setShowLoginModal(true)}>
          Login
        </button>
      )}

      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onLoginSuccess={(decoded, token) => {
            localStorage.setItem("auth_token", token);
            setUser(decoded);
            setIsLoggedIn(true);
            setShowLoginModal(false);
          }}
        />
      )}
    </div>
  );
}

export default Profile;