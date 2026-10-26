import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBase = (env.VITE_API_BASE || process.env.VITE_API_BASE || '').trim();
  let apiOrigin = '';
  if (apiBase) {
    const url = new URL(apiBase);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      (url.protocol === 'http:' && !local)
    ) {
      throw new Error('Use an HTTPS VITE_API_BASE for deployed APIs');
    }
    apiOrigin = url.origin;
  }
  const dev = command === 'serve';
  const script = [
    "'self'",
    'https://accounts.google.com',
    'https://apis.google.com',
    ...(dev ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
  ].join(' ');
  const connect = [
    "'self'",
    apiOrigin,
    'https://accounts.google.com',
    'https://oauth2.googleapis.com',
    ...(dev
      ? [
          'http://localhost:8080',
          'http://127.0.0.1:8080',
          'ws://localhost:*',
          'ws://127.0.0.1:*',
        ]
      : []),
  ]
    .filter(Boolean)
    .join(' ');
  const csp = [
    "default-src 'self'",
    `script-src ${script}`,
    `connect-src ${connect}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    'frame-src https://accounts.google.com',
    "font-src 'self' data: https://fonts.gstatic.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    plugins: [
      react(),
      {
        name: 'application-csp',
        transformIndexHtml(html) {
          return html.replace('__APP_CSP__', csp);
        },
      },
    ],
    server: { port: 5173, strictPort: true },
    build: {
      target: ['chrome107', 'edge107', 'firefox104', 'safari16'],
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
