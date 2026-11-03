import React, { useState, useEffect, useMemo } from 'react';
import { Search, TrendingUp, TrendingDown, Flame, DollarSign, X } from 'lucide-react';
import { Ticker24h } from '../types';
import { fetch24hTickers } from '../services/binanceService';

interface WatchlistProps {
  currentSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

type WatchlistTab = 'market_cap' | 'gainers' | 'losers' | 'volume';

export const Watchlist: React.FC<WatchlistProps> = ({
  currentSymbol,
  onSelectSymbol,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<WatchlistTab>('market_cap');
  const [searchQuery, setSearchQuery] = useState('');
  const [tickers, setTickers] = useState<Ticker24h[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());

  // Fetch 24hr tickers periodically
  useEffect(() => {
    let isMounted = true;

    const loadTickers = async () => {
      try {
        const data = await fetch24hTickers();
        if (isMounted) {
          setTickers(data);
          setLastUpdated(Date.now());
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) setIsLoading(false);
      }
    };

    loadTickers();
    const interval = setInterval(loadTickers, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Filter and sort tickers based on tab & search query
  const filteredTickers = useMemo(() => {
    let result = [...tickers];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toUpperCase();
      result = result.filter(
        (t) => t.symbol.includes(q) || t.pairDisplay.includes(q)
      );
    }

    // Sort by tab
    switch (activeTab) {
      case 'market_cap':
        // Filter top 100 USDT pairs by quote volume as proxy for market presence & activity
        result.sort((a, b) => b.quoteVolume - a.quoteVolume);
        result = result.slice(0, 100);
        break;
      case 'gainers':
        result.sort((a, b) => b.priceChangePercent - a.priceChangePercent);
        break;
      case 'losers':
        result.sort((a, b) => a.priceChangePercent - b.priceChangePercent);
        break;
      case 'volume':
        result.sort((a, b) => b.quoteVolume - a.quoteVolume);
        break;
    }

    return result;
  }, [tickers, activeTab, searchQuery]);

  const formatVolume = (val: number): string => {
    if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  };

  const formatPrice = (price: number): string => {
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(3);
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
  };

  if (!isOpen) return null;

  return (
    <aside
      className="w-80 md:w-84 h-full bg-[#131722] border-l border-[#2B2F3A] flex flex-col shrink-0 select-none z-30 transition-all duration-200"
      aria-label="Watchlist"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2B2F3A] bg-[#1E222D]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#D1D4DC]">
            Binance USDT.P
          </span>
          <span className="text-[10px] text-[#787B86] tabular-nums">
            {filteredTickers.length} pairs
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] rounded transition-colors"
          title="Close Watchlist"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search Input */}
      <div className="px-3 py-2 border-b border-[#2B2F3A] bg-[#131722]">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-[#787B86] absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search coin (e.g. BTC, SOL)..."
            className="w-full bg-[#1E222D] text-xs text-[#D1D4DC] pl-8 pr-7 py-1.5 rounded border border-transparent focus:border-[#2962FF] focus:outline-none placeholder-[#787B86]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-[#787B86] hover:text-[#D1D4DC]"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Multi-Tab Selector */}
      <div className="grid grid-cols-4 border-b border-[#2B2F3A] bg-[#1E222D] text-[11px] font-medium text-[#787B86]">
        <button
          onClick={() => setActiveTab('market_cap')}
          className={`py-2 px-1 text-center transition-colors border-b-2 flex flex-col items-center gap-0.5 ${
            activeTab === 'market_cap'
              ? 'border-[#2962FF] text-[#D1D4DC] bg-[#131722]'
              : 'border-transparent hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
          }`}
          title="Top 100 USDT Futures"
        >
          <Flame className="w-3.5 h-3.5" />
          <span className="truncate">Top 100</span>
        </button>
        <button
          onClick={() => setActiveTab('gainers')}
          className={`py-2 px-1 text-center transition-colors border-b-2 flex flex-col items-center gap-0.5 ${
            activeTab === 'gainers'
              ? 'border-[#089981] text-[#089981] bg-[#131722]'
              : 'border-transparent hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
          }`}
          title="Top Gainers"
        >
          <TrendingUp className="w-3.5 h-3.5 text-[#089981]" />
          <span className="truncate">Gainers</span>
        </button>
        <button
          onClick={() => setActiveTab('losers')}
          className={`py-2 px-1 text-center transition-colors border-b-2 flex flex-col items-center gap-0.5 ${
            activeTab === 'losers'
              ? 'border-[#F23645] text-[#F23645] bg-[#131722]'
              : 'border-transparent hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
          }`}
          title="Top Losers"
        >
          <TrendingDown className="w-3.5 h-3.5 text-[#F23645]" />
          <span className="truncate">Losers</span>
        </button>
        <button
          onClick={() => setActiveTab('volume')}
          className={`py-2 px-1 text-center transition-colors border-b-2 flex flex-col items-center gap-0.5 ${
            activeTab === 'volume'
              ? 'border-[#2962FF] text-[#D1D4DC] bg-[#131722]'
              : 'border-transparent hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
          }`}
          title="Top 24h Volume"
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span className="truncate">Volume</span>
        </button>
      </div>

      {/* Table Headers */}
      <div className="grid grid-cols-12 px-3 py-1.5 bg-[#181B24] border-b border-[#2B2F3A] text-[10px] uppercase font-semibold text-[#787B86]">
        <div className="col-span-5 text-left">Symbol</div>
        <div className="col-span-4 text-right">Last Price</div>
        <div className="col-span-3 text-right">24h %</div>
      </div>

      {/* Coin Rows List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#1E222D]">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-[#787B86]">
            <div className="w-5 h-5 border-2 border-[#2962FF] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading Binance USDT.P pairs...
          </div>
        ) : filteredTickers.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#787B86]">
            No coins matching &quot;{searchQuery}&quot;
          </div>
        ) : (
          filteredTickers.map((ticker) => {
            const isSelected = ticker.symbol === currentSymbol;
            const isPositive = ticker.priceChangePercent >= 0;

            return (
              <button
                key={ticker.symbol}
                onClick={() => onSelectSymbol(ticker.symbol)}
                className={`w-full grid grid-cols-12 items-center px-3 py-2 text-left text-xs transition-colors group cursor-pointer ${
                  isSelected
                    ? 'bg-[#2A2E39] border-l-2 border-[#2962FF]'
                    : 'hover:bg-[#1E222D]'
                }`}
              >
                {/* Symbol & Volume */}
                <div className="col-span-5 flex flex-col min-w-0 pr-1">
                  <span className="font-semibold text-[#D1D4DC] truncate group-hover:text-white">
                    {ticker.pairDisplay}
                  </span>
                  <span className="text-[10px] text-[#787B86] tabular-nums truncate">
                    Vol: {formatVolume(ticker.quoteVolume)}
                  </span>
                </div>

                {/* Last Price */}
                <div className="col-span-4 text-right tabular-nums font-mono font-medium text-[#D1D4DC]">
                  {formatPrice(ticker.lastPrice)}
                </div>

                {/* 24h Change */}
                <div
                  className={`col-span-3 text-right tabular-nums font-mono font-semibold text-[11px] ${
                    isPositive ? 'text-[#089981]' : 'text-[#F23645]'
                  }`}
                >
                  {isPositive ? '+' : ''}
                  {ticker.priceChangePercent.toFixed(2)}%
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Watchlist Footer */}
      <div className="px-3 py-2 border-t border-[#2B2F3A] bg-[#181B24] flex items-center justify-between text-[10px] text-[#787B86]">
        <span>Auto-sync 5s</span>
        <span className="tabular-nums">
          Updated: {new Date(lastUpdated).toLocaleTimeString()}
        </span>
      </div>
    </aside>
  );
};
