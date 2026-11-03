/**
 * Binance USDⓈ-M Futures REST API Client
 * Uses public endpoints exclusively (no trading keys needed)
 * Endpoint: https://fapi.binance.com
 */

export interface BinanceTickerPrice {
  symbol: string;
  price: string;
  time: number;
}

export interface BinancePremiumIndex {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  estimatedSettlePrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  interestRate: string;
  time: number;
}

export interface MarketPriceSnapshot {
  lastPrice?: number;
  markPrice?: number;
  indexPrice?: number;
}

/**
 * Fetches batch market prices (Last, Mark, and Index) for requested Binance USD-M symbols
 */
export async function fetchBinanceFuturesPrices(
  symbols: Set<string>
): Promise<Map<string, MarketPriceSnapshot>> {
  const resultMap = new Map<string, MarketPriceSnapshot>();
  if (symbols.size === 0) return resultMap;

  try {
    // 1. Fetch all Premium Index data (gives Mark Price & Index Price in a single fast call)
    const premiumPromise = fetch('https://fapi.binance.com/fapi/v1/premiumIndex', {
      headers: { 'User-Agent': 'BinanceFuturesAlertBot/1.0' },
    }).then(async (res) => {
      if (!res.ok) return [];
      return (await res.json()) as BinancePremiumIndex[];
    });

    // 2. Fetch all Ticker Prices (gives Last Price in a single fast call)
    const tickerPromise = fetch('https://fapi.binance.com/fapi/v1/ticker/price', {
      headers: { 'User-Agent': 'BinanceFuturesAlertBot/1.0' },
    }).then(async (res) => {
      if (!res.ok) return [];
      return (await res.json()) as BinanceTickerPrice[];
    });

    const [premiumData, tickerData] = await Promise.all([premiumPromise, tickerPromise]);

    // Populate Last Prices
    if (Array.isArray(tickerData)) {
      for (const item of tickerData) {
        if (symbols.has(item.symbol)) {
          const snapshot = resultMap.get(item.symbol) || {};
          snapshot.lastPrice = parseFloat(item.price);
          resultMap.set(item.symbol, snapshot);
        }
      }
    }

    // Populate Mark & Index Prices
    if (Array.isArray(premiumData)) {
      for (const item of premiumData) {
        if (symbols.has(item.symbol)) {
          const snapshot = resultMap.get(item.symbol) || {};
          snapshot.markPrice = parseFloat(item.markPrice);
          snapshot.indexPrice = parseFloat(item.indexPrice);
          resultMap.set(item.symbol, snapshot);
        }
      }
    }
  } catch (err) {
    console.error('Error fetching Binance Futures prices:', err);
  }

  return resultMap;
}

/**
 * Verifies closed candle for Candle Close alerts
 * Returns { isClosed: boolean, closePrice: number }
 */
export async function getLatestClosedCandle(
  symbol: string,
  interval: string
): Promise<{ isClosed: boolean; closePrice: number } | null> {
  try {
    // Fetch last 2 klines to get the preceding completed/closed candle
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=2`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BinanceFuturesAlertBot/1.0' },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as any[];
    if (!Array.isArray(data) || data.length < 2) return null;

    // The first item (index 0) in limit=2 is the previous closed candle
    const closedCandle = data[0];
    const closePrice = parseFloat(closedCandle[4]);

    return {
      isClosed: true,
      closePrice,
    };
  } catch {
    return null;
  }
}
