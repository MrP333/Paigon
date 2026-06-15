import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/nml-app/',
  build: { outDir: '../game-website/nml-app', emptyOutDir: true },
  server: { port: 3002, host: '0.0.0.0' },
  plugins: [react()],
});
