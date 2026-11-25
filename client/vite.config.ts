import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.DC_SERVER ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target, changeOrigin: false },
      '/socket.io': { target, ws: true, changeOrigin: false },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], react: ['react', 'react-dom', 'react-router-dom'] },
      },
    },
  },
});
