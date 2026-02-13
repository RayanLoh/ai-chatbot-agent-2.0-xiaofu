// GitHub OAuth 配置
export const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
export const GITHUB_REDIRECT_URI = import.meta.env.VITE_GITHUB_REDIRECT_URI || 'http://localhost:5173/';

// 生成随机状态值防止 CSRF 攻击
export function generateState() {
  return Math.random().toString(36).substring(2, 15);
}

// 保存状态值到 localStorage
export function saveState(state) {
  localStorage.setItem('github_oauth_state', state);
}

// 验证状态值
export function verifyState(state) {
  return state === localStorage.getItem('github_oauth_state');
}

// 构建 GitHub 授权 URL
export function buildGitHubAuthUrl() {
  const state = generateState();
  saveState(state);
  
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: 'read:user user:email',
    state: state
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

// 处理授权回调
export async function handleGitHubCallback(code, state) {
  // 验证状态防止 CSRF
  if (!verifyState(state)) {
    throw new Error('Invalid state parameter');
  }

  // 清除已使用的状态值
  localStorage.removeItem('github_oauth_state');

  try {
    // 通过后端交换访问令牌
    const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

    const response = await fetch(`${API_BASE}/auth/github/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to exchange token');
    }

    return data;
  } catch (error) {
    console.error('GitHub OAuth Error:', error);
    throw error;
  }
}