import { PriceAlert, AlertEngineSettings } from '../types';

const USER_ID_STORAGE_KEY = 'binance_futures_user_id_v2';
const DEFAULT_BACKEND_URL = (import.meta as any).env?.VITE_ALERT_BACKEND_URL || '';

export interface AlertHistoryItem {
  id: string;
  alert_id: string;
  symbol: string;
  condition: string;
  target_price: number;
  triggered_price: number;
  price_type: string;
  message: string;
  created_at: number;
}

class BackendAlertApi {
  private backendUrl: string;
  private userId: string;

  constructor() {
    this.backendUrl = DEFAULT_BACKEND_URL;
    this.userId = this.getOrCreateUserId();
  }

  public getOrCreateUserId(): string {
    try {
      let uid = localStorage.getItem(USER_ID_STORAGE_KEY);
      if (!uid) {
        uid = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem(USER_ID_STORAGE_KEY, uid);
      }
      return uid;
    } catch {
      return 'usr_guest_fallback';
    }
  }

  public getUserId(): string {
    return this.getOrCreateUserId();
  }

  public setBackendUrl(url: string) {
    this.backendUrl = url.replace(/\/+$/, '');
    try {
      localStorage.setItem('binance_backend_url', this.backendUrl);
    } catch {}
  }

  public getBackendUrl(): string {
    if (!this.backendUrl) {
      try {
        const saved = localStorage.getItem('binance_backend_url');
        if (saved) this.backendUrl = saved;
      } catch {}
    }
    return this.backendUrl;
  }

  public isConfigured(): boolean {
    return !!this.getBackendUrl();
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'X-User-Id': this.userId,
    };
  }

  /**
   * Health check to test Cloudflare Worker connectivity
   */
  public async checkHealth(): Promise<{ ok: boolean; message: string; version?: string }> {
    const base = this.getBackendUrl();
    if (!base) return { ok: false, message: 'Cloudflare Worker URL is not configured' };

    try {
      const res = await fetch(`${base}/api/health`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, message: 'Connected to Cloudflare Worker & D1', version: data.version };
      }
      return { ok: false, message: `Server returned HTTP ${res.status}` };
    } catch (err: any) {
      return { ok: false, message: err.message || 'Network error reaching Cloudflare Worker' };
    }
  }

  /**
   * Sync active alerts to Cloudflare D1
   */
  public async syncAlertsToBackend(alerts: PriceAlert[]): Promise<boolean> {
    const base = this.getBackendUrl();
    if (!base) return false;

    try {
      // Sync each alert to ensure D1 has the identical state
      for (const a of alerts) {
        await fetch(`${base}/api/alerts`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(a),
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create an alert in Cloudflare D1
   */
  public async createAlert(alert: PriceAlert): Promise<boolean> {
    const base = this.getBackendUrl();
    if (!base) return false;

    try {
      const res = await fetch(`${base}/api/alerts`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(alert),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Update an alert in Cloudflare D1
   */
  public async updateAlert(id: string, updates: Partial<PriceAlert>): Promise<boolean> {
    const base = this.getBackendUrl();
    if (!base) return false;

    try {
      const res = await fetch(`${base}/api/alerts/${id}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(updates),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Delete an alert from Cloudflare D1
   */
  public async deleteAlert(id: string): Promise<boolean> {
    const base = this.getBackendUrl();
    if (!base) return false;

    try {
      const res = await fetch(`${base}/api/alerts/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Register FCM Token with backend for background push notifications
   */
  public async registerPushDevice(fcmToken: string, deviceName = 'Android Device'): Promise<boolean> {
    const base = this.getBackendUrl();
    if (!base) return false;

    try {
      const res = await fetch(`${base}/api/push/register`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ fcmToken, deviceName }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Unregister FCM Token
   */
  public async unregisterPushDevice(fcmToken: string): Promise<boolean> {
    const base = this.getBackendUrl();
    if (!base) return false;

    try {
      const res = await fetch(`${base}/api/push/unregister`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ fcmToken }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Triggers an immediate server-side push test to the Android phone!
   */
  public async sendTestNotification(fcmToken?: string): Promise<{ success: boolean; message: string }> {
    const base = this.getBackendUrl();
    if (!base) return { success: false, message: 'Backend URL not configured' };

    try {
      const res = await fetch(`${base}/api/push/test`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ fcmToken }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        return { success: true, message: `Test push sent successfully to ${data.sentCount} device(s)! Check your Android phone.` };
      }
      return { success: false, message: data.error || (data.errors && data.errors[0]) || 'Failed to dispatch test notification' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network error triggering test push' };
    }
  }

  /**
   * Fetch server-side notification trigger history from Cloudflare D1
   */
  public async fetchNotificationHistory(): Promise<AlertHistoryItem[]> {
    const base = this.getBackendUrl();
    if (!base) return [];

    try {
      const res = await fetch(`${base}/api/alerts/history`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        return data.history || [];
      }
      return [];
    } catch {
      return [];
    }
  }
}

export const backendAlertApi = new BackendAlertApi();
