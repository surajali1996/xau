import { CandleData, PriceType, Ticker24h } from '../types';

const REST_BASE = 'https://fapi.binance.com';
const WS_STREAM_BASE = 'wss://fstream.binance.com/stream';
const WS_SINGLE_BASE = 'wss://fstream.binance.com/ws';

export const STANDARD_TIMEFRAMES = [
  { label: '1m', value: '1m', minutes: 1 },
  { label: '3m', value: '3m', minutes: 3 },
  { label: '5m', value: '5m', minutes: 5 },
  { label: '15m', value: '15m', minutes: 15 },
  { label: '30m', value: '30m', minutes: 30 },
  { label: '1h', value: '1h', minutes: 60 },
  { label: '4h', value: '4h', minutes: 240 },
  { label: '1D', value: '1d', minutes: 1440 },
  { label: '1W', value: '1w', minutes: 10080 },
];

/**
 * Parses any interval string (e.g. '1m', '7m', '3h', '2d') into duration in minutes.
 */
export function parseIntervalToMinutes(interval: string): number {
  const match = interval.match(/^(\d+)([mhdDwW])$/);
  if (!match) return 1;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'm':
      return num;
    case 'h':
      return num * 60;
    case 'd':
      return num * 1440;
    case 'w':
      return num * 10080;
    default:
      return num;
  }
}

/**
 * Checks whether an interval is natively supported by Binance Futures klines.
 */
export function isNativeBinanceInterval(interval: string): boolean {
  const native = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];
  return native.includes(interval);
}

/**
 * Resamples 1-minute historical candles into custom minute buckets.
 */
