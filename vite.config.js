import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Extra hostnames allowed to open the dev server (the cloud preview hostname).
 * Read from an environment variable so a temporary VM hostname never has to be
 * hard-coded into this tracked file.
 */
const extraAllowedHosts = (process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

/**
 * A Vercel build without VITE_API_BASE_URL would ship a frontend that calls
 * "/api" on its own domain, where no API exists. Fail the build instead of
 * deploying a site whose every request 404s.
 */
if (process.env.VERCEL && !process.env.VITE_API_BASE_URL) {
  throw new Error(
    'VITE_API_BASE_URL is required on Vercel (for example https://busbook-api.onrender.com/api).',
  );
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: extraAllowedHosts.length > 0 ? extraAllowedHosts : undefined,
    /**
     * In development the browser calls "/api/..." on this same origin and Vite
     * forwards it to Express. Same-origin means no CORS headaches and cookies
     * work exactly as they will in production.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
});
