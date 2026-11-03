// Cloudflare Worker and D1 Database Types
export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  all<T = any>(): Promise<{ results?: T[]; success: boolean; error?: string }>;
  first<T = any>(colName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: any }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = any>(statements: D1PreparedStatement[]): Promise<any[]>;
  exec(query: string): Promise<any>;
}

export interface ScheduledEvent {
  cron: string;
  type: string;
  scheduledTime: number;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

export interface Env {
  DB: D1Database;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  ALLOWED_ORIGIN?: string;
  ENVIRONMENT?: string;
}

export type PriceType = 'last' | 'mark' | 'index';

export type AlertCondition =
  | 'crossing_up'
  | 'crossing_down'
  | 'greater_than'
  | 'less_than'
  | 'price_reach'
  | 'candle_close_above'
  | 'candle_close_below';

export type AlertStatus = 'active' | 'triggered' | 'disabled';

export type AlertRepeatType = 'once' | 'every_time' | 'once_per_bar' | 'once_per_bar_close';

export interface DbAlert {
  id: string;
  user_id: string;
  symbol: string;
  condition: AlertCondition;
  price: number;
  created_price: number;
  last_checked_price?: number | null;
  status: AlertStatus;
  repeat: AlertRepeatType;
  price_type: PriceType;
  timeframe: string;
  name?: string | null;
  note?: string | null;
  sound?: string | null;
  vibrate: number;
  push_enabled: number;
  triggered: number;
  triggered_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface DbPushSubscription {
  id: string;
  user_id: string;
  fcm_token: string;
  device_name?: string | null;
  user_agent?: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface DbAlertEvent {
  id: string;
  alert_id: string;
  user_id: string;
  symbol: string;
  condition: string;
  target_price: number;
  triggered_price: number;
  price_type: string;
  message: string;
  created_at: number;
}
