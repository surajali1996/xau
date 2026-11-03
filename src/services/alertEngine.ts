import { PriceAlert, PriceType, AlertSoundType, AlertStatus, AlertEngineSettings, CandleData } from '../types';
import { backendAlertApi } from './backendAlertApi';

const ALERTS_STORAGE_KEY = 'binance_futures_tv_alerts_v2';
const SETTINGS_STORAGE_KEY = 'binance_futures_alert_settings_v2';

export type AlertTriggerListener = (alert: PriceAlert, triggeredPrice: number) => void;

class AlertEngine {
  private alerts: PriceAlert[] = [];
  private previousPrices: Map<string, number> = new Map();
  private lastTriggeredTimes: Map<string, number> = new Map();
  private listeners: Set<AlertTriggerListener> = new Set();
  private audioCtx: AudioContext | null = null;
  private settings: AlertEngineSettings = {
    soundEnabled: true,
    vibrationEnabled: true,
    volume: 0.8,
  };

  constructor() {
    this.loadSettings();
    this.loadAlerts();
    this.initNotificationPermission();
    // Sync active alerts with Cloudflare D1 backend
    backendAlertApi.syncAlertsToBackend(this.alerts).catch(() => {});
  }

  private loadSettings() {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch {
      // Keep defaults
    }
  }

