import React, { useState, useEffect, useRef } from "react";
import { MoreVertical } from "lucide-react";
import "../styles/Profile.css";
import { useNavigate } from "react-router-dom";

function Profile({ user, isLoggedIn, onLogout, onLogin }) {
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogoutClick = () => {
    onLogout();
    setMenuOpen(false);
  };

  // 获取用户头像，优先级：picture > avatar_url
  const getUserAvatar = () => {
    if (!user) {
      console.warn("No user data");
      return "/default-avatar.svg";
    }
    
    const avatar = user.picture || user.avatar_url;
    console.log("Getting avatar for user:", {
      name: user.name,
      hasPicture: !!user.picture,
      hasAvatarUrl: !!user.avatar_url,
      selectedAvatar: avatar,
    });
    
    return avatar || "/default-avatar.svg";
  };
  
  return (
    <div className="profile" ref={menuRef}>
      {isLoggedIn ? (
        <>
          <img
            src={getUserAvatar()}
            alt="profile"
            className="profile-icon"
            onClick={() => setMenuOpen(!menuOpen)}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onLoad={(e) => {
              console.log("✅ Avatar image loaded successfully:", e.target.src);
            }}
            onError={(e) => {
              console.warn("❌ Avatar image failed to load:", e.target.src);
              console.warn("Error details:", e);
              // 使用 SVG 数据 URI 作为备用
              e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23e0e0e0'/%3E%3Ccircle cx='50' cy='35' r='15' fill='%23999'/%3E%3Cpath d='M 20 80 Q 20 60 50 60 Q 80 60 80 80' fill='%23999'/%3E%3C/svg%3E";
            }}
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
              <button onClick={handleLogoutClick}>Logout</button>
            </div>
          )}
        </>
      ) : (
        <button className="login-btn" onClick={onLogin}>
          Login
        </button>
      )}
    </div>
  );
}

export default Profile;