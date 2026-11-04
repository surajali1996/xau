
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: [
    'favicon.ico',
    'apple-touch-icon.png',
    'icon.svg'
  ],
  manifest: {
    id: '/xau/',
    name: 'Suraj Ali Trading App',
    short_name: 'Suraj Trading',
    description: 'Professional Trading Chart Application',
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
        purpose: 'any'
      },
      {
        src: '/xau/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/xau/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ]
  },
  workbox: {
    globPatterns: [
      '**/*.{js,css,html,ico,png,svg,woff,woff2}'
    ]
  }
})
