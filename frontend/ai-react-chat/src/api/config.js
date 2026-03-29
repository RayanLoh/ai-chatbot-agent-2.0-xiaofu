const DEFAULT_LOCAL_API_BASE = 'http://localhost:8080';
const DEFAULT_PRODUCTION_API_BASE = 'https://xiaofu-backend-301455980722.asia-southeast1.run.app';

const normalizeBaseUrl = (value) => value.trim().replace(/\/$/, '');

const shouldUseProductionFallback = (apiBase) => {
  if (typeof window === 'undefined') return false;

  const hostname = window.location.hostname || '';
  const isVercelDeployment = hostname.endsWith('.vercel.app');

  return isVercelDeployment && apiBase.includes('xiaofu-ai.duckdns.org');
};

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
  let apiBase = normalizeBaseUrl(import.meta.env.VITE_API_BASE || '');
  if (apiBase && !apiBase.startsWith('http')) {
    apiBase = `https://${apiBase}`;
  }

  if (shouldUseProductionFallback(apiBase)) {
    console.warn('Using Cloud Run API base because the deployed Vercel build still points to the legacy duckdns backend.');
    return DEFAULT_PRODUCTION_API_BASE;
  }

  if (apiBase) {
    return apiBase;
  }

  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.vercel.app')) {
    return DEFAULT_PRODUCTION_API_BASE;
  }

  return DEFAULT_LOCAL_API_BASE;
};

export const buildApiUrl = (path) => `${getApiBase()}${path}`;

export const buildDownloadImageUrl = (url) => buildApiUrl(endpoints.downloadImage(url));