const configured = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/+$/, '');

export const endpoints = {
  health: '/health',
  models: '/models',
  guestSession: '/guest-session',
  conversations: '/conversations',
  conversation: (id) => `/conversations/${encodeURIComponent(id)}`,
  generate: '/generate',
  stop: '/stop',
  upload: '/upload',
  downloadImage: (url) => `/download-image?url=${encodeURIComponent(url)}`,
};

export const getApiBase = () => {
  if (configured) {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('VITE_API_BASE must be an HTTP(S) API address');
    }
    return configured;
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:8080';
  }
  // Production may use a reverse proxy on the same origin.
  return '';
};

export const buildApiUrl = (path) => `${getApiBase()}${path}`;
