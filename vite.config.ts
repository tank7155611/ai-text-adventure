import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = env.VITE_OPENAI_COMPAT_BASE_URL || 'https://openrouter.chipltech.com/v1';
  const apiKey = env.OPENAI_COMPAT_API_KEY || '';

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api/openai': {
          target: apiBaseUrl,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/api\/openai/, ''),
          headers: apiKey
            ? {
                Authorization: `Bearer ${apiKey}`
              }
            : undefined
        }
      }
    }
  };
});
