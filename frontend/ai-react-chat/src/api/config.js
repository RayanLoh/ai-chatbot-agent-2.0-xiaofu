const DEFAULT_LOCAL_API_BASE = 'http://localhost:8080';

export const endpoints = {
  health: '/health',
  conversations: '/conversations',
  conversation: (conversationId) => `/conversations/${conversationId}`,
  generate: '/generate',
  stop: '/stop',
  upload: '/upload',
  downloadImage: (url) => `/download-image?url=${encodeURIComponent(url)}`,
};

export const getApiBase = () => {
  let apiBase = (import.meta.env.VITE_API_BASE || '').trim();
  if (apiBase && !apiBase.startsWith('http')) {
    apiBase = `https://${apiBase}`;
  }

  return apiBase || DEFAULT_LOCAL_API_BASE;
};

export const buildApiUrl = (path) => `${getApiBase()}${path}`;

export const buildDownloadImageUrl = (url) => buildApiUrl(endpoints.downloadImage(url));