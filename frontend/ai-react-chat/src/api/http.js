import { buildApiUrl } from './config';
import { jwtDecode } from 'jwt-decode';

const GUEST_ID_STORAGE_KEY = 'guest_id';

const clearStoredAuth = () => {
  if (typeof window === 'undefined') return;

  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_data');
};

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

const getToken = () => {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem('auth_token');
  if (!token) return null;

  if (isTokenExpired(token)) {
    console.warn('Expired auth token detected while building request headers. Clearing local auth state.');
    clearStoredAuth();
    return null;
  }

  return token;
};

const createGuestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const getOrCreateGuestId = () => {
  if (typeof window === 'undefined') return null;

  let guestId = localStorage.getItem(GUEST_ID_STORAGE_KEY);
  if (!guestId) {
    guestId = createGuestId();
    localStorage.setItem(GUEST_ID_STORAGE_KEY, guestId);
  }

  return guestId;
};

export const buildHeaders = ({ isJson = true } = {}) => {
  const token = getToken();
  const guestId = getOrCreateGuestId();
  return {
    ...(isJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(guestId ? { 'X-Guest-Id': guestId } : {}),
  };
};

const parseError = async (response) => {
  const errorData = await response.json().catch(() => ({ detail: response.statusText }));
  return new Error(errorData.detail || `HTTP error! status: ${response.status}`);
};

export const requestJson = async (path, options = {}) => {
  try {
    const response = await fetch(buildApiUrl(path), {
      ...options,
      headers: {
        ...buildHeaders({ isJson: true }),
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw await parseError(response);
    }

    return response.json();
  } catch (error) {
    console.error(`API call to ${path} failed:`, error);
    throw error;
  }
};

export const requestForm = async (path, formData, options = {}) => {
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    ...options,
    headers: {
      ...buildHeaders({ isJson: false }),
      ...(options.headers || {}),
    },
    body: formData,
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return response.json();
};