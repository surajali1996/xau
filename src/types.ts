// Shared frontend types for the Binance Futures TradingView terminal.

export type PriceType = 'last' | 'mark' | 'index';

// ---------- Market data ----------

export interface CandleData {
  time: number; // UNIX seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTimeMs?: number;
}

export interface OHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
}

export interface Ticker24h {
  symbol: string;
  pairDisplay: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

// ---------- Drawings ----------

export type DrawingTool =
  | 'cursor'
  | 'horizontal_line'
  | 'horizontal_ray'
  | 'vertical_line'
  | 'cross_line'
  | 'trendline'
  | 'ray'
  | 'extended_line'
  | 'arrow'
  | 'arrow_marker'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'polyline'
  | 'brush'
  | 'text'
  | 'price_label'
  | 'parallel_channel'
  | 'fibonacci'
  | 'fibonacci_extension'
  | 'fibonacci_channel'
  | 'fibonacci_timezones'
  | 'price_percentage_measure'
  | 'price_range'
  | 'date_range'
  | 'date_and_price_range'
  // TradingView-style additions
  | 'info_line'
  | 'trend_angle'
  | 'triangle'
  | 'highlighter'
  | 'callout'
  | 'pitchfork'
  | 'long_position'
  | 'short_position';

export type LineStyleType = 'solid' | 'dashed' | 'dotted';

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface DrawingItem {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  color: string;
  lineWidth: number;
  lineStyle?: LineStyleType;
  extendLeft?: boolean;
  extendRight?: boolean;
  extendUp?: boolean;
  extendDown?: boolean;
  fillColor?: string;
  fillOpacity?: number;
  fontSize?: number;
  text?: string;
  brushPoints?: DrawingPoint[];
  locked?: boolean;
  hidden?: boolean;
  // Extended TradingView-style properties
  textColor?: string;
  bold?: boolean;
  italic?: boolean;
  showBackground?: boolean; // fill on/off for shapes, fib backgrounds, channels
  showLabels?: boolean; // fib level / price labels on/off
  showStats?: boolean; // info line / measure stats on/off
  levels?: FibLevel[]; // custom fibonacci levels
  reverse?: boolean; // reverse fibonacci direction
  accountSize?: number; // long / short position calculator
  riskPercent?: number;
  middleLine?: boolean; // parallel channel middle line
}

export interface FibLevel {
  ratio: number;
  color: string;
  enabled: boolean;
}

export interface DrawingSettings {
  color: string;
  lineWidth: number;
  lineStyle: LineStyleType;
  extendLeft: boolean;
  extendRight: boolean;
  extendUp?: boolean;
  extendDown?: boolean;
  fillColor?: string;
  fillOpacity: number;
  fontSize?: number;
}

// ---------- Price scale ----------

export interface PriceScaleCustomSettings {
  autoScale: boolean;
  lockPriceScale: boolean;
  invertScale: boolean;
  mode: number; // lightweight-charts PriceScaleMode
  position: 'left' | 'right';
  precision: 'auto' | number | string;
}

// ---------- Bar replay ----------

export type ReplaySpeed = 0.5 | 1 | 2 | 3 | 5 | 10;

export interface ReplayState {
  isActive: boolean;
  isSelectingCutoff: boolean;
  isPlaying: boolean;
  speed: ReplaySpeed;
  currentIndex: number;
  allCandles: CandleData[];
  cutoffTime?: number;
}

// ---------- Alerts ----------

export type AlertCondition =
  | 'crossing'
  | 'crossing_up'
  | 'crossing_down'
  | 'greater_than'
  | 'less_than'
  | 'price_reach'
  | 'candle_close_above'
  | 'candle_close_below'
  | 'price_rise'
  | 'price_drop';

export type AlertStatus = 'active' | 'triggered' | 'disabled';

export type AlertRepeatType = 'once' | 'every_time' | 'once_per_bar' | 'once_per_bar_close';

export type AlertSoundType =
  | 'price_reach'
  | 'price_rise'
  | 'price_drop'
  | 'price_cross_above'
  | 'price_cross_below';

export interface PriceAlert {
  id: string;
  symbol: string;
  name?: string;
  price: number;
  condition: AlertCondition;
  createdPrice: number;
  repeat: AlertRepeatType;
  timeframe?: string;
  expiration?: string;
  expirationTimestamp?: number;
  note?: string;
  sound: AlertSoundType;
  vibrate?: boolean;
  browserNotification?: boolean;
  pushNotification?: boolean;
  priceType?: PriceType;
  status: AlertStatus;
  triggered: boolean;
  triggeredAt?: number;
  createdAt: number;
}

export interface AlertEngineSettings {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  volume: number;
}
