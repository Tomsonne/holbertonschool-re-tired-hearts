import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // Même origine qu'en production : le navigateur n'appelle que /api,
    // donc pas de CORS et le cookie de session peut rester en SameSite=Strict.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
  },
});
