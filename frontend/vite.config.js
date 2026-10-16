import { fileURLToPath, URL } from 'url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import environment from 'vite-plugin-environment';

process.env.STORAGE_GATEWAY_URL =
  process.env.STORAGE_GATEWAY_URL || 'https://blob.caffeine.ai';

export default defineConfig({
  logLevel: 'info',

  server: {
    host: '0.0.0.0',          // ← required to accept requests from Nginx/external
    port: 2000,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5006',  // your backend
        changeOrigin: true,
        secure: false
      },
      '/ws': {
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
    allowedHosts: ['regen.krishub.in']   // ← allow Vite to accept this host
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
