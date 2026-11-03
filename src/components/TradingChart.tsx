import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  ColorType,
  CrosshairMode,
  LineStyle,
  PriceScaleMode,
  IPriceLine,
  CandlestickSeries,
  HistogramSeries,
  UTCTimestamp,
  Logical,
} from 'lightweight-charts';
import {
  CandleData,
  PriceType,
  DrawingTool,
  DrawingItem,
  DrawingPoint,
  PriceAlert,
  ReplayState,
  OHLCData,
  DrawingSettings,
  PriceScaleCustomSettings,
} from '../types';
import {
  BinanceStreamManager,
  fetchHistoricalKlines,
  parseIntervalToMinutes,
} from '../services/binanceService';
import { alertEngine } from '../services/alertEngine';
import {
  Maximize2,
  Minimize2,
  RefreshCw,
  Camera,
  PlusCircle,
  Bell,
  Clock,
  Sparkles,
  Trash2,
  Pencil,
  Check,
  Rewind,
  Copy,
  Lock,
  Unlock,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Settings,
  Sliders,
  Plus,
  X,
  Square,
  Percent,
  RotateCcw,
} from 'lucide-react';
import { DrawingPropertiesModal } from './DrawingPropertiesModal';

interface TradingChartProps {
  symbol: string;
  interval: string;
  priceType: PriceType;
  onChangePriceType: (type: PriceType) => void;
  onChangeInterval: (interval: string) => void;
  onNextSymbol?: () => void;
  onPrevSymbol?: () => void;
  activeDrawingTool: DrawingTool | null;
  onResetDrawingTool?: () => void;
  drawings: DrawingItem[];
  onAddDrawing: (drawing: DrawingItem) => void;
  onUpdateDrawing: (drawing: DrawingItem) => void;
  onDeleteDrawing: (id: string) => void;
  onClearDrawings: () => void;
  drawingSettings: DrawingSettings;
  onOpenSettingsModal?: () => void;
  replayState: ReplayState;
  onSelectCutoffCandle: (candle: CandleData) => void;
  onOpenAlertModal: (price?: number) => void;
  alerts: PriceAlert[];
  onAlertsChanged: () => void;
  onOpenCustomTimeframe: () => void;
  magnetMode: boolean;
  onToggleReplay: () => void;
}

