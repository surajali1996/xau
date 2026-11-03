/**
 * Service Worker for Binance Futures TradingView Pro
 * Handles Background Web Push & Firebase Cloud Messaging (FCM) notifications on Android and Desktop.
 * Runs even when Chrome is closed, screen is locked, or PWA is backgrounded.
 */

/* eslint-disable no-restricted-globals */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 1. BACKGROUND PUSH EVENT: Fires when Cloudflare Worker sends FCM HTTP v1 push
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {
    title: 'Binance Futures Alert',
    body: 'A price alert has been triggered.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    url: '/',
    symbol: 'BTCUSDT',
  };

  try {
    const json = event.data.json();
    if (json.notification) {
      payload.title = json.notification.title || payload.title;
      payload.body = json.notification.body || payload.body;
      payload.icon = json.notification.icon || payload.icon;
    }
    if (json.data) {
      payload.symbol = json.data.symbol || payload.symbol;
      payload.url = json.data.url || `/?symbol=${payload.symbol}`;
      if (!json.notification) {
        payload.title = json.data.title || `${payload.symbol} Alert Triggered`;
        payload.body = json.data.body || payload.body;
      }
    }
  } catch (err) {
    payload.body = event.data.text() || payload.body;
  }

  const notificationOptions = {
    body: payload.body,
    icon: payload.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [200, 100, 200, 100, 400],
    tag: `binance-alert-${payload.symbol}-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    data: {
      url: payload.url,
      symbol: payload.symbol,
      dateOfArrival: Date.now(),
    },
    actions: [
      {
        action: 'open_chart',
        title: `Open ${payload.symbol} Chart`,
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions)
  );
});

// 2. NOTIFICATION CLICK EVENT: When tapped on Android phone, opens the exact trading pair!
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it and navigate
      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // If no window open, open new window with target chart
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
