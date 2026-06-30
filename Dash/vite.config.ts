import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/dash-app/',
  build: { outDir: '../game-website/dash-app', emptyOutDir: true },
  server: { port: 3004, host: '0.0.0.0' },
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
