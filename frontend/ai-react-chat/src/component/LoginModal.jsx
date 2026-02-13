import React, { useEffect, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";
import { buildGitHubAuthUrl, handleGitHubCallback } from "../utils/githubOAuth";
import "../styles/LoginModal.css";

function LoginModal({ onClose, onLoginSuccess }) {
  const [isClient, setIsClient] = useState(false);

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
          onLoginSuccess(data.user, data.token);
          window.history.replaceState({}, document.title, "/");
        })
        .catch((error) => {
          console.error("GitHub login failed:", error);
          alert("GitHub login failed: " + error.message);
        });
    }
  }, [isClient, onLoginSuccess]);

  return (
    <div className="modal-backdrop">
      <div className="login-modal">
        <h3>Login to rAyAnChbT</h3>

        {/* ✅ 只在客户端渲染 GoogleLogin */}
        {isClient && (
          <GoogleLogin
            onSuccess={(res) => {
              const decoded = jwtDecode(res.credential);
              onLoginSuccess(decoded, res.credential);
            }}
            onError={() => console.error("Google login failed")}
          />
        )}

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
}

export default LoginModal;