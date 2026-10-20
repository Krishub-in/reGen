import { fileURLToPath, URL } from 'url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import environment from 'vite-plugin-environment';

process.env.STORAGE_GATEWAY_URL =
  process.env.STORAGE_GATEWAY_URL || 'https://blob.caffeine.ai';

export default defineConfig({
  logLevel: 'info',

  server: {
    host: '::',          // ← listens on both IPv6 (::1/localhost) and IPv4 (127.0.0.1/LAN/Nginx)
    port: 2000,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5006',  // your backend
        changeOrigin: true,
        secure: false,
        timeout: 30000,
        proxyTimeout: 30000,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ maintenance: true, portDown: true, message: 'Server Under Maintenance' }));
            }
          });
        }
      },
      '/ws': {
        target: 'http://127.0.0.1:5006',
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', () => {});
        }
      },
      '/socket.io': {
        target: 'http://127.0.0.1:5006',
        changeOrigin: true,
        secure: false,
        ws: true
      },
      '/assets': {
        target: 'http://127.0.0.1:5006',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: 'http://127.0.0.1:5006',
        changeOrigin: true,
        secure: false
      }
    },
    allowedHosts: true   // ← allow localhost, LAN IPs, and regen.krishub.in
  },

  build: {
    emptyOutDir: true,
    sourcemap: false,
    minify: false
  },

  css: {
    postcss: './postcss.config.js'
  },

  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  },

  plugins: [
    environment('all', { prefix: 'CANISTER_' }),
    environment('all', { prefix: 'DFX_' }),
    environment(['STORAGE_GATEWAY_URL']),
    react()
  ],

  resolve: {
    alias: [
      {
        find: 'declarations',
        replacement: fileURLToPath(new URL('../declarations', import.meta.url))
      },
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url))
      }
    ],
    dedupe: ['@dfinity/agent']
  }
});
