import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PriceType,
  DrawingTool,
  DrawingItem,
  PriceAlert,
  ReplayState,
  CandleData,
  DrawingSettings,
  ReplaySpeed,
} from './types';
import { TradingChart } from './components/TradingChart';
import { DrawingToolbar } from './components/DrawingToolbar';
import { Watchlist } from './components/Watchlist';
import { BarReplayEngine } from './components/BarReplayEngine';
import { AlertModal } from './components/AlertModal';
import { CustomTimeframeModal } from './components/CustomTimeframeModal';
import { DrawingSettingsModal } from './components/DrawingSettingsModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { alertEngine } from './services/alertEngine';
import { fetchHistoricalKlines, fetch24hTickers, getWatchlistSymbols } from './services/binanceService';
import {
  ListFilter,
  Rewind,
  Bell,
  Volume2,
  VolumeX,
  X,
  Radio,
} from 'lucide-react';

export default function App() {
  // Chart Core State
  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [interval, setIntervalState] = useState<string>('15m');
  const [priceType, setPriceType] = useState<PriceType>('last');
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>(() => getWatchlistSymbols());

  // Periodically update watchlist symbol order from Binance Futures
  useEffect(() => {
    let isMounted = true;
    const updateSymbols = async () => {
      try {
        await fetch24hTickers();
        if (isMounted) {
          const symbols = getWatchlistSymbols();
          if (symbols.length > 0) {
            setWatchlistSymbols(symbols);
          }
        }
      } catch {
        // Keep existing
      }
    };
    updateSymbols();
    const timer = setInterval(updateSymbols, 10000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  // Quick Coin Switching: Next / Previous coin in Watchlist
  const handleNextSymbol = useCallback(() => {
    setWatchlistSymbols((currentList) => {
      const list = currentList.length > 0 ? currentList : getWatchlistSymbols();
      const currentIndex = list.indexOf(symbol);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % list.length;
      const nextSymbol = list[nextIndex];
      setSymbol(nextSymbol);
      return list;
    });
  }, [symbol]);

  const handlePrevSymbol = useCallback(() => {
    setWatchlistSymbols((currentList) => {
      const list = currentList.length > 0 ? currentList : getWatchlistSymbols();
      const currentIndex = list.indexOf(symbol);
      const prevIndex = currentIndex <= 0 ? list.length - 1 : currentIndex - 1;
      const prevSymbol = list[prevIndex];
      setSymbol(prevSymbol);
      return list;
    });
  }, [symbol]);

  // Drawing Tools State (Only 3 Tools: Horizontal Line, Rectangle, Price Range; No Cursor Mode)
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingTool | null>('horizontal_line');
  const [magnetMode, setMagnetMode] = useState<boolean>(false);
  const [isAllLocked, setIsAllLocked] = useState<boolean>(false);
  const [isAllHidden, setIsAllHidden] = useState<boolean>(false);

  // Collapsible Left Drawing Toolbar State
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tv_toolbar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // Favorite Tools State (Stored persistently)
  const [favoriteTools, setFavoriteTools] = useState<DrawingTool[]>(() => {
    try {
      const saved = localStorage.getItem('tv_favorite_tools_v1');
      if (saved) return JSON.parse(saved);
    } catch {
      // Keep defaults
    }
    return ['trendline', 'horizontal_line', 'rectangle', 'fibonacci', 'price_percentage_measure'];
  });

  // Drawings State (Loaded and saved per trading pair)
  const [drawings, setDrawings] = useState<DrawingItem[]>([]);
  const [undoStack, setUndoStack] = useState<DrawingItem[][]>([]);
  const [redoStack, setRedoStack] = useState<DrawingItem[][]>([]);

  // Load drawings when symbol changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tv_drawings_' + symbol);
      if (saved) {
        setDrawings(JSON.parse(saved));
      } else {
        setDrawings([]);
      }
    } catch {
      setDrawings([]);
    }
    setUndoStack([]);
    setRedoStack([]);
  }, [symbol]);

  // Persist drawings whenever they change for the current symbol
  const saveDrawingsForCurrentSymbol = useCallback(
    (updated: DrawingItem[], addToHistory = true) => {
      if (addToHistory) {
        setUndoStack((prev) => [...prev.slice(-30), drawings]);
        setRedoStack([]);
      }
      setDrawings(updated);
      try {
        localStorage.setItem('tv_drawings_' + symbol, JSON.stringify(updated));
      } catch {
        // Non-blocking
      }
    },
    [symbol, drawings]
  );

  const handleAddDrawing = (drawing: DrawingItem) => {
    const updated = [...drawings, drawing];
    saveDrawingsForCurrentSymbol(updated);
  };

  const handleUpdateDrawing = (drawing: DrawingItem) => {
    const updated = drawings.map((d) => (d.id === drawing.id ? drawing : d));
    saveDrawingsForCurrentSymbol(updated);
  };

  const handleDeleteDrawing = (id: string) => {
    const updated = drawings.filter((d) => d.id !== id);
    saveDrawingsForCurrentSymbol(updated);
  };

  const handleClearDrawings = () => {
    saveDrawingsForCurrentSymbol([]);
  };

  // Undo / Redo
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, drawings]);
    setUndoStack((u) => u.slice(0, -1));
    setDrawings(prev);
    try {
      localStorage.setItem('tv_drawings_' + symbol, JSON.stringify(prev));
    } catch {
      // Ignore
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, drawings]);
    setRedoStack((r) => r.slice(0, -1));
    setDrawings(next);
    try {
      localStorage.setItem('tv_drawings_' + symbol, JSON.stringify(next));
    } catch {
      // Ignore
    }
  };

  // Lock All / Hide All
  const handleToggleLockAll = () => {
    const nextLocked = !isAllLocked;
    setIsAllLocked(nextLocked);
    const updated = drawings.map((d) => ({ ...d, locked: nextLocked }));
    saveDrawingsForCurrentSymbol(updated, false);
  };

  const handleToggleHideAll = () => {
    const nextHidden = !isAllHidden;
    setIsAllHidden(nextHidden);
    const updated = drawings.map((d) => ({ ...d, hidden: nextHidden }));
    saveDrawingsForCurrentSymbol(updated, false);
  };

  // Toggle favorite status for drawing tools
  const handleToggleFavorite = (tool: DrawingTool) => {
    setFavoriteTools((prev) => {
      let next: DrawingTool[];
      if (prev.includes(tool)) {
        next = prev.filter((t) => t !== tool);
      } else {
        next = [...prev, tool];
      }
      try {
        localStorage.setItem('tv_favorite_tools_v1', JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const handleRemoveFavorite = (tool: DrawingTool) => {
    setFavoriteTools((prev) => {
      const next = prev.filter((t) => t !== tool);
      try {
        localStorage.setItem('tv_favorite_tools_v1', JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const handleMoveFavorite = (index: number, direction: 'left' | 'right') => {
    setFavoriteTools((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex >= 0 && targetIndex < next.length) {
        const temp = next[index];
        next[index] = next[targetIndex];
        next[targetIndex] = temp;
        try {
          localStorage.setItem('tv_favorite_tools_v1', JSON.stringify(next));
        } catch {
          // Ignore
        }
      }
      return next;
    });
  };

  const handleToggleToolbarCollapse = () => {
    setIsToolbarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('tv_toolbar_collapsed', String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const [drawingSettings, setDrawingSettings] = useState<DrawingSettings>(() => {
    try {
      const saved = localStorage.getItem('tv_drawing_settings_v1');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      color: '#2962FF',
      lineWidth: 2,
      lineStyle: 'solid',
      extendLeft: false,
      extendRight: true,
      extendUp: false,
      extendDown: false,
      fillColor: '#2962FF',
      fillOpacity: 0.15,
      fontSize: 14,
    };
  });

  const handleUpdateDrawingSettings = (newSettings: DrawingSettings) => {
    setDrawingSettings(newSettings);
    try {
      localStorage.setItem('tv_drawing_settings_v1', JSON.stringify(newSettings));
    } catch {}
  };

  // Watchlist Sidebar State
  const [isWatchlistOpen, setIsWatchlistOpen] = useState<boolean>(true);

  // Modals & Panels State
  const [isAlertModalOpen, setIsAlertModalOpen] = useState<boolean>(false);
  const [alertTargetPrice, setAlertTargetPrice] = useState<number | undefined>(undefined);
  const [isCustomTfModalOpen, setIsCustomTfModalOpen] = useState<boolean>(false);
  const [isDrawingSettingsModalOpen, setIsDrawingSettingsModalOpen] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(alertEngine.getSettings().soundEnabled);

  // Alerts Local State
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [activeAlertToasts, setActiveAlertToasts] = useState<
    { id: string; alert: PriceAlert; price: number; timestamp: number }[]
  >([]);

  // Bar Replay Engine State (0.5x, 1x, 2x, 3x, 5x, 10x)
  const [replayState, setReplayState] = useState<ReplayState>({
    isActive: false,
    isSelectingCutoff: false,
    isPlaying: false,
    speed: 1,
    currentIndex: 0,
    allCandles: [],
  });

  const replayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load and subscribe to price alerts
  useEffect(() => {
    setAlerts(alertEngine.getAlerts());

    const unsubscribe = alertEngine.subscribe((alert, triggeredPrice) => {
      const toastId = 'toast_' + Date.now();
      setActiveAlertToasts((prev) => [
        ...prev,
        { id: toastId, alert, price: triggeredPrice, timestamp: Date.now() },
      ]);
      setAlerts(alertEngine.getAlerts());

      setTimeout(() => {
        setActiveAlertToasts((prev) => prev.filter((t) => t.id !== toastId));
      }, 7000);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Bar Replay Ticker Loop
  useEffect(() => {
    if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }

    if (replayState.isActive && replayState.isPlaying) {
      const intervalMs = Math.round(1000 / replayState.speed);

      replayTimerRef.current = setInterval(() => {
        setReplayState((prev) => {
          if (!prev.isPlaying) return prev;
          if (prev.currentIndex >= prev.allCandles.length - 1) {
            return { ...prev, isPlaying: false };
          }
          return {
            ...prev,
            currentIndex: prev.currentIndex + 1,
          };
        });
      }, intervalMs);
    }

    return () => {
      if (replayTimerRef.current) {
        clearInterval(replayTimerRef.current);
      }
    };
  }, [replayState.isActive, replayState.isPlaying, replayState.speed]);

  const handleStartReplayWorkflow = async () => {
    if (replayState.isActive) {
      handleExitReplay();
      return;
    }

    try {
      const historical = await fetchHistoricalKlines(symbol, interval, priceType, 1000);
      setReplayState({
        isActive: true,
        isSelectingCutoff: true,
        isPlaying: false,
        speed: 1,
        currentIndex: Math.max(0, historical.length - 100),
        allCandles: historical,
      });
    } catch {
      // Non-blocking
    }
  };

  const handleSelectCutoffCandle = (candle: CandleData) => {
    const idx = replayState.allCandles.findIndex((c) => c.time === candle.time);
    const targetIdx = idx !== -1 ? idx : Math.max(0, replayState.allCandles.length - 50);

    setReplayState((prev) => ({
      ...prev,
      isSelectingCutoff: false,
      currentIndex: targetIdx,
      cutoffTime: candle.time,
    }));
  };

  const handlePlayToggle = () => {
    setReplayState((prev) => ({
      ...prev,
      isPlaying: !prev.isPlaying,
    }));
  };

  const handleStepForward = () => {
    setReplayState((prev) => ({
      ...prev,
      isPlaying: false,
      currentIndex: Math.min(prev.allCandles.length - 1, prev.currentIndex + 1),
    }));
  };

  const handleStepBackward = () => {
    setReplayState((prev) => ({
      ...prev,
      isPlaying: false,
      currentIndex: Math.max(0, prev.currentIndex - 1),
    }));
  };

  const handleSpeedChange = (speed: ReplaySpeed) => {
    setReplayState((prev) => ({
      ...prev,
      speed,
    }));
  };

  const handleExitReplay = () => {
    if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    setReplayState({
      isActive: false,
      isSelectingCutoff: false,
      isPlaying: false,
      speed: 1,
      currentIndex: 0,
      cutoffTime: undefined,
      allCandles: [],
    });
  };

  const handleSeek = (index: number) => {
    setReplayState((prev) => ({
      ...prev,
      currentIndex: Math.max(0, Math.min(prev.allCandles.length - 1, index)),
    }));
  };

  const handleOpenAlertModal = (price?: number) => {
    setAlertTargetPrice(price);
    setIsAlertModalOpen(true);
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    alertEngine.updateSettings({ soundEnabled: next });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#131722] text-[#D1D4DC] overflow-hidden select-none font-sans">
      {/* Universal Top Application Bar */}
      <header className="h-11 bg-[#181B24] border-b border-[#2B2F3A] flex items-center justify-between px-3 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#2962FF] flex items-center justify-center font-bold text-white text-xs shadow-xs">
              TV
            </div>
            <span className="font-bold text-sm tracking-tight text-white whitespace-nowrap">
              Binance Futures Pro
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1E222D] text-[10px] text-[#787B86] border border-[#2B2F3A]">
            <Radio className="w-3 h-3 text-[#089981] animate-pulse" />
            <span>USDT.P Live Ingest</span>
          </div>
        </div>

        {/* Global Action Tools */}
        <div className="flex items-center gap-2">
          {/* PWA In-App Install Button */}
          <PWAInstallButton />

          {/* Bar Replay Trigger */}
          <button
            onClick={handleStartReplayWorkflow}
            className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
              replayState.isActive
                ? 'bg-[#2962FF] text-white shadow-sm'
                : 'bg-[#1E222D] text-[#D1D4DC] hover:bg-[#2A2E39] border border-[#2B2F3A]'
            }`}
            title="TradingView Bar Replay Simulator"
          >
            <Rewind className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {replayState.isActive ? 'Replay Active' : 'Bar Replay'}
            </span>
          </button>

          {/* Alert Manager Trigger */}
          <button
            onClick={() => handleOpenAlertModal()}
            className="p-1.5 rounded bg-[#1E222D] text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] border border-[#2B2F3A] transition-colors relative cursor-pointer"
            title="Manage Price Alerts"
          >
            <Bell className="w-4 h-4" />
            {alerts.filter((a) => a.status === 'active').length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#2962FF] rounded-full border border-[#181B24]" />
            )}
          </button>

          {/* Sound Toggle */}
          <button
            onClick={handleToggleSound}
            className="p-1.5 rounded bg-[#1E222D] text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] border border-[#2B2F3A] transition-colors cursor-pointer"
            title={soundEnabled ? 'Alert audio enabled' : 'Alert audio muted'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-[#089981]" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>

          {/* Watchlist Toggle Button */}
          <button
            onClick={() => setIsWatchlistOpen((prev) => !prev)}
            className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors cursor-pointer ${
              isWatchlistOpen
                ? 'bg-[#2A2E39] text-[#2962FF] border border-[#2962FF]'
                : 'bg-[#1E222D] text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] border border-[#2B2F3A]'
            }`}
            title="Toggle Binance USDT.P Watchlist"
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Watchlist</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Drawing Toolbar (Collapsible) */}
        <DrawingToolbar
          activeTool={activeDrawingTool}
          onSelectTool={(tool) => setActiveDrawingTool(tool)}
          drawingsCount={drawings.length}
          onClearDrawings={handleClearDrawings}
          onOpenSettings={() => setIsDrawingSettingsModalOpen(true)}
          isCollapsed={isToolbarCollapsed}
          onToggleCollapse={handleToggleToolbarCollapse}
          favoriteTools={favoriteTools}
          onToggleFavorite={handleToggleFavorite}
          magnetMode={magnetMode}
          onToggleMagnetMode={() => setMagnetMode((prev) => !prev)}
          isAllLocked={isAllLocked}
          onToggleLockAll={handleToggleLockAll}
          isAllHidden={isAllHidden}
          onToggleHideAll={handleToggleHideAll}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />

        {/* Central TradingView Chart with full Drawing Engine */}
        <TradingChart
          symbol={symbol}
          interval={interval}
          priceType={priceType}
          onChangePriceType={(type) => setPriceType(type)}
          onChangeInterval={(newInterval) => setIntervalState(newInterval)}
          onNextSymbol={handleNextSymbol}
          onPrevSymbol={handlePrevSymbol}
          activeDrawingTool={activeDrawingTool}
          onResetDrawingTool={() => {}}
          drawings={drawings}
          onAddDrawing={handleAddDrawing}
          onUpdateDrawing={handleUpdateDrawing}
          onDeleteDrawing={handleDeleteDrawing}
          onClearDrawings={handleClearDrawings}
          drawingSettings={drawingSettings}
          onOpenSettingsModal={() => setIsDrawingSettingsModalOpen(true)}
          replayState={replayState}
          onSelectCutoffCandle={handleSelectCutoffCandle}
          onOpenAlertModal={handleOpenAlertModal}
          alerts={alerts}
          onAlertsChanged={() => setAlerts(alertEngine.getAlerts())}
          onOpenCustomTimeframe={() => setIsCustomTfModalOpen(true)}
          magnetMode={magnetMode}
          onToggleReplay={handleStartReplayWorkflow}
        />

        {/* Floating Bar Replay Controller Toolbar */}
        <BarReplayEngine
          replayState={replayState}
          onPlayToggle={handlePlayToggle}
          onStepForward={handleStepForward}
          onStepBackward={handleStepBackward}
          onSpeedChange={handleSpeedChange}
          onSelectCutoff={() =>
            setReplayState((prev) => ({ ...prev, isSelectingCutoff: true }))
          }
          onExitReplay={handleExitReplay}
          onSeek={handleSeek}
        />

        {/* Right Collapsible Watchlist Sidebar */}
        <Watchlist
          currentSymbol={symbol}
          onSelectSymbol={(newSym) => {
            setSymbol(newSym);
            if (replayState.isActive) {
              handleExitReplay();
            }
          }}
          isOpen={isWatchlistOpen}
          onClose={() => setIsWatchlistOpen(false)}
        />
      </div>

      {/* Offline Connectivity Notification Banner */}
      <OfflineIndicator />
      <PWAInstallPrompt />

      {/* In-App Real-time Alert Toast Notifications */}
      <div className="fixed bottom-4 left-16 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {activeAlertToasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-[#1E222D] border-2 border-[#F23645] rounded-xl shadow-2xl p-3 text-xs flex items-center justify-between gap-3 text-white backdrop-blur-md animate-bounce"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-[#F23645]/20 text-[#F23645] rounded-lg">
                <Bell className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm">
                  {toast.alert.symbol} Alert Triggered!
                </span>
                <span className="text-[#D1D4DC] font-mono">
                  Price: {toast.price.toLocaleString()} USDT
                </span>
                <span className="text-[10px] text-[#787B86]">
                  Condition: {toast.alert.condition.replace(/_/g, ' ')} (Target: {toast.alert.price.toLocaleString()})
                </span>
              </div>
            </div>
            <button
              onClick={() =>
                setActiveAlertToasts((prev) => prev.filter((t) => t.id !== toast.id))
              }
              className="text-[#787B86] hover:text-white p-1 rounded hover:bg-[#2A2E39]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Alert Creation / Management Modal */}
      <AlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        currentSymbol={symbol}
        currentPrice={alertTargetPrice || 0}
        currentTimeframe={interval}
        priceType={priceType}
        onAlertsChanged={() => setAlerts(alertEngine.getAlerts())}
      />

      {/* Custom Timeframe Modal */}
      <CustomTimeframeModal
        isOpen={isCustomTfModalOpen}
        onClose={() => setIsCustomTfModalOpen(false)}
        onApply={(newTf) => setIntervalState(newTf)}
        currentInterval={interval}
      />

      {/* Drawing Settings Modal */}
      <DrawingSettingsModal
        isOpen={isDrawingSettingsModalOpen}
        onClose={() => setIsDrawingSettingsModalOpen(false)}
        settings={drawingSettings}
        onUpdateSettings={handleUpdateDrawingSettings}
      />
    </div>
  );
}