export const TradingChart: React.FC<TradingChartProps> = ({
  symbol,
  interval,
  priceType,
  onChangePriceType,
  onChangeInterval,
  onNextSymbol,
  onPrevSymbol,
  activeDrawingTool,
  onResetDrawingTool,
  drawings,
  onAddDrawing,
  onUpdateDrawing,
  onDeleteDrawing,
  drawingSettings,
  onOpenSettingsModal,
  replayState,
  onSelectCutoffCandle,
  onOpenAlertModal,
  alerts,
  onAlertsChanged,
  onOpenCustomTimeframe,
  magnetMode,
  onToggleReplay,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  // Dedicated host element for the lightweight-charts canvas. The chart must NOT be
  // mounted directly into chartContainerRef, because that container also holds the
  // React-rendered SVG drawing layer, which would be wiped out on chart creation.
  const chartHostRef = useRef<HTMLDivElement>(null);
  const overlaySvgRef = useRef<SVGSVGElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const drawingContextMenuRef = useRef<HTMLDivElement>(null);
  const priceScaleMenuRef = useRef<HTMLDivElement>(null);
  const symbolSelectorRef = useRef<HTMLDivElement>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const streamManagerRef = useRef<BinanceStreamManager | null>(null);
  const priceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());
  const drawingPriceLinesMapRef = useRef<Map<string, IPriceLine>>(new Map());

  // Data cache
  const fullCandlesRef = useRef<CandleData[]>([]);
  const activeCandleRef = useRef<CandleData | null>(null);

  // HUD & Layout states
  const [ohlcHud, setOhlcHud] = useState<OHLCData | null>(null);
  const [countdownText, setCountdownText] = useState<string>('--:--');
  const [activePriceY, setActivePriceY] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [, setScrollTick] = useState<number>(0);
  // 4. TradingView Quick Alert Plus (+) Button state
  const [hoveredScaleAlertCoord, setHoveredScaleAlertCoord] = useState<{ y: number; price: number } | null>(null);
  const alertPlusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePriceHover = useCallback((y: number, price: number) => {
    setHoveredScaleAlertCoord({ y, price });
    if (alertPlusTimerRef.current) {
      clearTimeout(alertPlusTimerRef.current);
    }
    // On touch/Android or mouse idle, keep visible for 6 seconds
    alertPlusTimerRef.current = setTimeout(() => {
      setHoveredScaleAlertCoord(null);
    }, 6000);
  }, []);

  // Quick Coin Switch Visual Transition State
  const [symbolAnim, setSymbolAnim] = useState<string>('');

  // 1. TRADINGVIEW RIGHT PRICE SCALE SETTINGS
  const [priceScaleSettings, setPriceScaleSettings] = useState<PriceScaleCustomSettings>(() => {
    try {
      const saved = localStorage.getItem('tv_price_scale_settings_v3');
      if (saved) return JSON.parse(saved);
    } catch {
      // Default
    }
    return {
      autoScale: true,
      lockPriceScale: false,
      invertScale: false,
      mode: PriceScaleMode.Normal,
      position: 'right',
      precision: 'auto',
    };
  });

  // Track price scale width dynamically so drawings NEVER cross into the price scale
  const [priceScaleWidth, setPriceScaleWidth] = useState<number>(65);

  const getPriceScaleWidth = useCallback(() => {
    try {
      const w = chartRef.current?.priceScale(priceScaleSettings.position)?.width();
      if (typeof w === 'number' && w > 0) return w;
    } catch {}
    return 65;
  }, [priceScaleSettings.position]);

  const updateScaleWidth = useCallback(() => {
    try {
      const w = chartRef.current?.priceScale(priceScaleSettings.position)?.width();
      if (typeof w === 'number' && w > 0) {
        setPriceScaleWidth(w);
      }
    } catch {}
  }, [priceScaleSettings.position]);

  useEffect(() => {
    updateScaleWidth();
    const timer = setInterval(updateScaleWidth, 1500);
    return () => clearInterval(timer);
  }, [updateScaleWidth, symbol, interval, priceScaleSettings.position]);

  // Price Scale Context Menu State
  const [showPriceScaleMenu, setShowPriceScaleMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Chart Right-Click Context Menu State
  const [showRightClickMenu, setShowRightClickMenu] = useState<{
    x: number;
    y: number;
    price: number;
    time?: number;
  } | null>(null);

  // Drawing Context Menu State
  const [drawingContextMenu, setDrawingContextMenu] = useState<{
    x: number;
    y: number;
    drawing: DrawingItem;
  } | null>(null);

  // Draggable alert state
  const [draggingAlert, setDraggingAlert] = useState<{
    id: string;
    currentPrice: number;
  } | null>(null);

  // Drawing creation state
  const [creationPoints, setCreationPoints] = useState<DrawingPoint[]>([]);
  const [activeBrushPoints, setActiveBrushPoints] = useState<DrawingPoint[]>([]);
  const [isBrushDrawing, setIsBrushDrawing] = useState<boolean>(false);
  const [currentMouseCoord, setCurrentMouseCoord] = useState<{ x: number; y: number } | null>(null);

  // Interactive drag-creation for Rectangle & Trendline
  const [isDraggingCreation, setIsDraggingCreation] = useState<boolean>(false);
  const dragCreationStartRef = useRef<{ time: number; price: number; x: number; y: number } | null>(null);

  // Selected drawing state for moving, resizing, and styling
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [propertiesModalDrawing, setPropertiesModalDrawing] = useState<DrawingItem | null>(null);

  // Dragging / resizing an existing drawing
  const [draggingHandle, setDraggingHandle] = useState<{
    drawingId: string;
    pointIndex: number;
  } | null>(null);

  const [draggingWholeDrawing, setDraggingWholeDrawing] = useState<{
    drawingId: string;
    startPoint: DrawingPoint;
    initialPoints: DrawingPoint[];
  } | null>(null);

  // Debounce & Pointer tracking
  const drawCooldownRef = useRef<number>(0);
  const activePointerIdRef = useRef<number | null>(null);

  // Save Price Scale Settings
  const updatePriceScaleSettings = useCallback((updates: Partial<PriceScaleCustomSettings>) => {
    setPriceScaleSettings((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem('tv_price_scale_settings_v3', JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // Quick Coin Switch Trigger Animation
  const triggerSymbolAnim = useCallback((dir: 'up' | 'down') => {
    setSymbolAnim(dir === 'up' ? '-translate-y-1 opacity-70 scale-95' : 'translate-y-1 opacity-70 scale-95');
    setTimeout(() => {
      setSymbolAnim('');
    }, 180);
  }, []);

  // Reset creation points when activeDrawingTool reverts to 'cursor'
  useEffect(() => {
    if (activeDrawingTool === 'cursor') {
      setCreationPoints([]);
      setActiveBrushPoints([]);
      setIsBrushDrawing(false);
      setIsDraggingCreation(false);
      dragCreationStartRef.current = null;
    }
  }, [activeDrawingTool]);

  // SMART AUTO-CLOSING CONTEXT MENUS (Empty canvas, drawing, and price scale menu)
  useEffect(() => {
    if (!showRightClickMenu && !drawingContextMenu && !showPriceScaleMenu) return;

    try {
      window.history.pushState({ ctxMenuOpen: true }, '');
    } catch {
      // Ignore
    }

    const handlePopState = () => {
      setShowRightClickMenu(null);
      setDrawingContextMenu(null);
      setShowPriceScaleMenu(null);
    };

    const handlePointerDownOutside = (e: PointerEvent | MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setShowRightClickMenu(null);
      }
      if (drawingContextMenuRef.current && !drawingContextMenuRef.current.contains(e.target as Node)) {
        setDrawingContextMenu(null);
      }
      if (priceScaleMenuRef.current && !priceScaleMenuRef.current.contains(e.target as Node)) {
        setShowPriceScaleMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowRightClickMenu(null);
        setDrawingContextMenu(null);
        setShowPriceScaleMenu(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDownOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [showRightClickMenu, drawingContextMenu, showPriceScaleMenu]);

  // KEYBOARD SHORTCUTS (Delete/Backspace to delete selected drawing, Escape to cancel/deselect)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;

        if (selectedDrawingId) {
          onDeleteDrawing(selectedDrawingId);
          setSelectedDrawingId(null);
        }
      }
      if (e.key === 'Escape') {
        if (creationPoints.length > 0) {
          setCreationPoints([]);
        }
        if (activeDrawingTool) {
          onResetDrawingTool?.();
        }
        setSelectedDrawingId(null);
        setShowRightClickMenu(null);
        setDrawingContextMenu(null);
        setShowPriceScaleMenu(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedDrawingId, creationPoints, activeDrawingTool, onDeleteDrawing, onResetDrawingTool]);

  // Live countdown timer calculation loop
  useEffect(() => {
    const updateCountdown = () => {
      const active = activeCandleRef.current;
      if (!active) {
        setCountdownText('--:--');
        return;
      }

      const now = Date.now();
      let closeMs = active.closeTimeMs;
      if (!closeMs) {
        const minutes = parseIntervalToMinutes(interval);
        closeMs = (active.time + minutes * 60) * 1000 - 1;
      }

      const diffMs = Math.max(0, closeMs - now);
      const totalSec = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      if (hours > 0) {
        setCountdownText(
          `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      } else {
        setCountdownText(
          `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      }

      if (candleSeriesRef.current && active.close) {
        const y = candleSeriesRef.current.priceToCoordinate(active.close);
        setActivePriceY(y);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [interval]);

  // Magnet mode helper to snap anchors to candle OHLC values
  const applyMagnet = useCallback(
    (rawTime: number, rawPrice: number): { time: number; price: number } => {
      if (!magnetMode || fullCandlesRef.current.length === 0) {
        return { time: rawTime, price: rawPrice };
      }

      const closestCandle = fullCandlesRef.current.reduce((prev, curr) =>
        Math.abs(curr.time - rawTime) < Math.abs(prev.time - rawTime) ? curr : prev
      );
      if (!closestCandle) return { time: rawTime, price: rawPrice };

      const candidates = [closestCandle.open, closestCandle.high, closestCandle.low, closestCandle.close];
      const closestPrice = candidates.reduce((prev, curr) =>
        Math.abs(curr - rawPrice) < Math.abs(prev - rawPrice) ? curr : prev
      );

      return { time: closestCandle.time, price: closestPrice };
    },
    [magnetMode]
  );

  // INITIALIZE TRADINGVIEW LIGHTWEIGHT CHART
  useEffect(() => {
    if (!chartContainerRef.current || !chartHostRef.current) return;

    // Only clear the chart host (never the outer container, which owns the drawing SVG)
    chartHostRef.current.innerHTML = '';
    streamManagerRef.current = new BinanceStreamManager();

    const chart = createChart(chartHostRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#787B86',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'Plus Jakarta Sans', monospace, sans-serif",
      },
      grid: {
        vertLines: { color: '#1E222D', style: LineStyle.Solid },
        horzLines: { color: '#1E222D', style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#787B86',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#2A2E39',
        },
        horzLine: {
          color: '#787B86',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#2A2E39',
        },
      },
      rightPriceScale: {
        borderColor: '#2B2F3A',
        autoScale: priceScaleSettings.autoScale && !priceScaleSettings.lockPriceScale,
        invertScale: priceScaleSettings.invertScale,
        mode: priceScaleSettings.mode,
        alignLabels: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.18,
        },
        visible: priceScaleSettings.position === 'right',
        entireTextOnly: true,
      },
      leftPriceScale: {
        borderColor: '#2B2F3A',
        autoScale: priceScaleSettings.autoScale && !priceScaleSettings.lockPriceScale,
        invertScale: priceScaleSettings.invertScale,
        mode: priceScaleSettings.mode,
        alignLabels: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.18,
        },
        visible: priceScaleSettings.position === 'left',
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: '#2B2F3A',
        timeVisible: true,
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: !priceScaleSettings.lockPriceScale,
      },
      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: !priceScaleSettings.lockPriceScale,
        },
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Candlestick Series (#089981 Up, #F23645 Down)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#F23645',
      borderVisible: true,
      borderColor: '#378658',
      borderUpColor: '#089981',
      borderDownColor: '#F23645',
      wickVisible: true,
      wickUpColor: '#089981',
      wickDownColor: '#F23645',
      priceScaleId: priceScaleSettings.position,
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
      },
    });
    candleSeriesRef.current = candlestickSeries;

    // Volume Histogram
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume_scale',
    });
    chart.priceScale('volume_scale').applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
      visible: false,
    });
    volumeSeriesRef.current = volumeSeries;

    // Synchronize drawings on visible range change (Zooming and Scrolling)
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      setScrollTick((prev) => prev + 1);
    });

    // Crosshair move listener for HUD & scale coordinates
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.point || !candleSeriesRef.current) {
        const active = activeCandleRef.current;
        if (active) {
          const change = active.close - active.open;
          const changePercent = active.open !== 0 ? (change / active.open) * 100 : 0;
          setOhlcHud({
            open: active.open,
            high: active.high,
            low: active.low,
            close: active.close,
            volume: active.volume,
            change,
            changePercent,
            time: active.time,
          });
        }
        return;
      }

      if (candleSeriesRef.current) {
        const hoverPrice = candleSeriesRef.current.coordinateToPrice(param.point.y);
        if (hoverPrice !== null && hoverPrice > 0) {
          handlePriceHover(param.point.y, hoverPrice);
        }
      }

      const candleData = param.seriesData.get(candleSeriesRef.current) as {
        open: number;
        high: number;
        low: number;
        close: number;
        time: number;
      } | undefined;

      const volData = param.seriesData.get(volumeSeries) as { value: number } | undefined;

      if (candleData) {
        const change = candleData.close - candleData.open;
        const changePercent = candleData.open !== 0 ? (change / candleData.open) * 100 : 0;
        setOhlcHud({
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          volume: volData?.value || 0,
          change,
          changePercent,
          time: candleData.time,
        });
      }
    });

    // Resize observer
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      streamManagerRef.current?.destroy();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // 1. APPLY PRICE SCALE SETTINGS DYNAMICALLY
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    const pos = priceScaleSettings.position;

    // Apply visibility and options to active scale
    chart.priceScale(pos).applyOptions({
      autoScale: priceScaleSettings.autoScale && !priceScaleSettings.lockPriceScale,
      invertScale: priceScaleSettings.invertScale,
      mode: priceScaleSettings.mode,
      alignLabels: true,
      borderVisible: true,
      borderColor: '#2B2F3A',
      entireTextOnly: true,
      visible: true,
    });

    // Hide the opposite scale
    const oppositePos = pos === 'right' ? 'left' : 'right';
    chart.priceScale(oppositePos).applyOptions({
      visible: false,
    });

    // Attach series to active scale
    series.applyOptions({
      priceScaleId: pos,
    });

    // Lock / unlock price scale
    chart.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: !priceScaleSettings.lockPriceScale,
      },
      handleScale: {
        axisPressedMouseMove: {
          price: !priceScaleSettings.lockPriceScale,
          time: true,
        },
        mouseWheel: true,
        pinch: true,
      },
    });

    // Price precision setting
    if (priceScaleSettings.precision !== 'auto') {
      const prec = Number(priceScaleSettings.precision);
      series.applyOptions({
        priceFormat: {
          type: 'price',
          precision: prec,
          minMove: Math.pow(10, -prec),
        },
      });
    } else {
      const currentPrice = activeCandleRef.current?.close || 100;
      const prec = currentPrice >= 1000 ? 2 : currentPrice >= 1 ? 3 : currentPrice >= 0.01 ? 4 : 6;
      series.applyOptions({
        priceFormat: {
          type: 'price',
          precision: prec,
          minMove: Math.pow(10, -prec),
        },
      });
    }

    setScrollTick((p) => p + 1);
  }, [priceScaleSettings]);

  // Fetch Klines and Subscribe to Binance WebSocket
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadDataAndStream = async () => {
      try {
        let prevRange: any = null;
        if (chartRef.current) {
          prevRange = chartRef.current.timeScale().getVisibleLogicalRange();
        }

        const candles = await fetchHistoricalKlines(symbol, interval, priceType, 1000);
        if (!isMounted) return;

        fullCandlesRef.current = candles;

        if (candles.length > 0) {
          const lastCandle = candles[candles.length - 1];
          activeCandleRef.current = lastCandle;

          const change = lastCandle.close - lastCandle.open;
          const changePercent = lastCandle.open !== 0 ? (change / lastCandle.open) * 100 : 0;
          setOhlcHud({
            open: lastCandle.open,
            high: lastCandle.high,
            low: lastCandle.low,
            close: lastCandle.close,
            volume: lastCandle.volume,
            change,
            changePercent,
            time: lastCandle.time,
          });

          // Set chart candle series
          const formattedCandles = candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));
          candleSeriesRef.current?.setData(formattedCandles);

          // Set volume series
          const formattedVolumes = candles.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? '#08998140' : '#F2364540',
          }));
          volumeSeriesRef.current?.setData(formattedVolumes);

          // Maintain zoom position or fit content
          if (prevRange && chartRef.current) {
            chartRef.current.timeScale().setVisibleLogicalRange(prevRange);
          } else {
            chartRef.current?.timeScale().fitContent();
          }

          streamManagerRef.current?.setActiveCandle(lastCandle);
        }

        setIsLoading(false);

        // Connect real-time WebSocket & Tick Stream
        if (streamManagerRef.current) {
          streamManagerRef.current.subscribe(
            symbol,
            interval,
            priceType,
            (updatedCandle, isClosed) => {
              if (replayState.isActive) return;

              activeCandleRef.current = updatedCandle;

              // Live candle movement update
              candleSeriesRef.current?.update({
                time: updatedCandle.time as UTCTimestamp,
                open: updatedCandle.open,
                high: updatedCandle.high,
                low: updatedCandle.low,
                close: updatedCandle.close,
              });

              volumeSeriesRef.current?.update({
                time: updatedCandle.time as UTCTimestamp,
                value: updatedCandle.volume,
                color: updatedCandle.close >= updatedCandle.open ? '#08998140' : '#F2364540',
              });

              const y = candleSeriesRef.current?.priceToCoordinate(updatedCandle.close);
              if (y !== undefined) setActivePriceY(y);

              const change = updatedCandle.close - updatedCandle.open;
              const changePercent = updatedCandle.open !== 0 ? (change / updatedCandle.open) * 100 : 0;
              setOhlcHud({
                open: updatedCandle.open,
                high: updatedCandle.high,
                low: updatedCandle.low,
                close: updatedCandle.close,
                volume: updatedCandle.volume,
                change,
                changePercent,
                time: updatedCandle.time,
              });

              if (isClosed) {
                fullCandlesRef.current.push(updatedCandle);
                alertEngine.checkBarClose(updatedCandle, symbol);
              }
            },
            (tickPrice, tickPriceType) => {
              if (replayState.isActive) return;
              alertEngine.checkTick(tickPrice, symbol, tickPriceType);
            }
          );
        }
      } catch {
        if (isMounted) setIsLoading(false);
      }
    };

    loadDataAndStream();

    return () => {
      isMounted = false;
    };
  }, [symbol, interval, priceType]);

  // Handle Bar Replay slicing
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    if (replayState.isActive) {
      streamManagerRef.current?.setPaused(true);

      const replayBars = replayState.allCandles.slice(0, replayState.currentIndex + 1);
      if (replayBars.length > 0) {
        const last = replayBars[replayBars.length - 1];
        activeCandleRef.current = last;

        candleSeriesRef.current.setData(
          replayBars.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );

        volumeSeriesRef.current.setData(
          replayBars.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? '#08998140' : '#F2364540',
          }))
        );
      }
    } else {
      streamManagerRef.current?.setPaused(false);
      if (fullCandlesRef.current.length > 0) {
        candleSeriesRef.current.setData(
          fullCandlesRef.current.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );
        volumeSeriesRef.current.setData(
          fullCandlesRef.current.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? '#08998140' : '#F2364540',
          }))
        );
      }
    }
  }, [replayState.isActive, replayState.currentIndex]);

  // Sync Price Alert lines on series
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const series = candleSeriesRef.current;

    priceLinesMapRef.current.forEach((line, alertId) => {
      const exists = alerts.some((a) => a.id === alertId && a.status === 'active' && a.symbol === symbol);
      if (!exists) {
        series.removePriceLine(line);
        priceLinesMapRef.current.delete(alertId);
      }
    });

    alerts
      .filter((a) => a.symbol === symbol && a.status === 'active')
      .forEach((alert) => {
        let priceLine = priceLinesMapRef.current.get(alert.id);
        const displayPrice = draggingAlert?.id === alert.id ? draggingAlert.currentPrice : alert.price;

        // ONLY mark price with line, do not use any price tag!
        if (!priceLine) {
          priceLine = series.createPriceLine({
            price: displayPrice,
            color: '#F23645',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: false,
            title: '',
          });
          priceLinesMapRef.current.set(alert.id, priceLine);
        } else {
          priceLine.applyOptions({
            price: displayPrice,
            axisLabelVisible: false,
            title: '',
          });
        }
      });
  }, [alerts, symbol, draggingAlert]);

  // Draggable Alert Handler (Free moving)
  const handleAlertMouseDown = (alertId: string, initialPrice: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    let latestPrice = initialPrice;
    setDraggingAlert({ id: alertId, currentPrice: initialPrice });

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!chartContainerRef.current || !candleSeriesRef.current) return;
      const rect = chartContainerRef.current.getBoundingClientRect();
      const y = moveEvent.clientY - rect.top;
      const newPrice = candleSeriesRef.current.coordinateToPrice(y);
      if (newPrice !== null && newPrice > 0) {
        latestPrice = newPrice;
        setDraggingAlert({ id: alertId, currentPrice: newPrice });
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setDraggingAlert(null);
      alertEngine.updateAlertPrice(alertId, latestPrice);
      onAlertsChanged();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Convert time to X coordinate safely (supports past, visible, and future bar coordinates)
  const timeToX = useCallback((time: number): number | null => {
    if (!chartRef.current) return null;
    const timeScale = chartRef.current.timeScale();

    // 1. Direct conversion
    const directX = timeScale.timeToCoordinate(time as UTCTimestamp);
    if (directX !== null) return Number(directX);

    // 2. Exact or nearest bar index conversion via timeToIndex
    const idx = timeScale.timeToIndex(time as UTCTimestamp, true);
    if (idx !== null) {
      const logicalCoord = timeScale.logicalToCoordinate(idx as unknown as Logical);
      if (logicalCoord !== null) return Number(logicalCoord);
    }

    // 3. Fallback: extrapolate logical position based on candle spacing
    if (fullCandlesRef.current.length > 1) {
      const candles = fullCandlesRef.current;
      const last = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      const dt = Math.max(1, last.time - prev.time);
      const lastIdx = candles.length - 1;
      const estLogical = lastIdx + (time - last.time) / dt;
      const logicalCoord = timeScale.logicalToCoordinate(estLogical as unknown as Logical);
      if (logicalCoord !== null) return Number(logicalCoord);
    }

    return null;
  }, []);

  // Convert time & price to SVG coordinates
  const getCoordinates = useCallback(
    (point: { time: number; price: number }): { x: number; y: number } | null => {
      if (!chartRef.current || !candleSeriesRef.current) return null;
      const y = candleSeriesRef.current.priceToCoordinate(point.price);
      if (y === null) return null;
      const x = timeToX(point.time);
      if (x === null) return null;
      return { x, y: Number(y) };
    },
    [timeToX]
  );

  // Helper to complete a drawing (Stay in drawing mode, NO cursor mode)
  const completeDrawing = useCallback(
    (newDrawing: DrawingItem) => {
      onAddDrawing(newDrawing);
      setSelectedDrawingId(newDrawing.id);
      setCreationPoints([]);
      setActiveBrushPoints([]);
      setIsBrushDrawing(false);
      setIsDraggingCreation(false);
      dragCreationStartRef.current = null;
      activePointerIdRef.current = null;
      drawCooldownRef.current = Date.now();
      // NO cursor mode reset: Keep user flow uninterrupted on Android phone
    },
    [onAddDrawing]
  );

  // ROBUST DRAGGING ENGINE (Window-level pointer tracking + Android pointer capture):
  // Works smoothly for Horizontal Line, Rectangle, Trendline, etc.
  const startDragDrawing = useCallback(
    (drawing: DrawingItem, e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setSelectedDrawingId(drawing.id);
      if (drawing.locked) return;

      const pointerId = e.pointerId;
      const targetElement = e.currentTarget as Element;
      try {
        targetElement?.setPointerCapture?.(pointerId);
      } catch {}

      const startClientY = e.clientY;
      const startClientX = e.clientX;
      const initialPoints = drawing.points.map((p) => ({ ...p }));
      const initialBrushPoints = drawing.brushPoints ? drawing.brushPoints.map((p) => ({ ...p })) : undefined;

      const handlePointerMove = (moveEv: PointerEvent) => {
        if (!chartContainerRef.current || !candleSeriesRef.current || !chartRef.current) return;
        const rect = chartContainerRef.current.getBoundingClientRect();
        const curY = moveEv.clientY - rect.top;
        const curX = moveEv.clientX - rect.left;

        const curPrice = candleSeriesRef.current.coordinateToPrice(curY);
        if (curPrice === null || curPrice <= 0) return;

        // 1. Horizontal Line only moves vertically in price
        if (drawing.tool === 'horizontal_line') {
          onUpdateDrawing({
            ...drawing,
            points: [{ time: initialPoints[0]?.time || Math.floor(Date.now() / 1000), price: curPrice }],
          });
          return;
        }

        // 2. Horizontal Ray: updates price, and moves start time with horizontal delta
        if (drawing.tool === 'horizontal_ray') {
          const curTime = chartRef.current.timeScale().coordinateToTime(curX) as number | null;
          const startX = startClientX - rect.left;
          const initialTime = chartRef.current.timeScale().coordinateToTime(startX) as number | null;
          const deltaTime = curTime !== null && initialTime !== null ? curTime - initialTime : 0;
          onUpdateDrawing({
            ...drawing,
            points: [{ time: (initialPoints[0]?.time || 0) + deltaTime, price: curPrice }],
          });
          return;
        }

        // 3. Vertical Line: updates time horizontally
        if (drawing.tool === 'vertical_line') {
          const curTime = chartRef.current.timeScale().coordinateToTime(curX) as number | null;
          if (curTime !== null) {
            onUpdateDrawing({
              ...drawing,
              points: [{ time: curTime, price: initialPoints[0]?.price || curPrice }],
            });
          }
          return;
        }

        // 4. All other drawings (rectangle, price range, trendline, ray, fibonacci, etc.)
        const curTime = chartRef.current.timeScale().coordinateToTime(curX) as number | null;
        const startX = startClientX - rect.left;
        const initialTime = chartRef.current.timeScale().coordinateToTime(startX) as number | null;
        const initialPrice = candleSeriesRef.current.coordinateToPrice(startClientY - rect.top);

        if (initialPrice !== null) {
          const deltaPrice = curPrice - initialPrice;
          const deltaTime = curTime !== null && initialTime !== null ? curTime - initialTime : 0;

          const shiftedPoints = initialPoints.map((pt) => ({
            time: pt.time + deltaTime,
            price: pt.price + deltaPrice,
          }));

          const shiftedBrush = initialBrushPoints?.map((pt) => ({
            time: pt.time + deltaTime,
            price: pt.price + deltaPrice,
          }));

          onUpdateDrawing({
            ...drawing,
            points: shiftedPoints,
            brushPoints: shiftedBrush,
          });
        }
      };

      const handlePointerUp = () => {
        try {
          targetElement?.releasePointerCapture?.(pointerId);
        } catch {}
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [onUpdateDrawing]
  );

  const startDragHandle = useCallback(
    (drawing: DrawingItem, pointIndex: number, e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setSelectedDrawingId(drawing.id);
      if (drawing.locked) return;

      const pointerId = e.pointerId;
      const targetElement = e.currentTarget as Element;
      try {
        targetElement?.setPointerCapture?.(pointerId);
      } catch {}

      const handlePointerMove = (moveEv: PointerEvent) => {
        if (!chartContainerRef.current || !candleSeriesRef.current || !chartRef.current) return;
        const rect = chartContainerRef.current.getBoundingClientRect();
        const curY = moveEv.clientY - rect.top;
        const curX = moveEv.clientX - rect.left;

        const curPrice = candleSeriesRef.current.coordinateToPrice(curY);
        if (curPrice === null || curPrice <= 0) return;

        // Horizontal line handle: moves price
        if (drawing.tool === 'horizontal_line') {
          onUpdateDrawing({
            ...drawing,
            points: [{ time: drawing.points[0]?.time || Math.floor(Date.now() / 1000), price: curPrice }],
          });
          return;
        }

        const curTime = chartRef.current.timeScale().coordinateToTime(curX) as number | null;
        const fallbackTime = drawing.points[pointIndex]?.time || Math.floor(Date.now() / 1000);
        const resolvedTime = curTime !== null ? curTime : fallbackTime;

        const updatedPoints = [...drawing.points];
        if (drawing.tool === 'rectangle' && updatedPoints.length >= 2) {
          if (pointIndex === 0) {
            // Corner 0: (time0, price0)
            updatedPoints[0] = { time: resolvedTime, price: curPrice };
          } else if (pointIndex === 1) {
            // Corner 1: (time1, price1)
            updatedPoints[1] = { time: resolvedTime, price: curPrice };
          } else if (pointIndex === 2) {
            // Corner 2: (time0, price1)
            updatedPoints[0] = { time: resolvedTime, price: updatedPoints[0].price };
            updatedPoints[1] = { time: updatedPoints[1].time, price: curPrice };
          } else if (pointIndex === 3) {
            // Corner 3: (time1, price0)
            updatedPoints[1] = { time: resolvedTime, price: updatedPoints[1].price };
            updatedPoints[0] = { time: updatedPoints[0].time, price: curPrice };
          } else if (pointIndex === 4) {
            // Top Edge: adjust upper price
            if (updatedPoints[0].price >= updatedPoints[1].price) {
              updatedPoints[0] = { ...updatedPoints[0], price: curPrice };
            } else {
              updatedPoints[1] = { ...updatedPoints[1], price: curPrice };
            }
          } else if (pointIndex === 5) {
            // Bottom Edge: adjust lower price
            if (updatedPoints[0].price <= updatedPoints[1].price) {
              updatedPoints[0] = { ...updatedPoints[0], price: curPrice };
            } else {
              updatedPoints[1] = { ...updatedPoints[1], price: curPrice };
            }
          } else if (pointIndex === 6) {
            // Left Edge: adjust earlier time
            if (updatedPoints[0].time <= updatedPoints[1].time) {
              updatedPoints[0] = { ...updatedPoints[0], time: resolvedTime };
            } else {
              updatedPoints[1] = { ...updatedPoints[1], time: resolvedTime };
            }
          } else if (pointIndex === 7) {
            // Right Edge: adjust later time
            if (updatedPoints[0].time >= updatedPoints[1].time) {
              updatedPoints[0] = { ...updatedPoints[0], time: resolvedTime };
            } else {
              updatedPoints[1] = { ...updatedPoints[1], time: resolvedTime };
            }
          }
        } else if (
          (drawing.tool === 'price_range' || drawing.tool === 'price_percentage_measure') &&
          updatedPoints.length >= 2
        ) {
          // Price Range Calculator: modifies anchor 0 or 1
          updatedPoints[pointIndex] = { time: resolvedTime, price: curPrice };
        } else {
          updatedPoints[pointIndex] = { time: resolvedTime, price: curPrice };
        }

        onUpdateDrawing({ ...drawing, points: updatedPoints });
      };

      const handlePointerUp = () => {
        try {
          targetElement?.releasePointerCapture?.(pointerId);
        } catch {}
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [onUpdateDrawing]
  );

  // 2. CANVAS POINTER DOWN: Supports Mouse, Stylus & Touch Gestures on Android
  const handleCanvasPointerDown = (e: React.PointerEvent<any>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!chartRef.current || !candleSeriesRef.current || !chartContainerRef.current) return;

    // Ignore secondary pointers (e.g. multi-touch pinch to zoom on Android)
    if (e.pointerType === 'touch' && !e.isPrimary) return;

    activePointerIdRef.current = e.pointerId;
    const targetElement = e.currentTarget as Element;
    try {
      targetElement?.setPointerCapture?.(e.pointerId);
    } catch {}

    const rect = chartContainerRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const scaleW = getPriceScaleWidth();
    // Prevent drawings from originating over the price scale area
    if (priceScaleSettings.position === 'right' && rawX >= rect.width - scaleW) return;
    if (priceScaleSettings.position === 'left' && rawX <= scaleW) return;

    const rawPrice = candleSeriesRef.current.coordinateToPrice(rawY);
    if (rawPrice === null || rawPrice <= 0) return;
    handlePriceHover(rawY, rawPrice);

    // Resolve time or fallback to latest candle time
    const chartTime = chartRef.current.timeScale().coordinateToTime(rawX) as number | null;
    const fallbackTime = activeCandleRef.current?.time || Math.floor(Date.now() / 1000);
    const resolvedTime = chartTime !== null ? chartTime : fallbackTime;

    // Apply Magnet Mode
    const { time, price } = applyMagnet(resolvedTime, rawPrice);

    // Bar Replay Cutoff Selection
    if (replayState.isSelectingCutoff) {
      const closest = fullCandlesRef.current.reduce((prev, curr) =>
        Math.abs(curr.time - time) < Math.abs(prev.time - time) ? curr : prev
      );
      if (closest) onSelectCutoffCandle(closest);
      return;
    }

    // If no drawing tool active -> Deselect any currently selected drawing
    if (!activeDrawingTool || activeDrawingTool === 'cursor') {
      setSelectedDrawingId(null);
      return;
    }

    // Prevent double placement on Android tap bounce
    if (Date.now() - drawCooldownRef.current < 200) return;

    // 2.1 HORIZONTAL LINE: TAP ONCE ANYWHERE -> CREATES LINE AT EXACT PRICE
    if (activeDrawingTool === 'horizontal_line') {
      completeDrawing({
        id: 'drawing_' + Date.now(),
        tool: 'horizontal_line',
        points: [{ time, price }],
        color: drawingSettings.color,
        lineWidth: drawingSettings.lineWidth,
        lineStyle: drawingSettings.lineStyle,
        extendLeft: true,
        extendRight: true,
      });
      return;
    }

    if (activeDrawingTool === 'horizontal_ray') {
      completeDrawing({
        id: 'drawing_' + Date.now(),
        tool: 'horizontal_ray',
        points: [{ time, price }],
        color: drawingSettings.color,
        lineWidth: drawingSettings.lineWidth,
        lineStyle: drawingSettings.lineStyle,
        extendRight: true,
      });
      return;
    }

    if (activeDrawingTool === 'vertical_line') {
      completeDrawing({
        id: 'drawing_' + Date.now(),
        tool: 'vertical_line',
        points: [{ time, price }],
        color: drawingSettings.color,
        lineWidth: drawingSettings.lineWidth,
        lineStyle: drawingSettings.lineStyle,
      });
      return;
    }

    if (activeDrawingTool === 'cross_line') {
      completeDrawing({
        id: 'drawing_' + Date.now(),
        tool: 'cross_line',
        points: [{ time, price }],
        color: drawingSettings.color,
        lineWidth: drawingSettings.lineWidth,
        lineStyle: drawingSettings.lineStyle,
      });
      return;
    }

    if (activeDrawingTool === 'text') {
      const textVal = window.prompt('Enter Text Note:', 'Key Level / Resistance') || 'Note';
      completeDrawing({
        id: 'drawing_' + Date.now(),
        tool: 'text',
        points: [{ time, price }],
        color: drawingSettings.color,
        lineWidth: drawingSettings.lineWidth,
        fontSize: drawingSettings.fontSize || 14,
        text: textVal,
      });
      return;
    }

    if (activeDrawingTool === 'price_label') {
      completeDrawing({
        id: 'drawing_' + Date.now(),
        tool: 'price_label',
        points: [{ time, price }],
        color: drawingSettings.color,
        lineWidth: drawingSettings.lineWidth,
        fontSize: drawingSettings.fontSize || 12,
      });
      return;
    }

    if (activeDrawingTool === 'arrow_marker') {
      completeDrawing({
        id: 'drawing_' + Date.now(),
        tool: 'arrow_marker',
        points: [{ time, price }],
        color: drawingSettings.color,
        lineWidth: drawingSettings.lineWidth,
      });
      return;
    }

    // Brush Freehand Tool
    if (activeDrawingTool === 'brush') {
      setIsBrushDrawing(true);
      setActiveBrushPoints([{ time, price }]);
      return;
    }

    // 2.2 RECTANGLE & TRENDLINE DRAG-CREATION:
    if (
      activeDrawingTool === 'rectangle' ||
      activeDrawingTool === 'trendline' ||
      activeDrawingTool === 'ray' ||
      activeDrawingTool === 'extended_line' ||
      activeDrawingTool === 'arrow' ||
      activeDrawingTool === 'circle' ||
      activeDrawingTool === 'ellipse' ||
      activeDrawingTool === 'fibonacci' ||
      activeDrawingTool === 'price_percentage_measure' ||
      activeDrawingTool === 'price_range' ||
      activeDrawingTool === 'date_and_price_range' ||
      activeDrawingTool === 'date_range'
    ) {
      if (creationPoints.length === 0) {
        dragCreationStartRef.current = { time, price, x: rawX, y: rawY };
        setIsDraggingCreation(true);
        setCurrentMouseCoord({ x: rawX, y: rawY });
      } else {
        // Second tap completion for two-point tools
        completeDrawing({
          id: 'drawing_' + Date.now(),
          tool: activeDrawingTool,
          points: [creationPoints[0], { time, price }],
          color: drawingSettings.color,
          lineWidth: drawingSettings.lineWidth,
          lineStyle: drawingSettings.lineStyle,
          extendLeft: activeDrawingTool === 'extended_line' ? true : !!drawingSettings.extendLeft,
          extendRight:
            activeDrawingTool === 'extended_line' || activeDrawingTool === 'ray'
              ? true
              : !!drawingSettings.extendRight,
          extendUp: activeDrawingTool === 'rectangle' ? !!drawingSettings.extendUp : false,
          extendDown: activeDrawingTool === 'rectangle' ? !!drawingSettings.extendDown : false,
          fillColor: drawingSettings.fillColor || drawingSettings.color,
          fillOpacity: drawingSettings.fillOpacity,
        });
      }
      return;
    }

    // Polyline
    if (activeDrawingTool === 'polyline') {
      if (creationPoints.length > 0 && e.detail >= 2) {
        completeDrawing({
          id: 'drawing_' + Date.now(),
          tool: 'polyline',
          points: creationPoints,
          color: drawingSettings.color,
          lineWidth: drawingSettings.lineWidth,
          lineStyle: drawingSettings.lineStyle,
        });
        return;
      }
      setCreationPoints((prev) => [...prev, { time, price }]);
      return;
    }

    // Three-point tools (Parallel Channel, Fibonacci Extension, Fibonacci Channel)
    if (
      activeDrawingTool === 'parallel_channel' ||
      activeDrawingTool === 'fibonacci_extension' ||
      activeDrawingTool === 'fibonacci_channel'
    ) {
      if (creationPoints.length === 0) {
        setCreationPoints([{ time, price }]);
      } else if (creationPoints.length === 1) {
        setCreationPoints([creationPoints[0], { time, price }]);
      } else if (creationPoints.length === 2) {
        completeDrawing({
          id: 'drawing_' + Date.now(),
          tool: activeDrawingTool,
          points: [creationPoints[0], creationPoints[1], { time, price }],
          color: drawingSettings.color,
          lineWidth: drawingSettings.lineWidth,
          lineStyle: drawingSettings.lineStyle,
          fillColor: drawingSettings.fillColor || drawingSettings.color,
          fillOpacity: drawingSettings.fillOpacity,
        });
      }
    }
  };

  // CANVAS POINTER MOVE
  const handleCanvasPointerMove = (e: React.PointerEvent<any>) => {
    if (!chartContainerRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCurrentMouseCoord({ x, y });

    if (candleSeriesRef.current) {
      const p = candleSeriesRef.current.coordinateToPrice(y);
      if (p !== null && p > 0) {
        handlePriceHover(y, p);
      }
    }

    // Brush freehand path
    if (isBrushDrawing && chartRef.current && candleSeriesRef.current) {
      const time = chartRef.current.timeScale().coordinateToTime(x) as number | null;
      const price = candleSeriesRef.current.coordinateToPrice(y);
      if (time !== null && price !== null) {
        setActiveBrushPoints((prev) => [...prev, { time, price }]);
      }
      return;
    }
  };

  // CANVAS POINTER UP
  const handleCanvasPointerUp = (e: React.PointerEvent<any>) => {
    try {
      (e.currentTarget as Element)?.releasePointerCapture?.(e.pointerId);
    } catch {}
    activePointerIdRef.current = null;

    // Brush completion
    if (isBrushDrawing && activeBrushPoints.length > 1) {
      completeDrawing({
        id: 'drawing_' + Date.now(),
        tool: 'brush',
        points: activeBrushPoints.slice(0, 2),
        brushPoints: activeBrushPoints,
        color: drawingSettings.color,
        lineWidth: drawingSettings.lineWidth,
      });
      return;
    }

    // 2.2 RECTANGLE & TWO-POINT TOUCH-AND-DRAG COMPLETION:
    if (isDraggingCreation && dragCreationStartRef.current && chartRef.current && candleSeriesRef.current && chartContainerRef.current) {
      const rect = chartContainerRef.current.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      const dist = Math.hypot(rawX - dragCreationStartRef.current.x, rawY - dragCreationStartRef.current.y);

      const rawPrice = candleSeriesRef.current.coordinateToPrice(rawY) || dragCreationStartRef.current.price;
      const chartTime = chartRef.current.timeScale().coordinateToTime(rawX) as number | null;
      const resolvedTime = chartTime !== null ? chartTime : dragCreationStartRef.current.time;
      const { time, price } = applyMagnet(resolvedTime, rawPrice);

      if (dist >= 6 && activeDrawingTool) {
        // Successfully dragged: Complete drawing!
        completeDrawing({
          id: 'drawing_' + Date.now(),
          tool: activeDrawingTool,
          points: [
            { time: dragCreationStartRef.current.time, price: dragCreationStartRef.current.price },
            { time, price },
          ],
          color: drawingSettings.color,
          lineWidth: drawingSettings.lineWidth,
          lineStyle: drawingSettings.lineStyle,
          extendLeft: activeDrawingTool === 'extended_line' ? true : !!drawingSettings.extendLeft,
          extendRight:
            activeDrawingTool === 'extended_line' || activeDrawingTool === 'ray'
              ? true
              : !!drawingSettings.extendRight,
          extendUp: activeDrawingTool === 'rectangle' ? !!drawingSettings.extendUp : false,
          extendDown: activeDrawingTool === 'rectangle' ? !!drawingSettings.extendDown : false,
          fillColor: drawingSettings.fillColor || drawingSettings.color,
          fillOpacity: drawingSettings.fillOpacity,
        });
      } else {
        // Tapped without dragging: Set Point 1 and wait for Point 2
        setCreationPoints([{ time: dragCreationStartRef.current.time, price: dragCreationStartRef.current.price }]);
      }

      setIsDraggingCreation(false);
      dragCreationStartRef.current = null;
    }
  };

  // PREVENT UNINTENDED ANDROID PAGE SCROLLING WHILE DRAWING / DRAGGING (passive: false)
  useEffect(() => {
    const svgEl = overlaySvgRef.current;
    const containerEl = chartContainerRef.current;
    if (!svgEl || !containerEl) return;

    const preventTouchDefault = (e: TouchEvent) => {
      // If user is currently armed with a drawing tool, actively creating a shape, or dragging a drawing
      if (
        (activeDrawingTool && activeDrawingTool !== 'cursor') ||
        isDraggingCreation ||
        draggingWholeDrawing ||
        draggingHandle ||
        selectedDrawingId
      ) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    svgEl.addEventListener('touchstart', preventTouchDefault, { passive: false });
    svgEl.addEventListener('touchmove', preventTouchDefault, { passive: false });
    containerEl.addEventListener('touchmove', preventTouchDefault, { passive: false });

    return () => {
      svgEl.removeEventListener('touchstart', preventTouchDefault);
      svgEl.removeEventListener('touchmove', preventTouchDefault);
      containerEl.removeEventListener('touchmove', preventTouchDefault);
    };
  }, [activeDrawingTool, isDraggingCreation, draggingWholeDrawing, draggingHandle, selectedDrawingId]);

  // 1. CONTEXT MENU & RIGHT-SCALE DETECTION
  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!candleSeriesRef.current || !chartContainerRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    // Detect if right-click occurred over the price scale area
    const isRightScaleArea = priceScaleSettings.position === 'right' && rawX >= rect.width - 75;
    const isLeftScaleArea = priceScaleSettings.position === 'left' && rawX <= 75;

    if (isRightScaleArea || isLeftScaleArea) {
      setShowPriceScaleMenu({
        x: Math.min(window.innerWidth - 240, Math.max(10, e.clientX - 100)),
        y: Math.min(window.innerHeight - 340, Math.max(10, e.clientY - 20)),
      });
      return;
    }

    const price = candleSeriesRef.current.coordinateToPrice(rawY);
    if (price !== null) {
      const chartTime = chartRef.current?.timeScale().coordinateToTime(rawX) as number | null;
      const fallbackTime = activeCandleRef.current?.time || Math.floor(Date.now() / 1000);
      const resolvedTime = chartTime !== null && chartTime !== undefined ? chartTime : fallbackTime;

      setShowRightClickMenu({
        x: Math.min(window.innerWidth - 240, e.clientX),
        y: Math.min(window.innerHeight - 280, e.clientY),
        price,
        time: resolvedTime,
      });
    }
  };

  // 3. QUICK COIN SWITCHING: MOUSE WHEEL GESTURE (DESKTOP)
  const lastWheelTimeRef = useRef<number>(0);
  const handleSymbolWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 160) return;
    lastWheelTimeRef.current = now;

    if (e.deltaY > 0) {
      // Wheel Down -> Next Coin
      onNextSymbol?.();
      triggerSymbolAnim('down');
    } else if (e.deltaY < 0) {
      // Wheel Up -> Previous Coin
      onPrevSymbol?.();
      triggerSymbolAnim('up');
    }
  };

  // 3. QUICK COIN SWITCHING: VERTICAL SWIPE GESTURE (MOBILE / ANDROID)
  const touchStartYRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const isSwipingSymbolRef = useRef<boolean>(false);

  const handleSymbolTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      touchStartYRef.current = e.touches[0].clientY;
      touchStartXRef.current = e.touches[0].clientX;
      isSwipingSymbolRef.current = true;
    }
  };

  const handleSymbolTouchMove = (e: React.TouchEvent) => {
    if (!isSwipingSymbolRef.current || touchStartYRef.current === null || touchStartXRef.current === null) return;
    const dy = Math.abs(e.touches[0].clientY - touchStartYRef.current);
    const dx = Math.abs(e.touches[0].clientX - touchStartXRef.current);
    if (dy > dx && dy > 4) {
      // Prevent accidental page scrolling when gesture begins inside symbol selector
      if (e.cancelable) e.preventDefault();
    }
  };

  const handleSymbolTouchEnd = (e: React.TouchEvent) => {
    if (!isSwipingSymbolRef.current || touchStartYRef.current === null) return;
    isSwipingSymbolRef.current = false;
    if (e.changedTouches.length > 0) {
      const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;
      if (Math.abs(deltaY) > 20) {
        if (deltaY < 0) {
          // Swipe Up -> Next Coin
          onNextSymbol?.();
          triggerSymbolAnim('down');
        } else {
          // Swipe Down -> Previous Coin
          onPrevSymbol?.();
          triggerSymbolAnim('up');
        }
      }
    }
    touchStartYRef.current = null;
    touchStartXRef.current = null;
  };

  // Helper format price
  const formatPriceDisplay = (p: number): string => {
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(3);
    if (p >= 0.01) return p.toFixed(4);
    return p.toFixed(6);
  };

  const timeframes = [
    { label: '1m', val: '1m' },
    { label: '3m', val: '3m' },
    { label: '5m', val: '5m' },
    { label: '15m', val: '15m' },
    { label: '30m', val: '30m' },
    { label: '1h', val: '1h' },
    { label: '4h', val: '4h' },
    { label: '1D', val: '1d' },
    { label: '1W', val: '1w' },
  ];
  const isCurrentIntervalCustom = !timeframes.some((t) => t.val === interval);
  const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId);

  return (
    <div className="relative flex-1 h-full bg-[#131722] flex flex-col overflow-hidden select-none">
      {/* TOP CHART HEADER TOOLBAR */}
      <header className="h-10 bg-[#1E222D] border-b border-[#2B2F3A] flex items-center justify-between px-3 gap-2 shrink-0 z-20">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {/* 3. TRADINGVIEW QUICK COIN SWITCHER (Wheel on Desktop, Vertical Swipe on Android) */}
          <div
            ref={symbolSelectorRef}
            onWheel={handleSymbolWheel}
            onTouchStart={handleSymbolTouchStart}
            onTouchMove={handleSymbolTouchMove}
            onTouchEnd={handleSymbolTouchEnd}
            className="relative flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#131722] hover:bg-[#2A2E39] border border-[#2B2F3A] hover:border-[#2962FF] transition-all cursor-pointer select-none group touch-none"
            title="Scroll mouse wheel or swipe up/down to switch coins (TradingView Quick Switch)"
          >
            <div className={`flex items-center gap-1.5 transition-all duration-150 ${symbolAnim}`}>
              <span className="font-bold text-sm text-white tracking-tight">{symbol}</span>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[#2A2E39] text-[#2962FF] uppercase">
                USDT.P
              </span>
            </div>

            {/* Quick Up/Down Chevron Switchers */}
            <div className="flex flex-col ml-0.5 -mr-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPrevSymbol?.();
                  triggerSymbolAnim('up');
                }}
                className="p-0.5 text-[#787B86] hover:text-[#2962FF] transition-colors"
                title="Previous Coin in Watchlist"
              >
                <ChevronUp className="w-2.5 h-2.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNextSymbol?.();
                  triggerSymbolAnim('down');
                }}
                className="p-0.5 text-[#787B86] hover:text-[#2962FF] transition-colors"
                title="Next Coin in Watchlist"
              >
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>

          <div className="w-px h-4 bg-[#2B2F3A] mx-1 shrink-0" />

          {/* 3-WAY PRICE SOURCE SWITCHER */}
          <div className="flex items-center p-0.5 bg-[#131722] rounded-md border border-[#2B2F3A] shrink-0">
            <button
              onClick={() => onChangePriceType('last')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap cursor-pointer ${
                priceType === 'last' ? 'bg-[#2962FF] text-white shadow-xs' : 'text-[#787B86] hover:text-[#D1D4DC]'
              }`}
            >
              Last Price
            </button>
            <button
              onClick={() => onChangePriceType('mark')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap cursor-pointer ${
                priceType === 'mark' ? 'bg-[#2962FF] text-white shadow-xs' : 'text-[#787B86] hover:text-[#D1D4DC]'
              }`}
            >
              Mark Price
            </button>
            <button
              onClick={() => onChangePriceType('index')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap cursor-pointer ${
                priceType === 'index' ? 'bg-[#2962FF] text-white shadow-xs' : 'text-[#787B86] hover:text-[#D1D4DC]'
              }`}
            >
              Index Price
            </button>
          </div>

          <div className="w-px h-4 bg-[#2B2F3A] mx-1 shrink-0" />

          {/* Timeframes */}
          <div className="flex items-center gap-0.5 shrink-0">
            {timeframes.map((tf) => (
              <button
                key={tf.val}
                onClick={() => onChangeInterval(tf.val)}
                className={`px-1.5 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  interval === tf.val
                    ? 'bg-[#2A2E39] text-[#2962FF] font-bold'
                    : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39]/60'
                }`}
              >
                {tf.label}
              </button>
            ))}
            <button
              onClick={onOpenCustomTimeframe}
              className={`px-2 py-1 text-xs font-mono font-medium rounded border transition-colors flex items-center gap-1 cursor-pointer ${
                isCurrentIntervalCustom
                  ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-bold'
                  : 'border-[#2B2F3A] text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>{isCurrentIntervalCustom ? interval : '+'}</span>
            </button>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Bar Replay Trigger */}
          <button
            onClick={onToggleReplay}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border transition-colors cursor-pointer ${
              replayState.isActive
                ? 'bg-[#2962FF] border-[#2962FF] text-white shadow-xs'
                : 'bg-[#131722] border-[#2B2F3A] text-[#D1D4DC] hover:border-[#2962FF]'
            }`}
            title="TradingView Bar Replay"
          >
            <Rewind className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {replayState.isActive ? 'Replay Active' : 'Replay'}
            </span>
          </button>

          {/* Alert button */}
          <button
            onClick={() => onOpenAlertModal(activeCandleRef.current?.close)}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-[#131722] border border-[#2B2F3A] text-[#D1D4DC] hover:border-[#2962FF] transition-colors cursor-pointer"
          >
            <Bell className="w-3.5 h-3.5 text-[#2962FF]" />
            <span className="hidden sm:inline">Alert</span>
            {alerts.filter((a) => a.symbol === symbol && a.status === 'active').length > 0 && (
              <span className="ml-0.5 px-1 bg-[#2962FF] text-white text-[10px] rounded-full font-mono">
                {alerts.filter((a) => a.symbol === symbol && a.status === 'active').length}
              </span>
            )}
          </button>

          {/* Snapshot PNG */}
          <button
            onClick={() => {
              if (!chartRef.current || !chartContainerRef.current) return;
              const canvas = chartContainerRef.current.querySelector('canvas');
              if (canvas) {
                const a = document.createElement('a');
                a.href = canvas.toDataURL('image/png');
                a.download = `${symbol}_${interval}_${Date.now()}.png`;
                a.click();
              }
            }}
            className="p-1.5 rounded text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] transition-colors cursor-pointer"
            title="Save PNG Snapshot"
          >
            <Camera className="w-4 h-4" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
                setIsFullscreen(true);
              } else {
                document.exitFullscreen().catch(() => {});
                setIsFullscreen(false);
              }
            }}
            className="p-1.5 rounded text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Crosshair & OHLC HUD Overlay */}
      <div className="absolute top-12 left-4 z-10 pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono">
        <div className="flex items-center gap-1.5 text-[#D1D4DC]">
          <span className="font-bold">{symbol}</span>
          <span className="text-[#787B86]">{interval}</span>
          <span className="text-[10px] text-[#2962FF] uppercase font-bold px-1 rounded bg-[#1E222D]">
            {priceType}
          </span>
        </div>
        {ohlcHud && (
          <div className="flex items-center gap-2.5 text-[11px] tabular-nums">
            <span className="text-[#787B86]">
              O <span className="text-[#D1D4DC]">{formatPriceDisplay(ohlcHud.open)}</span>
            </span>
            <span className="text-[#787B86]">
              H <span className="text-[#D1D4DC]">{formatPriceDisplay(ohlcHud.high)}</span>
            </span>
            <span className="text-[#787B86]">
              L <span className="text-[#D1D4DC]">{formatPriceDisplay(ohlcHud.low)}</span>
            </span>
            <span className="text-[#787B86]">
              C{' '}
              <span className={ohlcHud.close >= ohlcHud.open ? 'text-[#089981]' : 'text-[#F23645]'}>
                {formatPriceDisplay(ohlcHud.close)}
              </span>
            </span>
            <span className={`font-semibold ${ohlcHud.change >= 0 ? 'text-[#089981]' : 'text-[#F23645]'}`}>
              {ohlcHud.change >= 0 ? '+' : ''}
              {ohlcHud.change.toFixed(2)} ({ohlcHud.changePercent >= 0 ? '+' : ''}
              {ohlcHud.changePercent.toFixed(2)}%)
            </span>
            {ohlcHud.volume > 0 && (
              <span className="text-[#787B86] hidden sm:inline">
                Vol <span className="text-[#D1D4DC]">{Math.round(ohlcHud.volume).toLocaleString()}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Loading state indicator */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#131722]/80 backdrop-blur-xs">
          <div className="flex flex-col items-center gap-2 text-xs font-mono text-[#787B86]">
            <RefreshCw className="w-6 h-6 animate-spin text-[#2962FF]" />
            <span>Loading {symbol} Binance Data...</span>
          </div>
        </div>
      )}

      {/* Main Chart Canvas Container */}
      <div
        ref={chartContainerRef}
        onContextMenu={handleContextMenu}
        className="flex-1 w-full h-full relative overflow-hidden touch-none"
      >
        {/* Lightweight-charts canvas host (kept separate so the SVG drawing layer survives) */}
        <div ref={chartHostRef} className="absolute inset-0 z-0" />

        {/* SVG Drawing Layer: Touch-optimized for Android with active tool arming */}
        <svg
          ref={overlaySvgRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          style={{ touchAction: activeDrawingTool && activeDrawingTool !== 'cursor' ? 'none' : 'auto' }}
          className={`absolute inset-0 w-full h-full z-20 select-none ${
            activeDrawingTool && activeDrawingTool !== 'cursor'
              ? 'pointer-events-auto cursor-crosshair'
              : 'pointer-events-none'
          }`}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill={drawingSettings.color} />
            </marker>
            {/* Dedicated clipPath so drawings NEVER cross or bleed into the price scale */}
            <clipPath id="chart-plot-clip">
              <rect
                x={priceScaleSettings.position === 'left' ? priceScaleWidth : 0}
                y={0}
                width={Math.max(0, (chartContainerRef.current?.clientWidth || 1000) - priceScaleWidth)}
                height="100%"
              />
            </clipPath>
          </defs>

          {/* WRAP ALL DRAWINGS IN PLOT-AREA CLIPPATH (Drawings do not cross price scale) */}
          <g clipPath="url(#chart-plot-clip)">
            {/* RENDER ALL SAVED DRAWINGS */}
            {drawings.map((drawing) => {
              if (drawing.hidden) return null;

              const isSelected = selectedDrawingId === drawing.id;
              const strokeDash =
                drawing.lineStyle === 'dashed' ? '5 5' : drawing.lineStyle === 'dotted' ? '2 2' : 'none';

              // 2.1 HORIZONTAL LINE: Spans chart plot area, stops before price scale
              if (drawing.tool === 'horizontal_line' && drawing.points[0]) {
                const y = candleSeriesRef.current?.priceToCoordinate(drawing.points[0].price);
                if (y === null || y === undefined) return null;
                const handleX = drawing.points[0].time ? (timeToX(drawing.points[0].time) ?? 120) : 120;
                const plotW = Math.max(0, (chartContainerRef.current?.clientWidth || 1000) - (priceScaleSettings.position === 'right' ? priceScaleWidth : 0));
                const plotLeft = priceScaleSettings.position === 'left' ? priceScaleWidth : 0;
                return (
                  <g key={drawing.id}>
                    {/* Wide hit area for easy finger grab & dragging on Android phone */}
                    <line
                      x1={plotLeft}
                      y1={y}
                      x2={plotW}
                      y2={y}
                      stroke="transparent"
                      strokeWidth={36}
                      style={{ touchAction: 'none' }}
                      className="pointer-events-auto cursor-ns-resize"
                      onPointerDown={(e) => startDragDrawing(drawing, e)}
                      onContextMenu={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                      }}
                    />
                    <line
                      x1={plotLeft}
                      y1={y}
                      x2={plotW}
                      y2={y}
                      stroke={drawing.color}
                      strokeWidth={drawing.lineWidth}
                      strokeDasharray={strokeDash}
                      className="pointer-events-none"
                    />
                    <text
                      x={plotLeft + 12}
                      y={y - 4}
                      fill={drawing.color}
                      fontSize={10}
                      fontFamily="monospace"
                      fontWeight="bold"
                      className="pointer-events-none"
                    >
                      {drawing.text ? `${drawing.text}: ` : ''}{drawing.points[0].price.toFixed(2)}
                    </text>
                    {isSelected && (
                      <g
                        className="pointer-events-auto cursor-ns-resize"
                        onPointerDown={(e) => startDragHandle(drawing, 0, e)}
                      >
                        {/* Invisible large touch target circle for Android fingers */}
                        <circle
                          cx={Math.max(plotLeft + 30, Math.min(handleX, plotW - 30))}
                          cy={y}
                          r={22}
                          fill="transparent"
                          style={{ touchAction: 'none' }}
                        />
                        {/* Visible handle */}
                        <circle
                          cx={Math.max(plotLeft + 30, Math.min(handleX, plotW - 30))}
                          cy={y}
                          r={8}
                          fill="#FFFFFF"
                          stroke="#2962FF"
                          strokeWidth={2.5}
                          className="pointer-events-none"
                        />
                      </g>
                    )}
                  </g>
                );
              }

              // Horizontal Ray: stops before price scale
              if (drawing.tool === 'horizontal_ray' && drawing.points[0]) {
                const y = candleSeriesRef.current?.priceToCoordinate(drawing.points[0].price);
                if (y === null || y === undefined) return null;
                const x = timeToX(drawing.points[0].time) ?? 0;
                const plotW = Math.max(0, (chartContainerRef.current?.clientWidth || 1000) - (priceScaleSettings.position === 'right' ? priceScaleWidth : 0));
                return (
                  <g key={drawing.id}>
                    <line
                      x1={x}
                      y1={y}
                      x2={plotW}
                      y2={y}
                      stroke="transparent"
                      strokeWidth={20}
                      className="pointer-events-auto cursor-pointer"
                      onPointerDown={(e) => startDragDrawing(drawing, e)}
                      onContextMenu={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                      }}
                    />
                    <line
                      x1={x}
                      y1={y}
                      x2={plotW}
                      y2={y}
                      stroke={drawing.color}
                      strokeWidth={drawing.lineWidth}
                      strokeDasharray={strokeDash}
                      className="pointer-events-none"
                    />
                    <circle cx={x} cy={y} r={3.5} fill={drawing.color} className="pointer-events-none" />
                    {isSelected && (
                      <circle
                        cx={x}
                        cy={y}
                        r={6}
                        fill="#FFFFFF"
                        stroke="#2962FF"
                        strokeWidth={2}
                        className="pointer-events-auto cursor-grab"
                        onPointerDown={(e) => startDragHandle(drawing, 0, e)}
                      />
                    )}
                  </g>
                );
              }

            // Vertical Line
            if (drawing.tool === 'vertical_line' && drawing.points[0]) {
              const x = timeToX(drawing.points[0].time);
              if (x === null) return null;
              return (
                <g key={drawing.id}>
                  <line
                    x1={x}
                    y1={0}
                    x2={x}
                    y2="100%"
                    stroke="transparent"
                    strokeWidth={20}
                    className="pointer-events-auto cursor-ew-resize"
                    onPointerDown={(e) => startDragDrawing(drawing, e)}
                    onContextMenu={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                    }}
                  />
                  <line
                    x1={x}
                    y1={0}
                    x2={x}
                    y2="100%"
                    stroke={drawing.color}
                    strokeWidth={drawing.lineWidth}
                    strokeDasharray={strokeDash}
                    className="pointer-events-none"
                  />
                  {isSelected && (
                    <circle
                      cx={x}
                      cy={chartContainerRef.current ? chartContainerRef.current.clientHeight / 2 : 200}
                      r={6}
                      fill="#FFFFFF"
                      stroke="#2962FF"
                      strokeWidth={2}
                      className="pointer-events-auto cursor-ew-resize"
                      onPointerDown={(e) => startDragHandle(drawing, 0, e)}
                    />
                  )}
                </g>
              );
            }

            // Cross Line
            if (drawing.tool === 'cross_line' && drawing.points[0]) {
              const coords = getCoordinates(drawing.points[0]);
              if (!coords) return null;
              return (
                <g key={drawing.id}>
                  <line x1={0} y1={coords.y} x2="100%" y2={coords.y} stroke={drawing.color} strokeWidth={drawing.lineWidth} strokeDasharray={strokeDash} />
                  <line x1={coords.x} y1={0} x2={coords.x} y2="100%" stroke={drawing.color} strokeWidth={drawing.lineWidth} strokeDasharray={strokeDash} />
                  <rect x={10} y={coords.y - 18} width={80} height={16} rx={3} fill="#1E222D" stroke={drawing.color} strokeWidth={1} />
                  <text x={14} y={coords.y - 6} fill={drawing.color} fontSize={9} fontFamily="monospace">
                    {drawing.points[0].price.toFixed(2)}
                  </text>
                  {isSelected && (
                    <circle
                      cx={coords.x}
                      cy={coords.y}
                      r={6}
                      fill="#FFFFFF"
                      stroke="#2962FF"
                      strokeWidth={2}
                      className="pointer-events-auto cursor-move"
                      onPointerDown={(e) => startDragHandle(drawing, 0, e)}
                    />
                  )}
                </g>
              );
            }

            // 2.2 RECTANGLE: 4-Corner Selection, Drag, Resize, and Persistent Coordinates
            if (drawing.tool === 'rectangle' && drawing.points.length >= 2) {
              const p1 = getCoordinates(drawing.points[0]);
              const p2 = getCoordinates(drawing.points[1]);
              if (!p1 || !p2) return null;

              const baseX = Math.min(p1.x, p2.x);
              const baseY = Math.min(p1.y, p2.y);
              const baseRight = Math.max(p1.x, p2.x);
              const baseBottom = Math.max(p1.y, p2.y);

              const plotW = Math.max(0, (chartContainerRef.current?.clientWidth || 3000) - (priceScaleSettings.position === 'right' ? priceScaleWidth : 0));
              const plotLeft = priceScaleSettings.position === 'left' ? priceScaleWidth : 0;
              const chartH = chartContainerRef.current?.clientHeight || 2000;

              const x = drawing.extendLeft ? plotLeft : Math.max(plotLeft, baseX);
              const right = drawing.extendRight ? plotW : Math.min(plotW, baseRight);
              const y = drawing.extendUp ? 0 : baseY;
              const bottom = drawing.extendDown ? chartH : baseBottom;

              const w = Math.max(2, right - x);
              const h = Math.max(2, bottom - y);

              return (
                <g key={drawing.id}>
                  {/* Invisible wide hit rect for dragging entire rectangle freely on Android */}
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill="transparent"
                    style={{ pointerEvents: 'all', touchAction: 'none' }}
                    className="cursor-move"
                    onPointerDown={(e) => startDragDrawing(drawing, e)}
                  />
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={drawing.fillColor || drawing.color}
                    fillOpacity={drawing.fillOpacity || 0.15}
                    stroke={drawing.color}
                    strokeWidth={drawing.lineWidth}
                    strokeDasharray={strokeDash}
                    style={{ pointerEvents: 'all', touchAction: 'none' }}
                    className="cursor-move"
                    onPointerDown={(e) => startDragDrawing(drawing, e)}
                    onContextMenu={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                    }}
                  />
                  {isSelected && (
                    <>
                      {/* Corner 1: (p1.x, p1.y) */}
                      <g className="pointer-events-auto cursor-nwse-resize" onPointerDown={(e) => startDragHandle(drawing, 0, e)}>
                        <circle cx={p1.x} cy={p1.y} r={18} fill="transparent" style={{ touchAction: 'none' }} />
                        <circle cx={p1.x} cy={p1.y} r={7} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2.5} className="pointer-events-none" />
                      </g>
                      {/* Corner 2: (p2.x, p2.y) */}
                      <g className="pointer-events-auto cursor-nwse-resize" onPointerDown={(e) => startDragHandle(drawing, 1, e)}>
                        <circle cx={p2.x} cy={p2.y} r={18} fill="transparent" style={{ touchAction: 'none' }} />
                        <circle cx={p2.x} cy={p2.y} r={7} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2.5} className="pointer-events-none" />
                      </g>
                      {/* Corner 3: (p1.x, p2.y) */}
                      <g className="pointer-events-auto cursor-nesw-resize" onPointerDown={(e) => startDragHandle(drawing, 2, e)}>
                        <circle cx={p1.x} cy={p2.y} r={18} fill="transparent" style={{ touchAction: 'none' }} />
                        <circle cx={p1.x} cy={p2.y} r={7} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2.5} className="pointer-events-none" />
                      </g>
                      {/* Corner 4: (p2.x, p1.y) */}
                      <g className="pointer-events-auto cursor-nesw-resize" onPointerDown={(e) => startDragHandle(drawing, 3, e)}>
                        <circle cx={p2.x} cy={p1.y} r={18} fill="transparent" style={{ touchAction: 'none' }} />
                        <circle cx={p2.x} cy={p1.y} r={7} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2.5} className="pointer-events-none" />
                      </g>
                      {/* Edge 1: Top Edge Midpoint */}
                      <g className="pointer-events-auto cursor-ns-resize" onPointerDown={(e) => startDragHandle(drawing, 4, e)}>
                        <rect x={baseX + (baseRight - baseX) / 2 - 14} y={baseY - 14} width={28} height={28} fill="transparent" style={{ touchAction: 'none' }} />
                        <rect x={baseX + (baseRight - baseX) / 2 - 5} y={baseY - 5} width={10} height={10} rx={2} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="pointer-events-none" />
                      </g>
                      {/* Edge 2: Bottom Edge Midpoint */}
                      <g className="pointer-events-auto cursor-ns-resize" onPointerDown={(e) => startDragHandle(drawing, 5, e)}>
                        <rect x={baseX + (baseRight - baseX) / 2 - 14} y={baseBottom - 14} width={28} height={28} fill="transparent" style={{ touchAction: 'none' }} />
                        <rect x={baseX + (baseRight - baseX) / 2 - 5} y={baseBottom - 5} width={10} height={10} rx={2} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="pointer-events-none" />
                      </g>
                      {/* Edge 3: Left Edge Midpoint */}
                      <g className="pointer-events-auto cursor-ew-resize" onPointerDown={(e) => startDragHandle(drawing, 6, e)}>
                        <rect x={baseX - 14} y={baseY + (baseBottom - baseY) / 2 - 14} width={28} height={28} fill="transparent" style={{ touchAction: 'none' }} />
                        <rect x={baseX - 5} y={baseY + (baseBottom - baseY) / 2 - 5} width={10} height={10} rx={2} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="pointer-events-none" />
                      </g>
                      {/* Edge 4: Right Edge Midpoint */}
                      <g className="pointer-events-auto cursor-ew-resize" onPointerDown={(e) => startDragHandle(drawing, 7, e)}>
                        <rect x={baseRight - 14} y={baseY + (baseBottom - baseY) / 2 - 14} width={28} height={28} fill="transparent" style={{ touchAction: 'none' }} />
                        <rect x={baseRight - 5} y={baseY + (baseBottom - baseY) / 2 - 5} width={10} height={10} rx={2} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="pointer-events-none" />
                      </g>
                    </>
                  )}
                </g>
              );
            }

            // Lines: Trendline, Ray, Extended Line, Arrow
            if (
              (drawing.tool === 'trendline' ||
                drawing.tool === 'ray' ||
                drawing.tool === 'extended_line' ||
                drawing.tool === 'arrow') &&
              drawing.points.length >= 2
            ) {
              const p1 = getCoordinates(drawing.points[0]);
              const p2 = getCoordinates(drawing.points[1]);
              if (!p1 || !p2) return null;

              let x1 = p1.x;
              let y1 = p1.y;
              let x2 = p2.x;
              let y2 = p2.y;

              const dx = x2 - x1;
              const dy = y2 - y1;

              if (drawing.tool === 'extended_line' || drawing.extendLeft) {
                x1 -= dx * 10;
                y1 -= dy * 10;
              }
              if (drawing.tool === 'extended_line' || drawing.tool === 'ray' || drawing.extendRight) {
                x2 += dx * 10;
                y2 += dy * 10;
              }

              return (
                <g key={drawing.id}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={20}
                    className="pointer-events-auto cursor-pointer"
                    onPointerDown={(e) => startDragDrawing(drawing, e)}
                    onContextMenu={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                    }}
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={drawing.color}
                    strokeWidth={drawing.lineWidth}
                    strokeDasharray={strokeDash}
                    markerEnd={drawing.tool === 'arrow' ? 'url(#arrowhead)' : undefined}
                    className="pointer-events-none"
                  />
                  {isSelected && (
                    <>
                      <circle
                        cx={p1.x}
                        cy={p1.y}
                        r={6}
                        fill="#FFFFFF"
                        stroke="#2962FF"
                        strokeWidth={2}
                        className="pointer-events-auto cursor-grab"
                        onPointerDown={(e) => startDragHandle(drawing, 0, e)}
                      />
                      <circle
                        cx={p2.x}
                        cy={p2.y}
                        r={6}
                        fill="#FFFFFF"
                        stroke="#2962FF"
                        strokeWidth={2}
                        className="pointer-events-auto cursor-grab"
                        onPointerDown={(e) => startDragHandle(drawing, 1, e)}
                      />
                    </>
                  )}
                </g>
              );
            }

            // Circle
            if (drawing.tool === 'circle' && drawing.points.length >= 2) {
              const p1 = getCoordinates(drawing.points[0]);
              const p2 = getCoordinates(drawing.points[1]);
              if (!p1 || !p2) return null;
              const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
              return (
                <g key={drawing.id}>
                  <circle
                    cx={p1.x}
                    cy={p1.y}
                    r={r}
                    fill={drawing.fillColor || drawing.color}
                    fillOpacity={drawing.fillOpacity || 0.15}
                    stroke={drawing.color}
                    strokeWidth={drawing.lineWidth}
                    strokeDasharray={strokeDash}
                    className="pointer-events-auto cursor-move"
                    onPointerDown={(e) => startDragDrawing(drawing, e)}
                    onContextMenu={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                    }}
                  />
                  {isSelected && (
                    <>
                      <circle cx={p1.x} cy={p1.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="pointer-events-auto cursor-grab" onPointerDown={(e) => startDragHandle(drawing, 0, e)} />
                      <circle cx={p2.x} cy={p2.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="pointer-events-auto cursor-grab" onPointerDown={(e) => startDragHandle(drawing, 1, e)} />
                    </>
                  )}
                </g>
              );
            }

            // Parallel Channel (3 Points)
            if (drawing.tool === 'parallel_channel' && drawing.points.length >= 3) {
              const p1 = getCoordinates(drawing.points[0]);
              const p2 = getCoordinates(drawing.points[1]);
              const p3 = getCoordinates(drawing.points[2]);
              if (!p1 || !p2 || !p3) return null;

              const offY = p3.y - p1.y;
              const offX = p3.x - p1.x;
              const p4x = p2.x + offX;
              const p4y = p2.y + offY;

              const mid1x = (p1.x + p3.x) / 2;
              const mid1y = (p1.y + p3.y) / 2;
              const mid2x = (p2.x + p4x) / 2;
              const mid2y = (p2.y + p4y) / 2;

              return (
                <g key={drawing.id}>
                  <polygon
                    points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p4x},${p4y} ${p3.x},${p3.y}`}
                    fill={drawing.fillColor || drawing.color}
                    fillOpacity={drawing.fillOpacity || 0.12}
                    className="pointer-events-auto cursor-move"
                    onPointerDown={(e) => startDragDrawing(drawing, e)}
                    onContextMenu={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                    }}
                  />
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={drawing.color} strokeWidth={drawing.lineWidth} className="pointer-events-none" />
                  <line x1={p3.x} y1={p3.y} x2={p4x} y2={p4y} stroke={drawing.color} strokeWidth={drawing.lineWidth} className="pointer-events-none" />
                  <line x1={mid1x} y1={mid1y} x2={mid2x} y2={mid2y} stroke={drawing.color} strokeWidth={1} strokeDasharray="4 4" className="pointer-events-none" />
                  {isSelected && (
                    <>
                      <circle cx={p1.x} cy={p1.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="pointer-events-auto cursor-grab" onPointerDown={(e) => startDragHandle(drawing, 0, e)} />
                      <circle cx={p2.x} cy={p2.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="pointer-events-auto cursor-grab" onPointerDown={(e) => startDragHandle(drawing, 1, e)} />
                      <circle cx={p3.x} cy={p3.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="pointer-events-auto cursor-grab" onPointerDown={(e) => startDragHandle(drawing, 2, e)} />
                    </>
                  )}
                </g>
              );
            }

            // Polyline
            if (drawing.tool === 'polyline' && drawing.points.length > 1) {
              const pts = drawing.points
                .map((p) => getCoordinates(p))
                .filter((p): p is { x: number; y: number } => p !== null);
              if (pts.length < 2) return null;

              const pathD = `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');

              return (
                <g key={drawing.id}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={drawing.color}
                    strokeWidth={Math.max(6, drawing.lineWidth)}
                    strokeDasharray={strokeDash}
                    className="pointer-events-auto cursor-move"
                    onPointerDown={(e) => startDragDrawing(drawing, e)}
                    onContextMenu={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                    }}
                  />
                  {isSelected &&
                    pts.map((pt, i) => (
                      <circle
                        key={i}
                        cx={pt.x}
                        cy={pt.y}
                        r={5}
                        fill="#FFFFFF"
                        stroke="#2962FF"
                        strokeWidth={2}
                        className="pointer-events-auto cursor-grab"
                        onPointerDown={(e) => startDragHandle(drawing, i, e)}
                      />
                    ))}
                </g>
              );
            }

            // Freehand Brush
            if (drawing.tool === 'brush' && drawing.brushPoints && drawing.brushPoints.length > 1) {
              const pts = drawing.brushPoints
                .map((p) => getCoordinates(p))
                .filter((p): p is { x: number; y: number } => p !== null);
              if (pts.length < 2) return null;

              const pathD = `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');

              return (
                <g key={drawing.id}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={drawing.color}
                    strokeWidth={Math.max(6, drawing.lineWidth)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-auto cursor-move"
                    onPointerDown={(e) => startDragDrawing(drawing, e)}
                    onContextMenu={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                    }}
                  />
                </g>
              );
            }

            // Text Note Annotation
            if (drawing.tool === 'text' && drawing.points[0]) {
              const coords = getCoordinates(drawing.points[0]);
              if (!coords) return null;

              return (
                <g
                  key={drawing.id}
                  className="pointer-events-auto cursor-move"
                  onPointerDown={(e) => startDragDrawing(drawing, e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    const newTxt = window.prompt('Edit Note Text:', drawing.text || '') || drawing.text;
                    onUpdateDrawing({ ...drawing, text: newTxt });
                  }}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                  }}
                >
                  <rect
                    x={coords.x - 4}
                    y={coords.y - (drawing.fontSize || 14) - 2}
                    width={((drawing.text?.length || 4) * (drawing.fontSize || 14) * 0.6) + 12}
                    height={(drawing.fontSize || 14) + 8}
                    rx={4}
                    fill="#1E222D"
                    fillOpacity={0.88}
                    stroke={isSelected ? '#2962FF' : '#2B2F3A'}
                    strokeWidth={1}
                  />
                  <text
                    x={coords.x + 2}
                    y={coords.y - 2}
                    fill={drawing.color}
                    fontSize={drawing.fontSize || 14}
                    fontWeight="500"
                    fontFamily="'JetBrains Mono', monospace"
                  >
                    {drawing.text || 'Note'}
                  </text>
                  {isSelected && (
                    <circle
                      cx={coords.x}
                      cy={coords.y}
                      r={5}
                      fill="#FFFFFF"
                      stroke="#2962FF"
                      strokeWidth={2}
                      className="cursor-move pointer-events-auto"
                      onPointerDown={(e) => startDragHandle(drawing, 0, e)}
                    />
                  )}
                </g>
              );
            }

            // Price Label Badge
            if (drawing.tool === 'price_label' && drawing.points[0]) {
              const coords = getCoordinates(drawing.points[0]);
              if (!coords) return null;
              const priceText = drawing.points[0].price.toFixed(2);
              const tagW = 75;

              return (
                <g
                  key={drawing.id}
                  className="pointer-events-auto cursor-move"
                  onPointerDown={(e) => startDragDrawing(drawing, e)}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                  }}
                >
                  <polygon
                    points={`${coords.x},${coords.y} ${coords.x + 8},${coords.y - 10} ${coords.x + tagW},${coords.y - 10} ${coords.x + tagW},${coords.y + 10} ${coords.x + 8},${coords.y + 10}`}
                    fill="#1E222D"
                    stroke={drawing.color}
                    strokeWidth={1.5}
                  />
                  <text
                    x={coords.x + 16}
                    y={coords.y + 3.5}
                    fill="#FFFFFF"
                    fontSize={10}
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {priceText}
                  </text>
                  {isSelected && (
                    <circle cx={coords.x} cy={coords.y} r={5} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} />
                  )}
                </g>
              );
            }

            // Arrow Marker (Buy/Sell signal)
            if (drawing.tool === 'arrow_marker' && drawing.points[0]) {
              const coords = getCoordinates(drawing.points[0]);
              if (!coords) return null;

              return (
                <g
                  key={drawing.id}
                  className="pointer-events-auto cursor-move"
                  onPointerDown={(e) => startDragDrawing(drawing, e)}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                  }}
                >
                  <circle cx={coords.x} cy={coords.y} r={14} fill={drawing.color} fillOpacity={0.2} stroke={drawing.color} strokeWidth={1.5} />
                  <polygon points={`${coords.x},${coords.y - 7} ${coords.x - 6},${coords.y + 5} ${coords.x + 6},${coords.y + 5}`} fill={drawing.color} />
                  {isSelected && (
                    <circle cx={coords.x} cy={coords.y} r={5} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} />
                  )}
                </g>
              );
            }

            // Fibonacci Retracement
            if (drawing.tool === 'fibonacci' && drawing.points.length >= 2) {
              const p1 = getCoordinates(drawing.points[0]);
              const p2 = getCoordinates(drawing.points[1]);
              if (!p1 || !p2) return null;

              const highPrice = Math.max(drawing.points[0].price, drawing.points[1].price);
              const lowPrice = Math.min(drawing.points[0].price, drawing.points[1].price);
              const diff = highPrice - lowPrice;

              const fibLevels = [
                { ratio: 0.0, color: '#787B86' },
                { ratio: 0.236, color: '#F23645' },
                { ratio: 0.382, color: '#F59E0B' },
                { ratio: 0.5, color: '#089981' },
                { ratio: 0.618, color: '#2962FF' },
                { ratio: 0.786, color: '#A855F7' },
                { ratio: 1.0, color: '#787B86' },
              ];

              return (
                <g
                  key={drawing.id}
                  className="pointer-events-auto cursor-move"
                  onPointerDown={(e) => startDragDrawing(drawing, e)}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                  }}
                >
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#787B86" strokeWidth={1} strokeDasharray="3 3" className="pointer-events-none" />
                  {fibLevels.map((lvl) => {
                    const priceAtLvl = highPrice - diff * lvl.ratio;
                    const y = candleSeriesRef.current?.priceToCoordinate(priceAtLvl);
                    if (y === null || y === undefined) return null;
                    return (
                      <g key={lvl.ratio} className="pointer-events-none">
                        <line x1={Math.min(p1.x, p2.x)} y1={y} x2="100%" y2={y} stroke={lvl.color} strokeWidth={1} strokeDasharray={lvl.ratio === 0.5 ? 'none' : '3 3'} />
                        <text x={Math.min(p1.x, p2.x) + 5} y={y - 3} fill={lvl.color} fontSize={9} fontFamily="monospace">
                          {lvl.ratio} ({priceAtLvl.toFixed(2)})
                        </text>
                      </g>
                    );
                  })}
                  {isSelected && (
                    <>
                      <circle cx={p1.x} cy={p1.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="cursor-grab pointer-events-auto" onPointerDown={(e) => startDragHandle(drawing, 0, e)} />
                      <circle cx={p2.x} cy={p2.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="cursor-grab pointer-events-auto" onPointerDown={(e) => startDragHandle(drawing, 1, e)} />
                    </>
                  )}
                </g>
              );
            }

            // Fibonacci Extension (3 Points)
            if (drawing.tool === 'fibonacci_extension' && drawing.points.length >= 3) {
              const p1 = getCoordinates(drawing.points[0]);
              const p2 = getCoordinates(drawing.points[1]);
              const p3 = getCoordinates(drawing.points[2]);
              if (!p1 || !p2 || !p3) return null;

              const waveHeight = drawing.points[1].price - drawing.points[0].price;
              const extLevels = [
                { ratio: 0.618, label: '0.618 Ext' },
                { ratio: 1.0, label: '1.0 Ext' },
                { ratio: 1.618, label: '1.618 Ext' },
                { ratio: 2.618, label: '2.618 Ext' },
              ];

              return (
                <g
                  key={drawing.id}
                  className="pointer-events-auto cursor-move"
                  onPointerDown={(e) => startDragDrawing(drawing, e)}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                  }}
                >
                  <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#2962FF" strokeWidth={1.5} className="pointer-events-none" />
                  <line x1={p2.x} y1={p2.y} x2={p3.x} y2={p3.y} stroke="#2962FF" strokeWidth={1} strokeDasharray="3 3" className="pointer-events-none" />
                  {extLevels.map((lvl) => {
                    const extPrice = drawing.points[2].price + waveHeight * lvl.ratio;
                    const y = candleSeriesRef.current?.priceToCoordinate(extPrice);
                    if (y === null || y === undefined) return null;
                    return (
                      <g key={lvl.label} className="pointer-events-none">
                        <line x1={p3.x} y1={y} x2="100%" y2={y} stroke="#A855F7" strokeWidth={1} strokeDasharray="3 3" />
                        <text x={p3.x + 5} y={y - 3} fill="#A855F7" fontSize={9} fontFamily="monospace">
                          {lvl.label} ({extPrice.toFixed(2)})
                        </text>
                      </g>
                    );
                  })}
                  {isSelected && (
                    <>
                      <circle cx={p1.x} cy={p1.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="cursor-grab pointer-events-auto" onPointerDown={(e) => startDragHandle(drawing, 0, e)} />
                      <circle cx={p2.x} cy={p2.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="cursor-grab pointer-events-auto" onPointerDown={(e) => startDragHandle(drawing, 1, e)} />
                      <circle cx={p3.x} cy={p3.y} r={6} fill="#FFFFFF" stroke="#2962FF" strokeWidth={2} className="cursor-grab pointer-events-auto" onPointerDown={(e) => startDragHandle(drawing, 2, e)} />
                    </>
                  )}
                </g>
              );
            }

            // 3. PRICE RANGE CALCULATOR (%) TOOL
            if (
              (drawing.tool === 'price_range' || drawing.tool === 'price_percentage_measure') &&
              drawing.points.length >= 2
            ) {
              const p1 = getCoordinates(drawing.points[0]);
              const p2 = getCoordinates(drawing.points[1]);
              if (!p1 || !p2) return null;

              const startPrice = drawing.points[0].price;
              const endPrice = drawing.points[1].price;
              const deltaPrice = endPrice - startPrice;
              const pctChange = startPrice !== 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;
              const isBullish = deltaPrice >= 0;
              const themeColor = isBullish ? '#089981' : '#F23645';

              const xMin = Math.min(p1.x, p2.x);
              const yMin = Math.min(p1.y, p2.y);
              const w = Math.max(2, Math.abs(p2.x - p1.x));
              const h = Math.max(2, Math.abs(p2.y - p1.y));

              const tMin = Math.min(drawing.points[0].time, drawing.points[1].time);
              const tMax = Math.max(drawing.points[0].time, drawing.points[1].time);
              const candlesInRange = fullCandlesRef.current.filter((c) => c.time >= tMin && c.time <= tMax);
              const barCount =
                candlesInRange.length > 0
                  ? candlesInRange.length
                  : Math.max(1, Math.round((tMax - tMin) / 900));

              const tickSize = startPrice >= 1000 ? 0.1 : startPrice >= 1 ? 0.01 : 0.0001;
              const tickCount = Math.round(Math.abs(deltaPrice) / tickSize);

              const badgeW = 205;
              const badgeH = 58;
              const badgeX = Math.max(
                10,
                Math.min(
                  (chartContainerRef.current?.clientWidth || 600) - badgeW - 10,
                  (p1.x + p2.x) / 2 - badgeW / 2
                )
              );
              const badgeY = Math.max(
                10,
                Math.min(
                  (chartContainerRef.current?.clientHeight || 400) - badgeH - 10,
                  (p1.y + p2.y) / 2 - badgeH / 2
                )
              );

              return (
                <g
                  key={drawing.id}
                  className="pointer-events-auto cursor-move"
                  onPointerDown={(e) => startDragDrawing(drawing, e)}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setDrawingContextMenu({ x: e.clientX, y: e.clientY, drawing });
                  }}
                >
                  {/* Invisible hit rect for easy finger dragging on Android */}
                  <rect
                    x={xMin}
                    y={yMin}
                    width={w}
                    height={h}
                    fill="transparent"
                    style={{ pointerEvents: 'all', touchAction: 'none' }}
                    className="cursor-move"
                    onPointerDown={(e) => startDragDrawing(drawing, e)}
                  />
                  {/* Shaded Price Range Box */}
                  <rect
                    x={xMin}
                    y={yMin}
                    width={w}
                    height={h}
                    fill={themeColor}
                    fillOpacity={0.16}
                    stroke={themeColor}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    style={{ pointerEvents: 'all', touchAction: 'none' }}
                    className="cursor-move"
                    onPointerDown={(e) => startDragDrawing(drawing, e)}
                  />

                  {/* Reference Vector Line */}
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={themeColor}
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    className="pointer-events-none"
                  />

                  {/* Detailed Metric Callout Badge */}
                  <g transform={`translate(${badgeX}, ${badgeY})`} className="pointer-events-none select-none">
                    <rect
                      x={0}
                      y={0}
                      width={badgeW}
                      height={badgeH}
                      rx={6}
                      fill="#131722"
                      fillOpacity={0.94}
                      stroke={themeColor}
                      strokeWidth={1.5}
                    />
                    <text
                      x={10}
                      y={20}
                      fill={themeColor}
                      fontSize={12}
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {isBullish ? '▲ +' : '▼ '}{deltaPrice.toFixed(2)} ({isBullish ? '+' : ''}
                      {pctChange.toFixed(2)}%)
                    </text>
                    <text x={10} y={36} fill="#D1D4DC" fontSize={10} fontFamily="monospace">
                      {startPrice.toFixed(2)} → {endPrice.toFixed(2)}
                    </text>
                    <text x={10} y={49} fill="#787B86" fontSize={9.5} fontFamily="monospace">
                      {barCount} {barCount === 1 ? 'bar' : 'bars'} • {tickCount.toLocaleString()} ticks
                    </text>
                  </g>

                  {/* Selection Anchor Handles */}
                  {isSelected && (
                    <>
                      <g className="cursor-grab pointer-events-auto" onPointerDown={(e) => startDragHandle(drawing, 0, e)}>
                        <circle cx={p1.x} cy={p1.y} r={22} fill="transparent" style={{ touchAction: 'none' }} />
                        <circle cx={p1.x} cy={p1.y} r={7} fill="#FFFFFF" stroke={themeColor} strokeWidth={2.5} className="pointer-events-none" />
                      </g>
                      <g className="cursor-grab pointer-events-auto" onPointerDown={(e) => startDragHandle(drawing, 1, e)}>
                        <circle cx={p2.x} cy={p2.y} r={22} fill="transparent" style={{ touchAction: 'none' }} />
                        <circle cx={p2.x} cy={p2.y} r={7} fill="#FFFFFF" stroke={themeColor} strokeWidth={2.5} className="pointer-events-none" />
                      </g>
                    </>
                  )}
                </g>
              );
            }

            return null;
          })}

          {/* 2.2 LIVE RECTANGLE DRAG-CREATION PREVIEW */}
          {isDraggingCreation &&
            dragCreationStartRef.current &&
            currentMouseCoord &&
            activeDrawingTool === 'rectangle' &&
            (() => {
              const p1 = getCoordinates(dragCreationStartRef.current);
              if (!p1) return null;
              const p2 = currentMouseCoord;
              const baseX = Math.min(p1.x, p2.x);
              const baseY = Math.min(p1.y, p2.y);
              const baseRight = Math.max(p1.x, p2.x);
              const baseBottom = Math.max(p1.y, p2.y);
              const plotW = Math.max(0, (chartContainerRef.current?.clientWidth || 3000) - (priceScaleSettings.position === 'right' ? priceScaleWidth : 0));
              const plotLeft = priceScaleSettings.position === 'left' ? priceScaleWidth : 0;
              const chartH = chartContainerRef.current?.clientHeight || 2000;

              const x = drawingSettings.extendLeft ? plotLeft : Math.max(plotLeft, baseX);
              const right = drawingSettings.extendRight ? plotW : Math.min(plotW, baseRight);
              const y = drawingSettings.extendUp ? 0 : baseY;
              const bottom = drawingSettings.extendDown ? chartH : baseBottom;
              const w = Math.max(2, right - x);
              const h = Math.max(2, bottom - y);
              return (
                <g pointerEvents="none">
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={drawingSettings.fillColor || drawingSettings.color}
                    fillOpacity={0.25}
                    stroke={drawingSettings.color}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                  <text
                    x={x + 6}
                    y={y + 14}
                    fill={drawingSettings.color}
                    fontSize={10}
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    Rectangle Preview
                  </text>
                </g>
              );
            })()}

          {/* LIVE PRICE RANGE DRAG-CREATION PREVIEW */}
          {isDraggingCreation &&
            dragCreationStartRef.current &&
            currentMouseCoord &&
            (activeDrawingTool === 'price_range' || activeDrawingTool === 'price_percentage_measure') &&
            (() => {
              const p1 = getCoordinates(dragCreationStartRef.current);
              if (!p1 || !candleSeriesRef.current || !chartRef.current) return null;
              const p2 = currentMouseCoord;
              const xMin = Math.min(p1.x, p2.x);
              const yMin = Math.min(p1.y, p2.y);
              const w = Math.max(2, Math.abs(p2.x - p1.x));
              const h = Math.max(2, Math.abs(p2.y - p1.y));

              const startPrice = dragCreationStartRef.current.price;
              const currentPrice = candleSeriesRef.current.coordinateToPrice(p2.y) || startPrice;
              const deltaPrice = currentPrice - startPrice;
              const pctChange = startPrice !== 0 ? ((currentPrice - startPrice) / startPrice) * 100 : 0;
              const isBullish = deltaPrice >= 0;
              const themeColor = isBullish ? '#089981' : '#F23645';

              const currentTime = chartRef.current.timeScale().coordinateToTime(p2.x) as number | null;
              const tMin = Math.min(dragCreationStartRef.current.time, currentTime || dragCreationStartRef.current.time);
              const tMax = Math.max(dragCreationStartRef.current.time, currentTime || dragCreationStartRef.current.time);
              const candlesInRange = fullCandlesRef.current.filter((c) => c.time >= tMin && c.time <= tMax);
              const barCount =
                candlesInRange.length > 0
                  ? candlesInRange.length
                  : Math.max(1, Math.round((tMax - tMin) / 900));

              const tickSize = startPrice >= 1000 ? 0.1 : startPrice >= 1 ? 0.01 : 0.0001;
              const tickCount = Math.round(Math.abs(deltaPrice) / tickSize);

              const badgeW = 205;
              const badgeH = 58;
              const badgeX = Math.max(
                10,
                Math.min(
                  (chartContainerRef.current?.clientWidth || 600) - badgeW - 10,
                  (p1.x + p2.x) / 2 - badgeW / 2
                )
              );
              const badgeY = Math.max(
                10,
                Math.min(
                  (chartContainerRef.current?.clientHeight || 400) - badgeH - 10,
                  (p1.y + p2.y) / 2 - badgeH / 2
                )
              );

              return (
                <g pointerEvents="none" className="select-none">
                  <rect
                    x={xMin}
                    y={yMin}
                    width={w}
                    height={h}
                    fill={themeColor}
                    fillOpacity={0.18}
                    stroke={themeColor}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                  />
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={themeColor}
                    strokeWidth={2}
                    strokeDasharray="3 3"
                  />
                  <g transform={`translate(${badgeX}, ${badgeY})`}>
                    <rect
                      x={0}
                      y={0}
                      width={badgeW}
                      height={badgeH}
                      rx={6}
                      fill="#131722"
                      fillOpacity={0.95}
                      stroke={themeColor}
                      strokeWidth={1.5}
                    />
                    <text
                      x={10}
                      y={20}
                      fill={themeColor}
                      fontSize={12}
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {isBullish ? '▲ +' : '▼ '}{deltaPrice.toFixed(2)} ({isBullish ? '+' : ''}
                      {pctChange.toFixed(2)}%)
                    </text>
                    <text x={10} y={36} fill="#D1D4DC" fontSize={10} fontFamily="monospace">
                      {startPrice.toFixed(2)} → {currentPrice.toFixed(2)}
                    </text>
                    <text x={10} y={49} fill="#787B86" fontSize={9.5} fontFamily="monospace">
                      {barCount} {barCount === 1 ? 'bar' : 'bars'} • {tickCount.toLocaleString()} ticks
                    </text>
                  </g>
                </g>
              );
            })()}

          {/* ACTIVE 2-POINT / 3-POINT LIVE LINE PREVIEW */}
          {((isDraggingCreation &&
            dragCreationStartRef.current &&
            activeDrawingTool !== 'rectangle' &&
            activeDrawingTool !== 'price_range' &&
            activeDrawingTool !== 'price_percentage_measure') ||
            (creationPoints.length > 0 && activeDrawingTool !== 'cursor')) &&
            currentMouseCoord &&
            (() => {
              const startPt =
                creationPoints.length > 0
                  ? creationPoints[creationPoints.length - 1]
                  : dragCreationStartRef.current;
              if (!startPt) return null;
              const startCoords = getCoordinates(startPt);
              if (!startCoords) return null;
              return (
                <line
                  x1={startCoords.x}
                  y1={startCoords.y}
                  x2={currentMouseCoord.x}
                  y2={currentMouseCoord.y}
                  stroke={drawingSettings.color}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  pointerEvents="none"
                />
              );
            })()}

          {/* Active Freehand Brush preview */}
          {isBrushDrawing && activeBrushPoints.length > 1 && (
            <path
              d={
                `M ${getCoordinates(activeBrushPoints[0])?.x || 0} ${getCoordinates(activeBrushPoints[0])?.y || 0} ` +
                activeBrushPoints
                  .slice(1)
                  .map((p) => {
                    const c = getCoordinates(p);
                    return c ? `L ${c.x} ${c.y}` : '';
                  })
                  .join(' ')
              }
              fill="none"
              stroke={drawingSettings.color}
              strokeWidth={drawingSettings.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          )}

          {/* Bar Replay Cutoff Marker */}
          {replayState.isActive && replayState.cutoffTime && (() => {
            const coord = getCoordinates({
              time: replayState.cutoffTime,
              price: activeCandleRef.current?.close || 0,
            });
            if (!coord) return null;
            return (
              <g className="pointer-events-none">
                <line x1={coord.x} y1={0} x2={coord.x} y2="100%" stroke="#2962FF" strokeWidth={2} strokeDasharray="4 4" />
                <rect x={coord.x - 44} y={46} width={88} height={22} rx={4} fill="#2962FF" fillOpacity={0.9} />
                <text x={coord.x} y={61} fill="#FFFFFF" fontSize={10} fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">
                  Replay Start
                </text>
              </g>
            );
          })()}
          </g>
        </svg>

        {/* FLOATING ACTION TOOLBAR FOR SELECTED DRAWING - ONLY USE OR DELETE OPTION */}
        {selectedDrawing && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            style={{
              top: '56px',
              left: '50%',
              transform: 'translateX(-50%)',
            }}
            className="absolute z-50 flex items-center gap-2 px-3 py-1.5 bg-[#1E222D]/95 border border-[#2B2F3A] rounded-xl shadow-2xl backdrop-blur-md select-none text-xs pointer-events-auto"
          >
            <span className="text-[11px] uppercase font-bold text-[#D1D4DC] pr-1 whitespace-nowrap">
              {selectedDrawing.tool.replace(/_/g, ' ')}
            </span>

            {/* USE BUTTON */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedDrawingId(null);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-[#089981] hover:bg-[#067a68] text-white flex items-center gap-1.5 font-bold text-xs cursor-pointer shadow-md transition-all active:scale-95 touch-manipulation whitespace-nowrap"
              title="Use / Keep this drawing"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Use</span>
            </button>

            {/* DELETE BUTTON */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDeleteDrawing(selectedDrawing.id);
                setSelectedDrawingId(null);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-[#F23645]/20 hover:bg-[#F23645] text-[#F23645] hover:text-white flex items-center gap-1.5 font-semibold text-xs cursor-pointer transition-all active:scale-95 touch-manipulation whitespace-nowrap"
              title="Delete this drawing"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        )}

        {/* Live Candle Countdown Timer Badge adjacent to active price line */}
        {activePriceY !== null && activePriceY > 0 && (
          <div
            style={{
              top: `${activePriceY + 12}px`,
              right: priceScaleSettings.position === 'right' ? 0 : 'auto',
              left: priceScaleSettings.position === 'left' ? 0 : 'auto',
            }}
            className={`absolute z-20 bg-[#1E222D] text-[#787B86] px-1.5 py-0.5 text-[9px] font-mono border border-[#2B2F3A] pointer-events-none select-none flex items-center gap-1 shadow-sm ${
              priceScaleSettings.position === 'right' ? 'rounded-l border-r-0' : 'rounded-r border-l-0'
            }`}
          >
            <Clock className="w-2.5 h-2.5 text-[#2962FF]" />
            <span>{countdownText}</span>
          </div>
        )}
      </div>

      {/* 1. BOTTOM CHART FOOTER WITH TRADINGVIEW PRICE SCALE CONTROLS */}
      <div className="h-7 bg-[#1E222D] border-t border-[#2B2F3A] flex items-center justify-between px-3 text-[11px] text-[#787B86] shrink-0 z-20">
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#089981]" />
            <span>Binance Futures USDT.P</span>
          </span>
          <span className="text-[#2B2F3A]">|</span>
          <span>Drawings: {drawings.length}</span>
          {priceScaleSettings.lockPriceScale && (
            <>
              <span className="text-[#2B2F3A]">|</span>
              <span className="text-[#F59E0B] font-bold">Scale Locked</span>
            </>
          )}
          {magnetMode && (
            <>
              <span className="text-[#2B2F3A]">|</span>
              <span className="text-[#2962FF] font-bold">Magnet ON</span>
            </>
          )}
        </div>

        {/* Functional Scale Buttons & Gear Trigger */}
        <div className="flex items-center gap-1">
          {/* Auto Scale Button */}
          <button
            onClick={() => updatePriceScaleSettings({ autoScale: !priceScaleSettings.autoScale })}
            className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer ${
              priceScaleSettings.autoScale && !priceScaleSettings.lockPriceScale
                ? 'bg-[#2962FF] text-white'
                : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
            }`}
            title="Toggle Auto Scale (Fit Data to Viewport)"
          >
            auto
          </button>

          {/* Logarithmic Scale Button */}
          <button
            onClick={() =>
              updatePriceScaleSettings({
                mode:
                  priceScaleSettings.mode === PriceScaleMode.Logarithmic
                    ? PriceScaleMode.Normal
                    : PriceScaleMode.Logarithmic,
              })
            }
            className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer ${
              priceScaleSettings.mode === PriceScaleMode.Logarithmic
                ? 'bg-[#2962FF] text-white'
                : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
            }`}
            title="Toggle Logarithmic Scale"
          >
            log
          </button>

          {/* Percentage Scale Button */}
          <button
            onClick={() =>
              updatePriceScaleSettings({
                mode:
                  priceScaleSettings.mode === PriceScaleMode.Percentage
                    ? PriceScaleMode.Normal
                    : PriceScaleMode.Percentage,
              })
            }
            className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer ${
              priceScaleSettings.mode === PriceScaleMode.Percentage
                ? 'bg-[#2962FF] text-white'
                : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
            }`}
            title="Toggle Percentage Scale"
          >
            %
          </button>

          {/* Invert Scale Button */}
          <button
            onClick={() => updatePriceScaleSettings({ invertScale: !priceScaleSettings.invertScale })}
            className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors cursor-pointer ${
              priceScaleSettings.invertScale
                ? 'bg-[#F59E0B] text-black font-extrabold'
                : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
            }`}
            title="Invert Price Scale (Flip Bullish/Bearish)"
          >
            inv
          </button>

          {/* Reset Scale & Fit Content */}
          <button
            onClick={() => {
              if (!chartRef.current) return;
              chartRef.current.timeScale().resetTimeScale();
              chartRef.current.timeScale().fitContent();
              updatePriceScaleSettings({
                autoScale: true,
                lockPriceScale: false,
                invertScale: false,
                mode: PriceScaleMode.Normal,
              });
            }}
            className="px-1.5 py-0.5 text-[10px] text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] rounded transition-colors cursor-pointer"
            title="Reset Scale & Viewport"
          >
            <RefreshCw className="w-3 h-3" />
          </button>

          {/* Price Scale Settings Gear Button */}
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setShowPriceScaleMenu({
                x: Math.min(window.innerWidth - 240, rect.left - 180),
                y: Math.min(window.innerHeight - 340, rect.top - 280),
              });
            }}
            className="p-1 text-[#787B86] hover:text-[#2962FF] hover:bg-[#2A2E39] rounded transition-colors cursor-pointer"
            title="Price Scale Context Menu & Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 1. PROFESSIONAL TRADINGVIEW PRICE SCALE CONTEXT MENU */}
      {showPriceScaleMenu && (
        <div
          ref={priceScaleMenuRef}
          style={{ top: showPriceScaleMenu.y, left: showPriceScaleMenu.x }}
          className="fixed z-50 bg-[#1E222D] border border-[#2B2F3A] rounded-xl shadow-2xl py-1.5 text-xs text-[#D1D4DC] min-w-56 select-none backdrop-blur-md"
        >
          <div className="px-3 py-1.5 text-[11px] font-bold text-white border-b border-[#2B2F3A] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#2962FF]" />
              Price Scale Settings
            </span>
          </div>

          {/* Toggles */}
          <div className="py-1">
            <label
              onClick={() => updatePriceScaleSettings({ autoScale: !priceScaleSettings.autoScale })}
              className="flex items-center justify-between px-3 py-1.5 hover:bg-[#2A2E39] cursor-pointer transition-colors"
            >
              <span>Auto Scale (Fit Visible Range)</span>
              <input
                type="checkbox"
                checked={priceScaleSettings.autoScale && !priceScaleSettings.lockPriceScale}
                readOnly
                className="rounded text-[#2962FF] focus:ring-0"
              />
            </label>

            <label
              onClick={() => updatePriceScaleSettings({ lockPriceScale: !priceScaleSettings.lockPriceScale })}
              className="flex items-center justify-between px-3 py-1.5 hover:bg-[#2A2E39] cursor-pointer transition-colors"
            >
              <span>Lock Price Scale</span>
              <input
                type="checkbox"
                checked={priceScaleSettings.lockPriceScale}
                readOnly
                className="rounded text-[#2962FF] focus:ring-0"
              />
            </label>

            <label
              onClick={() => updatePriceScaleSettings({ invertScale: !priceScaleSettings.invertScale })}
              className="flex items-center justify-between px-3 py-1.5 hover:bg-[#2A2E39] cursor-pointer transition-colors"
            >
              <span>Invert Scale</span>
              <input
                type="checkbox"
                checked={priceScaleSettings.invertScale}
                readOnly
                className="rounded text-[#2962FF] focus:ring-0"
              />
            </label>
          </div>

          <div className="h-px bg-[#2B2F3A] my-1" />

          {/* Scale Modes */}
          <div className="px-3 py-1 text-[10px] uppercase font-semibold text-[#787B86]">
            Scale Mode
          </div>
          <button
            onClick={() => updatePriceScaleSettings({ mode: PriceScaleMode.Normal })}
            className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-[#2A2E39] cursor-pointer transition-colors ${
              priceScaleSettings.mode === PriceScaleMode.Normal ? 'text-[#2962FF] font-semibold' : ''
            }`}
          >
            <span>Regular (Linear)</span>
            {priceScaleSettings.mode === PriceScaleMode.Normal && <Check className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => updatePriceScaleSettings({ mode: PriceScaleMode.Logarithmic })}
            className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-[#2A2E39] cursor-pointer transition-colors ${
              priceScaleSettings.mode === PriceScaleMode.Logarithmic ? 'text-[#2962FF] font-semibold' : ''
            }`}
          >
            <span>Logarithmic</span>
            {priceScaleSettings.mode === PriceScaleMode.Logarithmic && <Check className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => updatePriceScaleSettings({ mode: PriceScaleMode.Percentage })}
            className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-[#2A2E39] cursor-pointer transition-colors ${
              priceScaleSettings.mode === PriceScaleMode.Percentage ? 'text-[#2962FF] font-semibold' : ''
            }`}
          >
            <span>Percentage (%)</span>
            {priceScaleSettings.mode === PriceScaleMode.Percentage && <Check className="w-3.5 h-3.5" />}
          </button>

          <div className="h-px bg-[#2B2F3A] my-1" />

          {/* Scale Position */}
          <div className="px-3 py-1 text-[10px] uppercase font-semibold text-[#787B86]">
            Scale Placement
          </div>
          <div className="grid grid-cols-2 gap-1 px-3 py-1">
            <button
              onClick={() => updatePriceScaleSettings({ position: 'right' })}
              className={`py-1 text-center rounded border text-xs cursor-pointer ${
                priceScaleSettings.position === 'right'
                  ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-bold'
                  : 'border-[#2B2F3A] text-[#787B86] hover:text-[#D1D4DC]'
              }`}
            >
              Pin to Right
            </button>
            <button
              onClick={() => updatePriceScaleSettings({ position: 'left' })}
              className={`py-1 text-center rounded border text-xs cursor-pointer ${
                priceScaleSettings.position === 'left'
                  ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-bold'
                  : 'border-[#2B2F3A] text-[#787B86] hover:text-[#D1D4DC]'
              }`}
            >
              Pin to Left
            </button>
          </div>

          <div className="h-px bg-[#2B2F3A] my-1" />

          {/* Price Precision */}
          <div className="px-3 py-1 text-[10px] uppercase font-semibold text-[#787B86]">
            Decimal Precision
          </div>
          <div className="grid grid-cols-3 gap-1 px-3 py-1 text-[11px] font-mono">
            {(['auto', 2, 3, 4, 6, 8] as const).map((prec) => (
              <button
                key={prec}
                onClick={() => updatePriceScaleSettings({ precision: prec })}
                className={`py-1 rounded border text-center transition-colors cursor-pointer ${
                  priceScaleSettings.precision === prec
                    ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-bold'
                    : 'border-[#2B2F3A] text-[#787B86] hover:text-[#D1D4DC]'
                }`}
              >
                {prec === 'auto' ? 'Auto' : `${prec} Dec`}
              </button>
            ))}
          </div>

          <div className="h-px bg-[#2B2F3A] my-1" />

          {/* Reset scale */}
          <button
            onClick={() => {
              if (chartRef.current) {
                chartRef.current.timeScale().resetTimeScale();
                chartRef.current.timeScale().fitContent();
              }
              updatePriceScaleSettings({
                autoScale: true,
                lockPriceScale: false,
                invertScale: false,
                mode: PriceScaleMode.Normal,
                position: 'right',
                precision: 'auto',
              });
              setShowPriceScaleMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#2A2E39] text-[#787B86] hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Price Scale</span>
          </button>
        </div>
      )}

      {/* Right Click Context Menu on Canvas */}
      {showRightClickMenu && (
        <div
          ref={contextMenuRef}
          style={{ top: showRightClickMenu.y, left: showRightClickMenu.x }}
          className="fixed z-50 bg-[#1E222D] border border-[#2B2F3A] rounded-lg shadow-2xl py-1 text-xs text-[#D1D4DC] min-w-48 select-none backdrop-blur-md"
        >
          <button
            onClick={() => {
              onOpenAlertModal(showRightClickMenu.price);
              setShowRightClickMenu(null);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[#2A2E39] flex items-center gap-2 cursor-pointer transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5 text-[#2962FF]" />
            <span>Add Alert at {showRightClickMenu.price.toFixed(2)}</span>
          </button>
          <button
            onClick={() => {
              const id = 'drawing_' + Date.now();
              onAddDrawing({
                id,
                tool: 'horizontal_line',
                points: [{ time: showRightClickMenu.time || Math.floor(Date.now() / 1000), price: showRightClickMenu.price }],
                color: drawingSettings.color || '#2962FF',
                lineWidth: drawingSettings.lineWidth || 2,
                extendLeft: true,
                extendRight: true,
              });
              setSelectedDrawingId(id);
              setShowRightClickMenu(null);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[#2A2E39] flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#089981]" />
            <span>Draw Horizontal Line ({showRightClickMenu.price.toFixed(2)})</span>
          </button>

          <button
            onClick={() => {
              const clickTime = showRightClickMenu.time || Math.floor(Date.now() / 1000);
              const p = showRightClickMenu.price;
              const span = 15 * 60 * 8;
              const id = 'drawing_' + Date.now();
              onAddDrawing({
                id,
                tool: 'rectangle',
                points: [
                  { time: clickTime - span, price: p * 1.008 },
                  { time: clickTime + span, price: p * 0.992 },
                ],
                color: drawingSettings.color || '#2962FF',
                fillColor: drawingSettings.fillColor || drawingSettings.color || '#2962FF',
                fillOpacity: drawingSettings.fillOpacity || 0.16,
                lineWidth: drawingSettings.lineWidth || 2,
              });
              setSelectedDrawingId(id);
              setShowRightClickMenu(null);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[#2A2E39] flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Square className="w-3.5 h-3.5 text-[#2962FF]" />
            <span>Draw Rectangle ({showRightClickMenu.price.toFixed(2)})</span>
          </button>

          <button
            onClick={() => {
              const clickTime = showRightClickMenu.time || Math.floor(Date.now() / 1000);
              const p = showRightClickMenu.price;
              const span = 15 * 60 * 10;
              const id = 'drawing_' + Date.now();
              onAddDrawing({
                id,
                tool: 'price_range',
                points: [
                  { time: clickTime - span, price: p },
                  { time: clickTime, price: p * 1.015 },
                ],
                color: '#089981',
                fillColor: '#089981',
                fillOpacity: 0.16,
                lineWidth: 1.5,
              });
              setSelectedDrawingId(id);
              setShowRightClickMenu(null);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[#2A2E39] flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Percent className="w-3.5 h-3.5 text-[#E040FB]" />
            <span>Draw Price Scale / Range (%) ({showRightClickMenu.price.toFixed(2)})</span>
          </button>

          <div className="h-px bg-[#2B2F3A] my-0.5" />
          <button
            onClick={() => {
              setShowPriceScaleMenu({
                x: showRightClickMenu.x,
                y: Math.min(window.innerHeight - 340, showRightClickMenu.y),
              });
              setShowRightClickMenu(null);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[#2A2E39] flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-[#787B86]" />
            <span>Price Scale Settings...</span>
          </button>
        </div>
      )}

      {/* Dedicated Context Menu for Right-Click on an existing Drawing */}
      {drawingContextMenu && (
        <div
          ref={drawingContextMenuRef}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          style={{ top: drawingContextMenu.y, left: drawingContextMenu.x }}
          className="fixed z-50 bg-[#1E222D] border border-[#2B2F3A] rounded-lg shadow-2xl py-1 text-xs text-[#D1D4DC] min-w-48 select-none backdrop-blur-md pointer-events-auto"
        >
          <div className="px-3 py-1 text-[10px] uppercase font-bold text-[#787B86] border-b border-[#2B2F3A]">
            {drawingContextMenu.drawing.tool.replace(/_/g, ' ')}
          </div>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setPropertiesModalDrawing(drawingContextMenu.drawing);
              setDrawingContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#2A2E39] flex items-center gap-2 cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5 text-[#2962FF]" />
            <span>Settings / Properties</span>
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              const dup: DrawingItem = {
                ...drawingContextMenu.drawing,
                id: 'drawing_' + Date.now(),
                points: drawingContextMenu.drawing.points.map((p) => ({
                  time: p.time + 60,
                  price: p.price * 1.002,
                })),
              };
              onAddDrawing(dup);
              setSelectedDrawingId(dup.id);
              setDrawingContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#2A2E39] flex items-center gap-2 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-[#089981]" />
            <span>Duplicate Drawing</span>
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              onUpdateDrawing({
                ...drawingContextMenu.drawing,
                locked: !drawingContextMenu.drawing.locked,
              });
              setDrawingContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#2A2E39] flex items-center gap-2 cursor-pointer"
          >
            {drawingContextMenu.drawing.locked ? (
              <>
                <Unlock className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>Unlock Drawing</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span>Lock Drawing</span>
              </>
            )}
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              onUpdateDrawing({
                ...drawingContextMenu.drawing,
                hidden: !drawingContextMenu.drawing.hidden,
              });
              setDrawingContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#2A2E39] flex items-center gap-2 cursor-pointer"
          >
            <EyeOff className="w-3.5 h-3.5 text-[#787B86]" />
            <span>Hide Drawing</span>
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDeleteDrawing(drawingContextMenu.drawing.id);
              setSelectedDrawingId(null);
              setDrawingContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#2A2E39] flex items-center gap-2 text-[#F23645] cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Drawing</span>
          </button>
        </div>
      )}

      {/* Drawing Properties Modal */}
      {propertiesModalDrawing && (
        <DrawingPropertiesModal
          drawing={propertiesModalDrawing}
          defaultSettings={drawingSettings}
          onClose={() => setPropertiesModalDrawing(null)}
          onApply={(updated) => {
            onUpdateDrawing(updated);
            setPropertiesModalDrawing(null);
          }}
          onSaveAsDefault={() => {
            onOpenSettingsModal?.();
          }}
        />
      )}
    </div>
  );
};
