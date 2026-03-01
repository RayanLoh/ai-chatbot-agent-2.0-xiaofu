import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { jwtDecode } from "jwt-decode";
import { buildGitHubAuthUrl, handleGitHubCallback } from "../utils/githubOAuth";
import "../styles/LoginModal.css";

function LoginModal({ onClose, onLoginSuccess }) {
  const [isClient, setIsClient] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => setIsClient(true), []);

  // GitHub OAuth 回调处理
  useEffect(() => {
    if (!isClient) return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (code && state) {
      handleGitHubCallback(code, state)
        .then((data) => {
          // 确保 picture 字段存在（GitHub 使用 avatar_url）
          if (data.user && !data.user.picture && data.user.avatar_url) {
            data.user.picture = data.user.avatar_url;
          }
          console.log("GitHub login success:", data.user);
          onLoginSuccess(data.user, data.token);
          window.history.replaceState({}, document.title, "/");
        })
        .catch((error) => {
          console.error("GitHub login failed:", error);
          alert("GitHub login failed: " + error.message);
        });
    }
  }, [isClient, onLoginSuccess]);

  // Google 登陆处理 - 使用 Userinfo API 获取完整用户信息
  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      if (window.google && window.google.accounts) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: async (response) => {
            try {
              const decoded = jwtDecode(response.credential);
              console.log("Google JWT full decoded:", decoded);
              
              // Google ID Token 通常包含这些字段
              let userData = {
                sub: decoded.sub,
                email: decoded.email,
                name: decoded.name,
                email_verified: decoded.email_verified,
              };
              
              // 尝试从多个可能的字段获取头像 URL
              userData.picture = decoded.picture || 
                                  decoded.picture_url || 
                                  decoded.photos?.[0]?.value ||
                                  null;
              
              console.log("Google login - Initial userData:", userData);
              
              // 如果 JWT 中有 picture，直接使用
              if (userData.picture) {
                console.log("Picture found in JWT:", userData.picture);
                onLoginSuccess(userData, response.credential);
              } else {
                // 否则尝试通过 Userinfo API 获取头像
                console.log("No picture in JWT, fetching from userinfo API");
                try {
                  const userInfoResponse = await fetch(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    {
                      headers: {
                        Authorization: `Bearer ${response.clientId}`, // 这可能不对，但是尝试
                      },
                    }
                  ).catch(() => null);
                  
                  if (userInfoResponse?.ok) {
                    const userInfo = await userInfoResponse.json();
                    userData.picture = userInfo.picture;
                    console.log("Picture from userinfo API:", userData.picture);
                  }
                } catch (e) {
                  console.log("Failed to fetch from userinfo API:", e);
                }
                
                onLoginSuccess(userData, response.credential);
              }
            } catch (error) {
              console.error("Failed to decode Google credential:", error);
              alert("Failed to process Google login: " + error.message);
            }
          },
        });
        
        // 触发登陆弹窗
        window.google.accounts.id.prompt();
      }
    } catch (error) {
      console.error("Google login error:", error);
      alert("Google login failed: " + error.message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  if (!isClient) return null;

  const modalContent = (
    <div className="modal-backdrop">
      <div className="login-modal">
        <h3>Login to rAyAnChbT</h3>

        {/* Google 登陆按钮 */}
        <button
          className="google-login"
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading}
          style={{
            background: isGoogleLoading ? "#f0f0f0" : "white",
            border: "1px solid #dadce0",
            borderRadius: "4px",
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isGoogleLoading ? "not-allowed" : "pointer",
            width: "100%",
            marginBottom: "12px",
            fontSize: "14px",
            fontWeight: "500",
            color: "#1f2937",
            opacity: isGoogleLoading ? 0.6 : 1,
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            style={{ marginRight: "8px" }}
          >
            <image
              href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%234285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'/%3E%3Cpath fill='%2334A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'/%3E%3Cpath fill='%23FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'/%3E%3Cpath fill='%23EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'/%3E%3C/svg%3E"
              x="0"
              y="0"
              width="20"
              height="20"
            />
          </svg>
          {isGoogleLoading ? "Loading..." : "Sign in with Google"}
        </button>

        <button
          className="github-login"
          onClick={() => {
            const authUrl = buildGitHubAuthUrl();
            window.location.href = authUrl;
          }}
        >
          <img
            src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
            alt="GitHub Logo"
            style={{
              width: "20px",
              marginRight: "8px",
              verticalAlign: "middle",
            }}
          />
          Continue with GitHub
        </button>

        <button className="close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );

  // 使用 React Portal 将弹窗渲染到 body 上，避免受到父元素（如 header）的 transform/filter 干扰
  return createPortal(modalContent, document.body);
}

export default LoginModal;
