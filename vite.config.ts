import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'client',
  server: {
    port: 5173,
    /** listen on all interfaces so phones on the same Wi-Fi can open http://YOUR_PC_IP:5173 */
    host: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3847', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:3847', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', emptyDirBeforeWrite: true },
  preview: {
    port: 4173,
    host: true,
  },
});
