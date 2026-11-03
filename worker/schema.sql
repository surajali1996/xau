-- Cloudflare D1 Database Schema for Binance Futures Alert System
-- Migrations / Initial Schema

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 2. Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  condition TEXT NOT NULL,
  price REAL NOT NULL,
  created_price REAL NOT NULL,
  last_checked_price REAL,
  status TEXT DEFAULT 'active', -- 'active', 'triggered', 'disabled'
  repeat TEXT DEFAULT 'once',   -- 'once', 'every_time', 'once_per_bar', 'once_per_bar_close'
  price_type TEXT DEFAULT 'last', -- 'last', 'mark', 'index'
  timeframe TEXT DEFAULT '15m',
  name TEXT,
  note TEXT,
  sound TEXT DEFAULT 'price_reach',
  vibrate INTEGER DEFAULT 1,
  push_enabled INTEGER DEFAULT 1,
  triggered INTEGER DEFAULT 0,
  triggered_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol);
CREATE INDEX IF NOT EXISTS idx_alerts_active_symbol ON alerts(status, symbol);

-- 3. Push Subscriptions Table (FCM Tokens for Android / Web Push)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fcm_token TEXT UNIQUE NOT NULL,
  device_name TEXT,
  user_agent TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_token ON push_subscriptions(fcm_token);
CREATE INDEX IF NOT EXISTS idx_push_active ON push_subscriptions(is_active);

-- 4. Alert Events Table (Historical Trigger Log)
CREATE TABLE IF NOT EXISTS alert_events (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  condition TEXT NOT NULL,
  target_price REAL NOT NULL,
  triggered_price REAL NOT NULL,
  price_type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_user_id ON alert_events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_alert_id ON alert_events(alert_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON alert_events(created_at DESC);

-- 5. Device Settings Table
CREATE TABLE IF NOT EXISTS device_settings (
  user_id TEXT PRIMARY KEY,
  push_enabled INTEGER DEFAULT 1,
  sound_enabled INTEGER DEFAULT 1,
  vibration_enabled INTEGER DEFAULT 1,
  volume REAL DEFAULT 0.8,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
