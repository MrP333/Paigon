import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Shared environment files at the repo root (.env.production / .env.development).
  envDir: path.resolve(__dirname, '..'),
  base: '/odd-app/',
  build: { outDir: '../game-website/odd-app', emptyOutDir: true },
  server: { port: 3003, host: '0.0.0.0' },
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
