import { useEffect, useState } from 'react';
import { jwtDecode } from 'jwt-decode';

const isTokenExpired = (token) => {
  try {
    const decoded = jwtDecode(token);
    const expiresAt = Number(decoded?.exp || 0);

    if (!expiresAt) {
      return true;
    }

    return expiresAt * 1000 <= Date.now();
  } catch {
    return true;
  }
};

const clearStoredAuth = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_data');
};

export function useAuth() {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [GoogleProvider, setGoogleProvider] = useState(null);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    setIsMounted(true);

    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    if (isTokenExpired(token)) {
      console.warn('Stored Google token has expired. Clearing local auth state.');
      clearStoredAuth();
      return;
    }

    try {
      const decoded = jwtDecode(token);
      const storedUserData = localStorage.getItem('user_data');
      if (storedUserData) {
        const userData = JSON.parse(storedUserData);
        decoded.picture = userData.picture || decoded.picture;
        decoded.avatar_url = userData.avatar_url || decoded.avatar_url;
      }
      setUser(decoded);
      setIsLoggedIn(true);
    } catch (error) {
      console.error('Invalid token:', error);
      clearStoredAuth();
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const mod = await import('@react-oauth/google');
        setGoogleProvider(() => mod.GoogleOAuthProvider);
      } catch (error) {
        console.error('Provider load error:', error);
      }
    })();
  }, []);

  const openLoginModal = () => setShowLoginModal(true);
  const closeLoginModal = () => setShowLoginModal(false);

  const handleLoginSuccess = (decoded, token) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_data', JSON.stringify({
      picture: decoded.picture,
      avatar_url: decoded.avatar_url,
      name: decoded.name,
    }));
    localStorage.removeItem('lastConversationId');

    setUser(decoded);
    setIsLoggedIn(true);
    setShowLoginModal(false);
  };

  const handleLogout = () => {
    clearStoredAuth();
    localStorage.removeItem('lastConversationId');
    setUser(null);
    setIsLoggedIn(false);
  };

  return {
    clientId,
    GoogleProvider,
    isLoggedIn,
    isMounted,
    openLoginModal,
    closeLoginModal,
    handleLoginSuccess,
    handleLogout,
    setShowLoginModal,
    showLoginModal,
    user,
  };
}