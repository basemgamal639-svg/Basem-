import base44 from '@base44/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'node:path';

// VITE_LOCAL_BACKEND=1 points the app at the local Base44-compatible test backend (test/local-backend).
const local = process.env.VITE_LOCAL_BACKEND === '1';

export default defineConfig({
  plugins: [base44(), react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: local ? { proxy: { '/api': 'http://127.0.0.1:4400', '/media': 'http://127.0.0.1:4400' } } : undefined,
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], sdk: ['@base44/sdk'] },
      },
    },
  },
});
