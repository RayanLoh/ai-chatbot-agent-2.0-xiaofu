import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { jwtDecode } from "jwt-decode";
import { buildGitHubAuthUrl, handleGitHubCallback } from "../utils/githubOAuth";
import "../styles/LoginModal.css";

function LoginModal({ onClose, onLoginSuccess }) {
  const [isClient, setIsClient] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => setIsClient(true), []);

  // Google 登录初始化
  useEffect(() => {
    if (!isClient || !window.google || !window.google.accounts) return;

    try {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        // 🟢 关键：禁用 FedCM 自动弹窗，改用显式按钮点击
        use_fedcm_for_prompt: false, 
        callback: async (response) => {
          setIsGoogleLoading(true);
          try {
            const decoded = jwtDecode(response.credential);
            const userData = {
              sub: decoded.sub,
              email: decoded.email,
              name: decoded.name,
              picture: decoded.picture || null,
            };
            onLoginSuccess(userData, response.credential);
          } catch (error) {
            console.error("JWT Decode error:", error);
            setIsGoogleLoading(false);
          }
        },
      });

      // 🟢 关键：将官方按钮渲染到隐形容器中
      // 这会绕过 prompt() 被浏览器封锁的问题
      window.google.accounts.id.renderButton(
        document.getElementById("google-login-button-container"),
        { 
          theme: "outline", 
          size: "large", 
          width: 380, // 对应你 CSS 中的 width
          locale: "zh_CN" 
        }
      );
    } catch (error) {
      console.error("Google init error:", error);
    }
  }, [isClient, onLoginSuccess]);

  if (!isClient) return null;

  const modalContent = (
    <div className="modal-backdrop">
      <div className="login-modal">
        <h3>Login to rAyAnChbT</h3>

        {/* 🟣 包装容器，用于层叠你的精美按钮和官方隐形按钮 */}
        <div className="google-auth-wrapper">
          
          {/* 1. 视觉层：用户看到的紫色渐变按钮 */}
          <button className="provider-login-btn custom-google-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginRight: '8px' }}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {isGoogleLoading ? "Loading..." : "Sign in with Google"}
          </button>
          
          {/* 2. 功能层：真正的官方按钮容器，通过 CSS 变透明并覆盖在上面 */}
          <div id="google-login-button-container"></div>
        </div>

        <button
          className="provider-login-btn"
          onClick={() => {
            const authUrl = buildGitHubAuthUrl();
            window.location.href = authUrl;
          }}
        >
          <img
            src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
            alt="GitHub Logo"
          />
          Continue with GitHub
        </button>

        <button className="close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default LoginModal;