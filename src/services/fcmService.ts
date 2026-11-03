import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { backendAlertApi } from './backendAlertApi';

// Public Firebase Web Client Config (Provided via env or defaults for the user's project)
const firebaseConfig = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || 'AIzaSyDemoPlaceholderKeyForConfig',
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || 'binance-futures-tv.firebaseapp.com',
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || 'binance-futures-tv',
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || 'binance-futures-tv.appspot.com',
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '996941776367',
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || '1:996941776367:web:binancefuturespro',
};

const VAPID_KEY = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || '';

class FCMService {
  private messaging: Messaging | null = null;
  private currentToken: string | null = null;
  private isSupportedBrowser = false;

  constructor() {
    this.isSupportedBrowser = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
    try {
      this.currentToken = localStorage.getItem('fcm_device_token_v1');
    } catch {}
  }

  public isSupported(): boolean {
    return this.isSupportedBrowser;
  }

  public getPermissionStatus(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }

  public getCurrentToken(): string | null {
    return this.currentToken;
  }

  private initFirebaseMessaging(): Messaging | null {
    if (this.messaging) return this.messaging;
    try {
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      this.messaging = getMessaging(app);
      return this.messaging;
    } catch (err) {
      console.warn('Firebase Messaging init error:', err);
      return null;
    }
  }

  /**
   * Requests notification permission, registers the service worker,
   * generates an FCM registration token, and saves it to the Cloudflare Worker backend.
   */
  public async enablePushNotifications(): Promise<{
    success: boolean;
    token?: string;
    permission: NotificationPermission;
    message: string;
  }> {
    if (!this.isSupported()) {
      return {
        success: false,
        permission: 'denied',
        message: 'Push notifications are not supported by this browser.',
      };
    }

    try {
      // 1. Request Permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return {
          success: false,
          permission,
          message: 'Notification permission was not granted. Please allow notifications in Chrome / Android site settings.',
        };
      }

      // 2. Register Service Worker
      let swRegistration: ServiceWorkerRegistration;
      try {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/',
        });
        await navigator.serviceWorker.ready;
      } catch (swErr: any) {
        return {
          success: false,
          permission,
          message: `Service worker registration failed: ${swErr.message}`,
        };
      }

      // 3. Initialize Firebase Messaging
      const messaging = this.initFirebaseMessaging();
      if (!messaging) {
        return {
          success: false,
          permission,
          message: 'Failed to initialize Firebase Messaging instance.',
        };
      }

      // 4. Retrieve FCM Token
      const tokenOptions: { serviceWorkerRegistration: ServiceWorkerRegistration; vapidKey?: string } = {
        serviceWorkerRegistration: swRegistration,
      };
      if (VAPID_KEY) {
        tokenOptions.vapidKey = VAPID_KEY;
      }

      let token = '';
      try {
        token = await getToken(messaging, tokenOptions);
      } catch (tokenErr: any) {
        console.warn('FCM getToken error (retrying with standard push subscription):', tokenErr);
        // Fallback: use Web Push standard endpoint if custom VAPID/FCM failed
        const sub = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: VAPID_KEY || undefined,
        }).catch(() => null);

        if (sub) {
          token = JSON.stringify(sub);
        } else {
          return {
            success: false,
            permission,
            message: `Could not retrieve push token: ${tokenErr.message}. Make sure VITE_FIREBASE_VAPID_KEY is configured.`,
          };
        }
      }

      if (!token) {
        return {
          success: false,
          permission,
          message: 'Received empty registration token from FCM.',
        };
      }

      this.currentToken = token;
      try {
        localStorage.setItem('fcm_device_token_v1', token);
      } catch {}

      // 5. Register with Cloudflare D1 Backend
      const deviceName = /android/i.test(navigator.userAgent)
        ? 'Android Phone (PWA)'
        : /iphone|ipad/i.test(navigator.userAgent)
        ? 'iOS Device'
        : 'Desktop Browser';

      await backendAlertApi.registerPushDevice(token, deviceName);

      // 6. Listen for in-app foreground messages
      try {
        onMessage(messaging, (payload) => {
          if (payload.notification) {
            new Notification(payload.notification.title || 'Price Alert', {
              body: payload.notification.body,
              icon: '/pwa-192x192.png',
            });
          }
        });
      } catch {}

      return {
        success: true,
        token,
        permission: 'granted',
        message: 'Push notifications are now enabled! Your Android phone will receive background price alerts 24/7.',
      };
    } catch (err: any) {
      return {
        success: false,
        permission: this.getPermissionStatus(),
        message: err.message || 'An unexpected error occurred while enabling push notifications.',
      };
    }
  }

  /**
   * Disables push notifications and unregisters device from backend
   */
  public async disablePushNotifications(): Promise<void> {
    if (this.currentToken) {
      await backendAlertApi.unregisterPushDevice(this.currentToken);
    }
    this.currentToken = null;
    try {
      localStorage.removeItem('fcm_device_token_v1');
    } catch {}
  }

  /**
   * Sends an immediate test push to verify background alerts on Android
   */
  public async sendTestNotification(): Promise<{ success: boolean; message: string }> {
    return backendAlertApi.sendTestNotification(this.currentToken || undefined);
  }
}

export const fcmService = new FCMService();
