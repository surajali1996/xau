import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: '/xau/',

    plugins: [
      react(),
      tailwindcss(),

      VitePWA({
        registerType: 'autoUpdate',

        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'icon.svg',
        ],

        manifest: {
          id: '/xau/',
          name: 'Suraj Ali Trading App',
          short_name: 'Suraj Trading',
          description:
            'Professional Trading Chart Application',

          theme_color: '#131722',
          background_color: '#131722',

          display: 'standalone',
          orientation: 'landscape',

          start_url: '/xau/',
          scope: '/xau/',

          icons: [
            {
              src: '/xau/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/xau/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/xau/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },

        workbox: {
          globPatterns: [
            '**/*.{js,css,html,ico,png,svg,woff,woff2}',
          ],

          navigateFallback: 'index.html',

          runtimeCaching: [
            {
              urlPattern:
                /^https:\/\/fonts\.googleapis\.com\/.*/i,

              handler: 'CacheFirst',

              options: {
                cacheName: 'google-fonts-cache',

                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },

                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },

            {
              urlPattern:
                /^https:\/\/fonts\.gstatic\.com\/.*/i,

              handler: 'CacheFirst',

              options: {
                cacheName: 'gstatic-fonts-cache',

                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },

                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },

        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      // Keep AI Studio HMR configuration unchanged.
      hmr: process.env.DISABLE_HMR !== 'true',

      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {},
    },
  };
});