export function resampleCandles(raw1mCandles: CandleData[], targetMinutes: number): CandleData[] {
  if (targetMinutes <= 1 || raw1mCandles.length === 0) {
    return raw1mCandles;
  }

  const bucketSeconds = targetMinutes * 60;
  const buckets = new Map<number, CandleData>();

  for (const candle of raw1mCandles) {
    const bucketTime = Math.floor(candle.time / bucketSeconds) * bucketSeconds;
    const existing = buckets.get(bucketTime);

    if (!existing) {
      buckets.set(bucketTime, {
        time: bucketTime,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        closeTimeMs: (bucketTime + bucketSeconds) * 1000 - 1,
      });
    } else {
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
      existing.close = candle.close;
      existing.volume += candle.volume;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

/**
 * Fetches historical candles from Binance Futures.
 * Supports Last Price, Mark Price, and Index Price.
 */
export async function fetchHistoricalKlines(
  symbol: string,
  interval: string,
  priceType: PriceType = 'last',
  limit: number = 1000
): Promise<CandleData[]> {
  const isCustom = !isNativeBinanceInterval(interval);
  const fetchInterval = isCustom ? '1m' : interval;
  const fetchLimit = isCustom ? Math.min(1500, Math.max(limit * parseIntervalToMinutes(interval), 1000)) : limit;

  let endpoint = `${REST_BASE}/fapi/v1/klines?symbol=${symbol}&interval=${fetchInterval}&limit=${fetchLimit}`;
  if (priceType === 'mark') {
    endpoint = `${REST_BASE}/fapi/v1/markPriceKlines?symbol=${symbol}&interval=${fetchInterval}&limit=${fetchLimit}`;
  } else if (priceType === 'index') {
    endpoint = `${REST_BASE}/fapi/v1/indexPriceKlines?pair=${symbol}&interval=${fetchInterval}&limit=${fetchLimit}`;
  }

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${priceType} klines for ${symbol}: ${response.statusText}`);
  }

  const data = await response.json();
  const rawCandles: CandleData[] = data.map((item: (number | string)[]) => ({
    time: Math.floor(Number(item[0]) / 1000), // seconds
    open: parseFloat(item[1] as string),
    high: parseFloat(item[2] as string),
    low: parseFloat(item[3] as string),
    close: parseFloat(item[4] as string),
    volume: parseFloat((item[5] as string) || '0'),
    closeTimeMs: Number(item[6]),
  }));

  if (isCustom) {
    const minutes = parseIntervalToMinutes(interval);
    return resampleCandles(rawCandles, minutes);
  }

  return rawCandles;
}

let cachedTickers: Ticker24h[] = [];

/**
 * Returns currently cached 24h tickers.
 */
export function getCachedTickers(): Ticker24h[] {
  return cachedTickers;
}

/**
 * Returns watchlist symbols in the exact order as the Watchlist:
 * sorted by 24h quote volume descending (top 100 USDT.P pairs).
 */
export function getWatchlistSymbols(): string[] {
  if (cachedTickers.length === 0) {
    return [
      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
      'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'SUIUSDT',
      'NEARUSDT', 'APTUSDT', 'TRXUSDT', 'LTCUSDT', 'DOTUSDT',
      'RENDERUSDT', 'PEPEUSDT', 'SHIBUSDT', 'WIFUSDT', 'FETUSDT',
      'TAOUSDT', 'INJUSDT', 'ARBUSDT', 'OPUSDT', 'TIAUSDT',
    ];
  }
  const sorted = [...cachedTickers].sort((a, b) => b.quoteVolume - a.quoteVolume);
  return sorted.slice(0, 100).map((t) => t.symbol);
}

/**
 * Fetches 24hr Ticker data for all Binance Futures USDT-Margined pairs.
 */
export async function fetch24hTickers(): Promise<Ticker24h[]> {
  const response = await fetch(`${REST_BASE}/fapi/v1/ticker/24hr`);
  if (!response.ok) {
    throw new Error(`Failed to fetch 24hr tickers: ${response.statusText}`);
  }

  const data = await response.json();
  const usdtPairs = data.filter((item: { symbol: string }) => 
    item.symbol.endsWith('USDT') && !item.symbol.includes('_')
  );

  const parsed = usdtPairs.map((item: {
    symbol: string;
    lastPrice: string;
    priceChange: string;
    priceChangePercent: string;
    highPrice: string;
    lowPrice: string;
    volume: string;
    quoteVolume: string;
  }) => ({
    symbol: item.symbol,
    pairDisplay: `${item.symbol}.P`,
    lastPrice: parseFloat(item.lastPrice),
    priceChange: parseFloat(item.priceChange),
    priceChangePercent: parseFloat(item.priceChangePercent),
    highPrice: parseFloat(item.highPrice),
    lowPrice: parseFloat(item.lowPrice),
    volume: parseFloat(item.volume),
    quoteVolume: parseFloat(item.quoteVolume),
  }));

  cachedTickers = parsed;
  return parsed;
}

/**
 * Fetches single price tick from Binance Futures REST.
 */
export async function fetchSinglePriceTick(symbol: string, priceType: PriceType): Promise<number | null> {
  try {
    if (priceType === 'last') {
      const res = await fetch(`${REST_BASE}/fapi/v1/ticker/price?symbol=${symbol}`);
      if (res.ok) {
        const json = await res.json();
        return parseFloat(json.price);
      }
    } else {
      const res = await fetch(`${REST_BASE}/fapi/v1/premiumIndex?symbol=${symbol}`);
      if (res.ok) {
        const json = await res.json();
        return priceType === 'mark' ? parseFloat(json.markPrice) : parseFloat(json.indexPrice);
      }
    }
  } catch {
    // Non-blocking
  }
  return null;
}

export type CandleUpdateCallback = (candle: CandleData, isClosed: boolean) => void;
export type LiveTickCallback = (price: number, priceType: PriceType) => void;

/**
 * Real-time Hybrid Stream & Tick Manager.
 * Uses both combined WebSocket streams (kline + aggTrade) and high-frequency REST polling fallback
 * so that live candle movements occur dynamically on every trade.
 */
export class BinanceStreamManager {
  private ws: WebSocket | null = null;
  private currentSymbol: string = '';
  private currentInterval: string = '';
  private currentPriceType: PriceType = 'last';
  private onCandleUpdate: CandleUpdateCallback | null = null;
  private onTick: LiveTickCallback | null = null;
  private isPaused: boolean = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollIntervalTimer: ReturnType<typeof setInterval> | null = null;
  private activeCandle: CandleData | null = null;
  private lastWsMessageTime: number = 0;
  private isDestroyed: boolean = false;

  public subscribe(
    symbol: string,
    interval: string,
    priceType: PriceType,
    onCandleUpdate: CandleUpdateCallback,
    onTick?: LiveTickCallback
  ) {
    this.currentSymbol = symbol;
    this.currentInterval = interval;
    this.currentPriceType = priceType;
    this.onCandleUpdate = onCandleUpdate;
    this.onTick = onTick || null;
    this.isPaused = false;
    this.lastWsMessageTime = 0;

    this.connectWs();
    this.startPollingFallback();
  }

  public setActiveCandle(candle: CandleData | null) {
    if (candle) {
      this.activeCandle = { ...candle };
    } else {
      this.activeCandle = null;
    }
  }

  public setPaused(paused: boolean) {
    this.isPaused = paused;
  }

  /**
   * Applies an incoming live trade or mark price tick to the current active candle.
   */
  public applyLiveTick(price: number, quantity: number = 0) {
    if (this.isPaused || !this.activeCandle) return;

    const now = Date.now();
    const intervalMinutes = parseIntervalToMinutes(this.currentInterval);
    const bucketSeconds = intervalMinutes * 60;

    // Check if current candle has closed and a new bucket has begun
    const currentBucket = Math.floor(this.activeCandle.time / bucketSeconds) * bucketSeconds;
    const nowBucket = Math.floor(Math.floor(now / 1000) / bucketSeconds) * bucketSeconds;

    if (nowBucket > currentBucket) {
      // Current candle closed, emit closed candle
      if (this.onCandleUpdate) {
        this.onCandleUpdate(this.activeCandle, true);
      }

      // Initialize brand new live candle
      const newCandle: CandleData = {
        time: nowBucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: quantity,
        closeTimeMs: (nowBucket + bucketSeconds) * 1000 - 1,
      };
      this.activeCandle = newCandle;
      if (this.onCandleUpdate) {
        this.onCandleUpdate(newCandle, false);
      }
    } else {
      // Update ongoing candle
      const updated: CandleData = {
        ...this.activeCandle,
        high: Math.max(this.activeCandle.high, price),
        low: Math.min(this.activeCandle.low, price),
        close: price,
        volume: this.activeCandle.volume + (quantity || 0),
      };
      this.activeCandle = updated;
      if (this.onCandleUpdate) {
        this.onCandleUpdate(updated, false);
      }
    }

    if (this.onTick) {
      this.onTick(price, this.currentPriceType);
    }
  }

  private connectWs() {
    if (this.isDestroyed) return;
    this.cleanupWs();

    const symbolLower = this.currentSymbol.toLowerCase();
    const isCustom = !isNativeBinanceInterval(this.currentInterval);
    const klineInterval = isCustom ? '1m' : this.currentInterval;

    let wsUrl = '';
    if (this.currentPriceType === 'last') {
      // Connect combined stream: aggregate trades for tick movement + klines for structure
      wsUrl = `${WS_STREAM_BASE}?streams=${symbolLower}@aggTrade/${symbolLower}@kline_${klineInterval}`;
    } else {
      // For Mark and Index: 1s mark price updates
      wsUrl = `${WS_SINGLE_BASE}/${symbolLower}@markPrice@1s`;
    }

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.lastWsMessageTime = Date.now();
      };

      this.ws.onmessage = (event) => {
        if (this.isPaused || !event.data) return;
        this.lastWsMessageTime = Date.now();

        try {
          const raw = JSON.parse(event.data);
          const data = raw.data || raw;

          if (data.e === 'aggTrade') {
            const tradePrice = parseFloat(data.p);
            const qty = parseFloat(data.q || '0');
            this.applyLiveTick(tradePrice, qty);
          } else if (data.e === 'kline') {
            const k = data.k;
            const klinePrice = parseFloat(k.c);
            const klineOpen = parseFloat(k.o);
            const klineHigh = parseFloat(k.h);
            const klineLow = parseFloat(k.l);
            const klineVol = parseFloat(k.v || '0');
            const klineTime = Math.floor(k.t / 1000);
            const isClosed = k.x;

            if (isCustom) {
              this.applyLiveTick(klinePrice, klineVol);
            } else {
              if (this.activeCandle && this.activeCandle.time === klineTime) {
                this.activeCandle = {
                  time: klineTime,
                  open: klineOpen,
                  high: Math.max(this.activeCandle.high, klineHigh),
                  low: Math.min(this.activeCandle.low, klineLow),
                  close: klinePrice,
                  volume: klineVol,
                  closeTimeMs: k.T,
                };
              } else {
                this.activeCandle = {
                  time: klineTime,
                  open: klineOpen,
                  high: klineHigh,
                  low: klineLow,
                  close: klinePrice,
                  volume: klineVol,
                  closeTimeMs: k.T,
                };
              }

              if (this.onCandleUpdate) {
                this.onCandleUpdate(this.activeCandle, isClosed);
              }
              if (this.onTick) {
                this.onTick(klinePrice, 'last');
              }
            }
          } else if (data.e === 'markPriceUpdate') {
            const markPrice = parseFloat(data.p);
            const indexPrice = parseFloat(data.i);
            const targetPrice = this.currentPriceType === 'mark' ? markPrice : indexPrice;
            this.applyLiveTick(targetPrice, 0);
          }
        } catch {
          // Ignore parse errors
        }
      };

      this.ws.onerror = () => {
        this.scheduleReconnect();
      };

      this.ws.onclose = () => {
        if (!this.isDestroyed) {
          this.scheduleReconnect();
        }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  /**
   * High-frequency fallback: If WebSocket doesn't fire for >1000ms, poll live price every 500ms
   * so the candle never sits still.
   */
  private startPollingFallback() {
    if (this.pollIntervalTimer) {
      clearInterval(this.pollIntervalTimer);
    }

    this.pollIntervalTimer = setInterval(async () => {
      if (this.isPaused || this.isDestroyed) return;

      const timeSinceWs = Date.now() - this.lastWsMessageTime;
      // If WS is quiet or disconnected, poll active price
      if (timeSinceWs > 1000 || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        const livePrice = await fetchSinglePriceTick(this.currentSymbol, this.currentPriceType);
        if (livePrice !== null) {
          this.applyLiveTick(livePrice);
        }
      }
    }, 600);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.isDestroyed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isDestroyed && this.currentSymbol) {
        this.connectWs();
      }
    }, 2500);
  }

  private cleanupWs() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.pollIntervalTimer) {
      clearInterval(this.pollIntervalTimer);
      this.pollIntervalTimer = null;
    }
    this.cleanupWs();
    this.onCandleUpdate = null;
    this.onTick = null;
    this.activeCandle = null;
  }
}
