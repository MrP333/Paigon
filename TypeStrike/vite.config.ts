import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/typestrike-app/',
  build: { outDir: '../game-website/typestrike-app', emptyOutDir: true },
  server: { port: 3005, host: '0.0.0.0' },
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
