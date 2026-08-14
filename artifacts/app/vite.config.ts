import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT ?? '5173';

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? '/';
// Replit runs the API as a dedicated service on 8080; local development uses
// 5000. Keep this fallback in sync with the API server so starting Vite
// directly does not proxy /api requests to an unused port and return a 502.
const apiPort = process.env.REPL_ID ? '8080' : '5000';
const apiUrl = process.env.API_URL ?? `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Consolidate vendor code so the first paint pulls a few well-cached
        // chunks instead of dozens of sub-2 KB files. Only libraries that are
        // needed eagerly are grouped here; heavy, route-specific dependencies
        // (three/vanta, recharts, @xyflow) are deliberately left to Rollup's
        // default per-dynamic-import splitting so they stay off the critical
        // path and only load with the lazy page that uses them.
        manualChunks(id) {
          // The generated API client is imported by nearly every page, so it
          // was being hoisted into the shared app chunk. Naming it keeps it in
          // one long-lived cache entry instead of invalidating with app code.
          if (id.includes('api-client-react')) return 'api-client';

          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-is)[\\/]/.test(id))
            return 'react-vendor';
          if (/[\\/]node_modules[\\/](lucide-react|react-icons)[\\/]/.test(id))
            return 'icons';
          if (id.includes('@radix-ui')) return 'radix';
          if (id.includes('@tanstack')) return 'query';

          // p5 (~1MB) is a vanta dependency, and was being hoisted into the
          // shared app chunk and downloaded on every first paint even though
          // only the decorative background needs it. Naming it keeps it off
          // the critical path, since its only importer is the lazily-mounted
          // VantaBackground.
          //
          // p5 is named ALONE, not together with vanta. VantaBackground
          // imports each effect through its own dynamic import so that a user
          // only downloads the background they actually chose; grouping the
          // two defeated that, because every effect plus p5 landed in one
          // chunk. Only "topology" runs on p5 — the default "net" and the four
          // other styles are three.js — so the shared chunk made the default
          // background pull about a megabyte of p5 that never executes, plus
          // five effects nobody asked for.
          if (/[\\/]node_modules[\\/]p5[\\/]/.test(id)) return 'p5';

          // NOTE: do NOT name chunks for recharts / @xyflow / @dnd-kit and
          // friends. They are only reached through lazy pages, and naming them
          // pulls them into the entry's static import graph — measurably worse
          // than leaving them inside the lazy page chunk that uses them.
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: apiUrl,
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
