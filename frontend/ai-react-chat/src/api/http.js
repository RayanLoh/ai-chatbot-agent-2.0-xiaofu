import { buildApiUrl, endpoints } from './config';
import { jwtDecode } from 'jwt-decode';

let guestSessionPromise = null;
const clearStoredAuth = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_data');
  window.dispatchEvent(new Event('xiaofu:auth-expired'));
};

const getToken = () => {
  const token = localStorage.getItem('auth_token');
  if (!token) return null;
  try {
    if (Number(jwtDecode(token).exp || 0) * 1000 > Date.now()) return token;
  } catch { /* invalid token */ }
  clearStoredAuth();
  return null;
};

export const parseError = async (response) => {
  const payload = await response.json().catch(() => ({}));
  const detail = payload.detail;
  const nested = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : {};
  const message = typeof detail === 'string' ? detail
    : typeof nested.detail === 'string' ? nested.detail
    : Array.isArray(detail) ? detail.map((item) => item.msg).filter(Boolean).join('; ')
    : payload.error || `Request failed (${response.status})`;
  const error = new Error(message);
  Object.assign(error, {
    status: response.status, detail: message,
    code: payload.code || nested.code || null,
    reason: payload.reason || nested.reason || null,
  });
  return error;
};

const getGuestToken = async () => {
  const existing = localStorage.getItem('guest_token');
  if (existing) return existing;
  if (!guestSessionPromise) {
    guestSessionPromise = (async () => {
      const response = await fetch(buildApiUrl(endpoints.guestSession), { method: 'POST' });
      if (!response.ok) throw await parseError(response);
      const data = await response.json();
      localStorage.setItem('guest_token', data.token);
      return data.token;
    })().finally(() => { guestSessionPromise = null; });
  }
  return guestSessionPromise;
};

export const buildHeaders = async ({ isJson = true } = {}) => {
  const token = getToken();
  return {
    ...(isJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : { 'X-Guest-Token': await getGuestToken() }),
  };
};

export const request = async (path, options = {}, isJson = true, retry = true) => {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: { ...await buildHeaders({ isJson }), ...(options.headers || {}) },
  });
  if (!response.ok) {
    const error = await parseError(response);
    if (retry && error.code === 'INVALID_GUEST_TOKEN') {
      localStorage.removeItem('guest_token');
      return request(path, options, isJson, false);
    }
    if (error.code === 'INVALID_AUTH_TOKEN') clearStoredAuth();
    throw error;
  }
  return response;
};

export const requestJson = async (path, options = {}) => (await request(path, options)).json();
export const requestForm = async (path, formData, options = {}) => (
  await request(path, { method: 'POST', ...options, body: formData }, false)
).json();