  private saveSettings() {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore quota errors
    }
  }

  private loadAlerts() {
    try {
      const saved = localStorage.getItem(ALERTS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Normalize backward compatibility
        this.alerts = parsed.map((a: Partial<PriceAlert>) => ({
          ...a,
          status: a.status || (a.triggered ? 'triggered' : 'active'),
          sound: a.sound || 'price_reach',
          vibrate: a.vibrate !== false,
          triggered: a.status === 'triggered' || !!a.triggered,
        }));
      }
    } catch {
      this.alerts = [];
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(this.alerts));
    } catch {
      // Ignore quota errors
    }
  }

  public getSettings(): AlertEngineSettings {
    return { ...this.settings };
  }

  public updateSettings(updates: Partial<AlertEngineSettings>) {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
  }

  public getAlerts(): PriceAlert[] {
    return [...this.alerts];
  }

  public getAlertsForSymbol(symbol: string): PriceAlert[] {
    return this.alerts.filter((a) => a.symbol === symbol);
  }

  public addAlert(alert: Omit<PriceAlert, 'id' | 'createdAt' | 'status' | 'triggered'>): PriceAlert {
    const newAlert: PriceAlert = {
      ...alert,
      id: 'alert_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      createdAt: Date.now(),
      status: 'active',
      triggered: false,
      sound: alert.sound || 'price_reach',
      vibrate: alert.vibrate !== false,
    };
    this.alerts.push(newAlert);
    this.saveToStorage();
    // Register with server-side Cloudflare D1 alert engine
    backendAlertApi.createAlert(newAlert).catch(() => {});
    return newAlert;
  }

  public updateAlert(id: string, updates: Partial<PriceAlert>) {
    const target = this.alerts.find((a) => a.id === id);
    if (target) {
      Object.assign(target, updates);
      if (updates.status === 'active') {
        target.triggered = false;
        target.triggeredAt = undefined;
      } else if (updates.status === 'triggered') {
        target.triggered = true;
      }
      this.saveToStorage();
      // Sync update to Cloudflare D1
      backendAlertApi.updateAlert(id, updates).catch(() => {});
    }
  }

  public updateAlertPrice(id: string, newPrice: number) {
    this.updateAlert(id, { price: newPrice, status: 'active', triggered: false, triggeredAt: undefined });
  }

  public setAlertStatus(id: string, status: AlertStatus) {
    const target = this.alerts.find((a) => a.id === id);
    if (target) {
      target.status = status;
      target.triggered = status === 'triggered';
      if (status === 'active') target.triggeredAt = undefined;
      this.saveToStorage();
      backendAlertApi.updateAlert(id, { status }).catch(() => {});
    }
  }

  public deleteAlert(id: string) {
    this.alerts = this.alerts.filter((a) => a.id !== id);
    this.saveToStorage();
    backendAlertApi.deleteAlert(id).catch(() => {});
  }

  public clearAllAlerts() {
    this.alerts = [];
    this.saveToStorage();
  }

  public subscribe(listener: AlertTriggerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async initNotificationPermission() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch {
          // Ignore
        }
      }
    }
  }

  /**
   * Triggers Android device vibration if supported.
   */
  public triggerVibration(pattern: number[] = [250, 100, 250, 100, 350]) {
    if (!this.settings.vibrationEnabled || typeof navigator === 'undefined') return;
    try {
      if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Non-blocking
    }
  }

  /**
   * Returns an active AudioContext instance.
   */
  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Synthesizes 5 distinct custom notification sounds:
   * A. PRICE REACH: Long, clear, resonant harmonic chime (1.5s sustain).
   * B. PRICE RISE: Ascending arpeggiated melodic flourish (C5 -> E5 -> G5 -> C6).
   * C. PRICE DROP: Descending cascade tone (C6 -> G5 -> E♭5 -> C5).
   * D. PRICE CROSS ABOVE: Double sharp rising bell strike.
   * E. PRICE CROSS BELOW: Distinct resonant falling gong tone.
   */
  public playSpecificSound(soundType: AlertSoundType) {
    if (!this.settings.soundEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      const vol = Math.max(0.01, Math.min(1.0, this.settings.volume));
      masterGain.gain.setValueAtTime(vol, now);
      masterGain.connect(ctx.destination);

      switch (soundType) {
        case 'price_reach': {
          // Long, clear harmonic tone with multi-frequency resonance (1.5s)
          const freqs = [587.33, 880.0, 1174.66]; // D5, A5, D6
          freqs.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = idx === 0 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.3 / (idx + 1), now + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 1.5);
          });
          break;
        }

        case 'price_rise': {
          // Ascending arpeggio: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
          const notes = [523.25, 659.25, 783.99, 1046.5];
          notes.forEach((freq, idx) => {
            const noteStart = now + idx * 0.12;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, noteStart);
            gain.gain.setValueAtTime(0, noteStart);
            gain.gain.linearRampToValueAtTime(0.35, noteStart + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.55);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(noteStart);
            osc.stop(noteStart + 0.6);
          });
          break;
        }

        case 'price_drop': {
          // Descending cascade: C6 (1046Hz), G5 (784Hz), Eb5 (622Hz), C5 (523Hz)
          const notes = [1046.5, 783.99, 622.25, 523.25];
          notes.forEach((freq, idx) => {
            const noteStart = now + idx * 0.12;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, noteStart);
            gain.gain.setValueAtTime(0, noteStart);
            gain.gain.linearRampToValueAtTime(0.35, noteStart + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.6);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(noteStart);
            osc.stop(noteStart + 0.65);
          });
          break;
        }

        case 'price_cross_above': {
          // Sharp double rising chime: 600Hz -> 900Hz -> 1480Hz
          const steps = [
            { f: 587.33, t: 0, d: 0.6 },
            { f: 880.0, t: 0.12, d: 0.8 },
            { f: 1479.98, t: 0.25, d: 1.1 },
          ];
          steps.forEach(({ f, t, d }) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, now + t);
            gain.gain.setValueAtTime(0, now + t);
            gain.gain.linearRampToValueAtTime(0.4, now + t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now + t);
            osc.stop(now + t + d + 0.05);
          });
          break;
        }

        case 'price_cross_below': {
          // Distinct falling gong tone: 880Hz -> 440Hz -> 220Hz
          const steps = [
            { f: 880.0, t: 0, d: 0.5 },
            { f: 587.33, t: 0.14, d: 0.8 },
            { f: 293.66, t: 0.28, d: 1.2 },
          ];
          steps.forEach(({ f, t, d }) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, now + t);
            gain.gain.setValueAtTime(0, now + t);
            gain.gain.linearRampToValueAtTime(0.45, now + t + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now + t);
            osc.stop(now + t + d + 0.05);
          });
          break;
        }
      }
    } catch {
      // Audio playback non-blocking
    }
  }

  public playAlertChime() {
    this.playSpecificSound('price_reach');
  }

  /**
   * Helper to trigger and notify an alert.
   */
  private triggerAlert(alert: PriceAlert, triggeredPrice: number) {
    const now = Date.now();
    this.lastTriggeredTimes.set(alert.id, now);
    alert.triggered = true;
    alert.triggeredAt = now;

    if (alert.repeat === 'every_time') {
      alert.status = 'active';
    } else if (alert.repeat === 'once_per_bar' || alert.repeat === 'once_per_bar_close') {
      alert.status = 'triggered'; // Re-arms on next bar
    } else {
      alert.status = 'triggered';
    }

    // Play customized sound
    this.playSpecificSound(alert.sound || 'price_reach');

    // Trigger vibration
    if (alert.vibrate !== false) {
      this.triggerVibration();
    }

    // Web/Background push notification
    if (alert.browserNotification !== false) {
      this.dispatchSystemNotification(alert, triggeredPrice);
    }

    // Notify subscribers (UI toasts, sound indicators)
    for (const listener of this.listeners) {
      listener(alert, triggeredPrice);
    }

    this.saveToStorage();
  }

  /**
   * Evaluates bar close conditions (Candle Closes Above / Below) and resets bar-based alerts.
   */
  public checkBarClose(candle: CandleData, symbol: string) {
    const now = Date.now();
    const activeAlerts = this.alerts.filter((a) => a.symbol === symbol && a.status === 'active');

    for (const alert of activeAlerts) {
      if (alert.expirationTimestamp && now > alert.expirationTimestamp) {
        alert.status = 'disabled';
        continue;
      }

      let isBreached = false;
      if (alert.condition === 'candle_close_above') {
        isBreached = candle.close >= alert.price;
      } else if (alert.condition === 'candle_close_below') {
        isBreached = candle.close <= alert.price;
      }

      if (isBreached) {
        this.triggerAlert(alert, candle.close);
      }
    }

    // Re-arm once_per_bar / once_per_bar_close alerts for subsequent bars
    let hasChanges = false;
    this.alerts.forEach((alert) => {
      if (
        alert.symbol === symbol &&
        (alert.repeat === 'once_per_bar' || alert.repeat === 'once_per_bar_close') &&
        alert.status === 'triggered'
      ) {
        alert.status = 'active';
        alert.triggered = false;
        hasChanges = true;
      }
    });

    if (hasChanges) {
      this.saveToStorage();
    }
  }

  /**
   * Real-time tick evaluation with duplicate notification prevention.
   */
  public checkTick(currentPrice: number, symbol: string, priceType: PriceType) {
    const key = `${symbol}_${priceType}`;
    const previousPrice = this.previousPrices.get(key);
    this.previousPrices.set(key, currentPrice);

    if (previousPrice === undefined) {
      return;
    }

    const now = Date.now();
    const activeAlerts = this.alerts.filter((a) => a.symbol === symbol && a.status === 'active');

    for (const alert of activeAlerts) {
      // Check expiration
      if (alert.expirationTimestamp && now > alert.expirationTimestamp) {
        alert.status = 'disabled';
        continue;
      }

      // Prevent duplicate notifications within 3.5s cooldown
      const lastTriggered = this.lastTriggeredTimes.get(alert.id) || 0;
      if (now - lastTriggered < 3500) {
        continue;
      }

      let isBreached = false;

      switch (alert.condition) {
        case 'crossing':
          isBreached =
            (previousPrice < alert.price && currentPrice >= alert.price) ||
            (previousPrice > alert.price && currentPrice <= alert.price);
          break;
        case 'crossing_up':
          isBreached = previousPrice < alert.price && currentPrice >= alert.price;
          break;
        case 'crossing_down':
          isBreached = previousPrice > alert.price && currentPrice <= alert.price;
          break;
        case 'greater_than':
          isBreached = currentPrice >= alert.price;
          break;
        case 'less_than':
          isBreached = currentPrice <= alert.price;
          break;
        case 'price_reach':
          isBreached =
            Math.abs(currentPrice - alert.price) / alert.price <= 0.0003 ||
            (previousPrice < alert.price && currentPrice >= alert.price) ||
            (previousPrice > alert.price && currentPrice <= alert.price);
          break;
        case 'price_rise':
          isBreached = previousPrice < alert.price && currentPrice >= alert.price;
          break;
        case 'price_drop':
          isBreached = previousPrice > alert.price && currentPrice <= alert.price;
          break;
        case 'candle_close_above':
        case 'candle_close_below':
          // Evaluated on bar close via checkBarClose()
          break;
      }

      if (isBreached) {
        this.triggerAlert(alert, currentPrice);
      }
    }

    this.saveToStorage();
  }

  private dispatchSystemNotification(alert: PriceAlert, currentPrice: number) {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const alertName = alert.name || alert.symbol;
        const title = `🚨 Price Alert Triggered: ${alertName}`;
        const conditionLabel = alert.condition.replace(/_/g, ' ');
        const body = `${alert.symbol} triggered (${conditionLabel}) at ${alert.price.toLocaleString()} USDT! Current: ${currentPrice.toLocaleString()} USDT${
          alert.note ? `\nNote: ${alert.note}` : ''
        }`;

        new Notification(title, {
          body,
          tag: alert.id,
          requireInteraction: false,
        });
      } catch {
        // Non-blocking
      }
    }
  }
}

export const alertEngine = new AlertEngine();
