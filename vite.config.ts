import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': process.env.SCOUTVAULT_API_PROXY ?? 'http://127.0.0.1:45480',
      '/supabase': { target: process.env.SCOUTVAULT_API_PROXY ?? 'http://127.0.0.1:45480', changeOrigin: true, ws: true },
    },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 1000 },
});
