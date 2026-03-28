import { buildApiUrl } from './config';

const getToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
};

export const buildHeaders = ({ isJson = true } = {}) => {
  const token = getToken();
  return {
    ...(isJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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