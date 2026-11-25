import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createRequire } from 'node:module';

const target = process.env.DC_SERVER ?? 'http://127.0.0.1:3001';
const P2P = process.env.VITE_P2P === '1';
const here = __dirname;
const serverSrc = path.resolve(here, '../server/src');
const local = (f: string) => path.resolve(here, 'src/local', f);
const require = createRequire(import.meta.url);

/** In the serverless build, swap Node-only server modules for browser implementations. */
function browserServer(): Plugin {
  const bare: Record<string, string> = {
    'better-sqlite3': local('sqlite.ts'),
    'node:fs': local('fs.ts'),
    fs: local('fs.ts'),
    'node:path': local('path.ts'),
    path: local('path.ts'),
    'node:url': local('url.ts'),
    'node:crypto': local('crypto.ts'),
    'node:events': require.resolve('events/'),
    'socket.io': local('io.ts'),
  };
  const files: Record<string, string> = {
    [path.join(serverSrc, 'auth')]: local('auth.ts'),
    [path.join(serverSrc, 'config')]: local('config.ts'),
    [path.join(serverSrc, 'engine/uci')]: local('uci.ts'),
  };
  return {
    name: 'dc-browser-server',
    enforce: 'pre',
    resolveId(source, importer) {
      if (bare[source]) return bare[source];
      if (importer && source.startsWith('.') && importer.startsWith(serverSrc)) {
        const abs = path.resolve(path.dirname(importer), source).replace(/\.ts$/, '');
        if (files[abs]) return files[abs];
      }
      return null;
    },
  };
}

export default defineConfig({
  base: P2P ? process.env.BASE_PATH ?? '/Dash-Chess/' : '/',
  plugins: [react(), ...(P2P ? [browserServer()] : [])],
  define: P2P ? { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' } : {},
  server: {
    port: 5173,
    host: true,
    proxy: P2P
      ? undefined
      : {
          '/api': { target, changeOrigin: false },
          '/socket.io': { target, ws: true, changeOrigin: false },
        },
  },
  optimizeDeps: { exclude: ['sql.js'] },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks: { three: ['three'], react: ['react', 'react-dom', 'react-router-dom'] } },
    },
  },
});
