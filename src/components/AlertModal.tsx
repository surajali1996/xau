import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  Plus,
  Trash2,
  RotateCcw,
  Volume2,
  VolumeX,
  PlayCircle,
  CheckCircle2,
  Settings,
  Vibrate,
  Pencil,
  Power,
  Info,
  Clock,
  Globe,
  Smartphone,
  Server,
  Send,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import {
  PriceAlert,
  PriceType,
  AlertCondition,
  AlertSoundType,
  AlertStatus,
  AlertRepeatType,
  AlertEngineSettings,
} from '../types';
import { alertEngine } from '../services/alertEngine';
import { fcmService } from '../services/fcmService';
import { backendAlertApi } from '../services/backendAlertApi';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSymbol: string;
  currentPrice: number;
  currentTimeframe?: string;
  priceType: PriceType;
  onAlertsChanged: () => void;
}

export const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  onClose,
  currentSymbol,
  currentPrice,
  currentTimeframe = '15m',
  priceType,
  onAlertsChanged,
}) => {
  const [tab, setTab] = useState<'create' | 'list' | 'settings' | 'push'>('create');
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);

  // Form states
  const [alertName, setAlertName] = useState<string>('');
  const [priceInput, setPriceInput] = useState<string>('');
  const [condition, setCondition] = useState<AlertCondition>('crossing_up');
  const [timeframe, setTimeframe] = useState<string>(currentTimeframe);
  const [repeat, setRepeat] = useState<AlertRepeatType>('once');
  const [expiration, setExpiration] = useState<string>('none');
  const [sound, setSound] = useState<AlertSoundType>('price_reach');
  const [vibrate, setVibrate] = useState<boolean>(true);
  const [browserNotification, setBrowserNotification] = useState<boolean>(true);
  const [pushNotification, setPushNotification] = useState<boolean>(true);
  const [note, setNote] = useState<string>('');

  // Settings states
  const [settings, setSettings] = useState<AlertEngineSettings>(alertEngine.getSettings());

  // Push Tab States
  const [backendUrlInput, setBackendUrlInput] = useState<string>(backendAlertApi.getBackendUrl());
  const [isRegisteringPush, setIsRegisteringPush] = useState<boolean>(false);
  const [pushStatusMsg, setPushStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(fcmService.getPermissionStatus());

  // Alerts list & feedback
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAlerts(alertEngine.getAlerts());
      setSettings(alertEngine.getSettings());
      setPermissionStatus(fcmService.getPermissionStatus());
      setBackendUrlInput(backendAlertApi.getBackendUrl());
      if (!editingAlertId) {
        const formattedPrice = currentPrice
          ? currentPrice >= 1000
            ? currentPrice.toFixed(2)
            : currentPrice >= 1
            ? currentPrice.toFixed(3)
            : currentPrice.toFixed(4)
          : '';
        setPriceInput(formattedPrice);
        setAlertName(`${currentSymbol} Alert at ${formattedPrice}`);
        setTimeframe(currentTimeframe);
        setPushNotification(true);
      }
      setSuccessMsg('');
    }
  }, [isOpen, currentPrice, currentSymbol, currentTimeframe, editingAlertId]);

  const handleEnablePush = async () => {
    setIsRegisteringPush(true);
    setPushStatusMsg(null);
    try {
      const res = await fcmService.enablePushNotifications();
      setPermissionStatus(res.permission);
      setPushStatusMsg({ text: res.message, isError: !res.success });
    } catch (err: any) {
      setPushStatusMsg({ text: err.message || 'Failed to enable push notifications', isError: true });
    } finally {
      setIsRegisteringPush(false);
    }
  };

  const handleSendTestPush = async () => {
    setIsSendingTest(true);
    setPushStatusMsg(null);
    try {
      const res = await fcmService.sendTestNotification();
      setPushStatusMsg({ text: res.message, isError: !res.success });
      if (res.success) {
        handleLoadHistory();
      }
    } catch (err: any) {
      setPushStatusMsg({ text: err.message || 'Failed to dispatch test notification', isError: true });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleLoadHistory = async () => {
    setIsLoadingLogs(true);
    try {
      const logs = await backendAlertApi.fetchNotificationHistory();
      setHistoryLogs(logs);
    } catch {
      // Ignore
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleSaveBackendUrl = () => {
    backendAlertApi.setBackendUrl(backendUrlInput.trim());
    setPushStatusMsg({ text: 'Cloudflare Worker backend URL updated and saved!', isError: false });
  };

  if (!isOpen) return null;

  const soundOptions: { id: AlertSoundType; label: string; desc: string }[] = [
    { id: 'price_reach', label: 'Price Reach', desc: 'Long, resonant harmonic chime' },
    { id: 'price_rise', label: 'Price Rise', desc: 'Ascending melodic flourish' },
    { id: 'price_drop', label: 'Price Drop', desc: 'Descending cascade tone' },
    { id: 'price_cross_above', label: 'Price Cross Above', desc: 'Sharp rising double bell strike' },
    { id: 'price_cross_below', label: 'Price Cross Below', desc: 'Deep falling gong resonance' },
  ];

  const handleSaveAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parseFloat(priceInput);
    if (isNaN(parsedPrice) || parsedPrice <= 0) return;

    let expirationTimestamp: number | undefined = undefined;
    const now = Date.now();
    if (expiration === '1d') expirationTimestamp = now + 86400000;
    else if (expiration === '7d') expirationTimestamp = now + 7 * 86400000;
    else if (expiration === '30d') expirationTimestamp = now + 30 * 86400000;

    const resolvedName = alertName.trim() || `${currentSymbol} ${condition.replace(/_/g, ' ')} ${parsedPrice}`;

    if (editingAlertId) {
      // Update existing alert
      alertEngine.updateAlert(editingAlertId, {
        name: resolvedName,
        price: parsedPrice,
        condition,
        timeframe,
        repeat,
        expiration,
        expirationTimestamp,
        sound,
        vibrate,
        browserNotification,
        pushNotification,
        note: note.trim() || undefined,
        status: 'active',
      });
      setSuccessMsg(`Alert updated for ${parsedPrice.toLocaleString()}`);
      setEditingAlertId(null);
    } else {
      // Create new alert
      alertEngine.addAlert({
        symbol: currentSymbol,
        name: resolvedName,
        price: parsedPrice,
        condition,
        createdPrice: currentPrice || parsedPrice,
        repeat,
        timeframe,
        expiration,
        expirationTimestamp,
        note: note.trim() || undefined,
        sound,
        vibrate,
        browserNotification,
        pushNotification,
        priceType,
      });
      setSuccessMsg(`Alert set for ${currentSymbol} at ${parsedPrice.toLocaleString()}`);
    }

    setAlerts(alertEngine.getAlerts());
    onAlertsChanged();
    setTimeout(() => {
      setSuccessMsg('');
      setTab('list');
    }, 700);
  };

  const handleStartEdit = (alert: PriceAlert) => {
    setEditingAlertId(alert.id);
    setAlertName(alert.name || `${alert.symbol} Alert`);
    setPriceInput(alert.price.toString());
    setCondition(alert.condition);
    setTimeframe(alert.timeframe || currentTimeframe);
    setRepeat(alert.repeat);
    setExpiration(typeof alert.expiration === 'string' ? alert.expiration : 'none');
    setSound(alert.sound || 'price_reach');
    setVibrate(alert.vibrate !== false);
    setBrowserNotification(alert.browserNotification !== false);
    setPushNotification(alert.pushNotification !== false);
    setNote(alert.note || '');
    setTab('create');
  };

  const handleDelete = (id: string) => {
    alertEngine.deleteAlert(id);
    setAlerts(alertEngine.getAlerts());
    onAlertsChanged();
  };

  const handleToggleStatus = (id: string, currentStatus: AlertStatus) => {
    const nextStatus: AlertStatus = currentStatus === 'active' ? 'disabled' : 'active';
    alertEngine.setAlertStatus(id, nextStatus);
    setAlerts(alertEngine.getAlerts());
    onAlertsChanged();
  };

  const handleReset = (id: string) => {
    alertEngine.setAlertStatus(id, 'active');
    setAlerts(alertEngine.getAlerts());
    onAlertsChanged();
  };

  const handleUpdateVolume = (vol: number) => {
    const updated = { ...settings, volume: vol };
    setSettings(updated);
    alertEngine.updateSettings(updated);
  };

  const handleToggleGlobalSound = () => {
    const updated = { ...settings, soundEnabled: !settings.soundEnabled };
    setSettings(updated);
    alertEngine.updateSettings(updated);
  };

  const handleToggleGlobalVibration = () => {
    const updated = { ...settings, vibrationEnabled: !settings.vibrationEnabled };
    setSettings(updated);
    alertEngine.updateSettings(updated);
    if (updated.vibrationEnabled) {
      alertEngine.triggerVibration([100, 50, 100]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 select-none">
      <div className="bg-[#1E222D] border border-[#2B2F3A] rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-[#D1D4DC] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2B2F3A] bg-[#181B24]">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#2962FF]" />
            <span className="text-sm font-semibold text-white">
              {editingAlertId ? 'Edit Alert' : `Create Alert on ${currentSymbol}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab('settings')}
              className={`p-1.5 rounded transition-colors ${
                tab === 'settings' ? 'text-[#2962FF] bg-[#2A2E39]' : 'text-[#787B86] hover:text-[#D1D4DC]'
              }`}
              title="Alert Audio & Vibration Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="text-[#787B86] hover:text-[#D1D4DC] p-1 rounded hover:bg-[#2A2E39] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-4 border-b border-[#2B2F3A] bg-[#181B24] text-[11px] font-medium">
          <button
            onClick={() => {
              setEditingAlertId(null);
              setTab('create');
            }}
            className={`py-2 text-center transition-colors border-b-2 flex items-center justify-center gap-1 cursor-pointer ${
              tab === 'create'
                ? 'border-[#2962FF] text-[#2962FF] bg-[#1E222D]'
                : 'border-transparent text-[#787B86] hover:text-[#D1D4DC]'
            }`}
          >
            <Plus className="w-3 h-3" />
            <span>{editingAlertId ? 'Edit' : 'Create'}</span>
          </button>
          <button
            onClick={() => setTab('list')}
            className={`py-2 text-center transition-colors border-b-2 flex items-center justify-center gap-1 cursor-pointer ${
              tab === 'list'
                ? 'border-[#2962FF] text-[#2962FF] bg-[#1E222D]'
                : 'border-transparent text-[#787B86] hover:text-[#D1D4DC]'
            }`}
          >
            <Bell className="w-3 h-3" />
            <span>Alerts ({alerts.length})</span>
          </button>
          <button
            onClick={() => {
              setTab('push');
              if (historyLogs.length === 0) handleLoadHistory();
            }}
            className={`py-2 text-center transition-colors border-b-2 flex items-center justify-center gap-1 cursor-pointer ${
              tab === 'push'
                ? 'border-[#2962FF] text-[#2962FF] bg-[#1E222D]'
                : 'border-transparent text-[#787B86] hover:text-[#D1D4DC]'
            }`}
          >
            <Smartphone className="w-3 h-3 text-[#2962FF]" />
            <span>Push 24/7</span>
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`py-2 text-center transition-colors border-b-2 flex items-center justify-center gap-1 cursor-pointer ${
              tab === 'settings'
                ? 'border-[#2962FF] text-[#2962FF] bg-[#1E222D]'
                : 'border-transparent text-[#787B86] hover:text-[#D1D4DC]'
            }`}
          >
            <Volume2 className="w-3 h-3" />
            <span>Sounds</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* TAB 1: CREATE / EDIT */}
          {tab === 'create' && (
            <form onSubmit={handleSaveAlert} className="flex flex-col gap-3.5 text-xs">
              {successMsg && (
                <div className="p-2.5 rounded bg-[#089981]/20 border border-[#089981]/40 text-[#089981] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Symbol & Market Price banner */}
              <div className="flex items-center justify-between p-2.5 bg-[#131722] rounded-lg border border-[#2B2F3A]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{currentSymbol}</span>
                  <span className="text-[10px] font-mono px-1 rounded bg-[#2A2E39] text-[#2962FF] uppercase">
                    USDT.P
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#787B86] block">Market Price</span>
                  <span className="font-mono font-bold text-white">
                    {currentPrice ? currentPrice.toLocaleString() : '--'} USDT
                  </span>
                </div>
              </div>

              {/* Alert Name */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                  Alert Name
                </label>
                <input
                  type="text"
                  value={alertName}
                  onChange={(e) => setAlertName(e.target.value)}
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-3 py-2 text-xs text-[#D1D4DC] focus:border-[#2962FF] focus:outline-none placeholder-[#787B86]"
                  placeholder="e.g. Major resistance breakout"
                />
              </div>

              {/* Trigger Price: Automatically prefilled from crosshair / chart level */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                    Trigger Price (USDT)
                  </label>
                  <span className="text-[10px] text-[#2962FF] font-mono">Prefilled from Chart</span>
                </div>
                <input
                  type="number"
                  step="any"
                  required
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-3 py-2 text-sm font-mono font-bold text-white focus:border-[#2962FF] focus:outline-none"
                  placeholder="e.g. 77500"
                />
              </div>

              {/* Trigger Condition: Crossing Up, Crossing Down, Greater Than, Less Than, Price Reaches, Candle Closes Above, Candle Closes Below */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                  Trigger Condition
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as AlertCondition)}
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-3 py-2 text-xs text-[#D1D4DC] focus:border-[#2962FF] focus:outline-none cursor-pointer"
                >
                  <option value="crossing_up">Crossing Up (Moves above target)</option>
                  <option value="crossing_down">Crossing Down (Moves below target)</option>
                  <option value="greater_than">Greater Than (&ge; Target Price)</option>
                  <option value="less_than">Less Than (&le; Target Price)</option>
                  <option value="price_reach">Price Reaches (Exact Price Touch)</option>
                  <option value="candle_close_above">Candle Closes Above Target Price</option>
                  <option value="candle_close_below">Candle Closes Below Target Price</option>
                  <option value="crossing">Crossing (Either Up or Down)</option>
                  <option value="price_rise">Price Rise (Bullish surge)</option>
                  <option value="price_drop">Price Drop (Bearish dump)</option>
                </select>
              </div>

              {/* Selected Timeframe */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                  Candle Timeframe
                </label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-3 py-2 text-xs text-[#D1D4DC] focus:border-[#2962FF] focus:outline-none cursor-pointer font-mono"
                >
                  <option value="1m">1m (1 Minute)</option>
                  <option value="3m">3m (3 Minutes)</option>
                  <option value="5m">5m (5 Minutes)</option>
                  <option value="15m">15m (15 Minutes)</option>
                  <option value="30m">30m (30 Minutes)</option>
                  <option value="1h">1h (1 Hour)</option>
                  <option value="4h">4h (4 Hours)</option>
                  <option value="1D">1D (1 Day)</option>
                  <option value="1W">1W (1 Week)</option>
                </select>
              </div>

              {/* Trigger Frequency / Repeat: Once, Once Per Bar, Once Per Bar Close */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                  Trigger Frequency
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRepeat('once')}
                    className={`py-1.5 px-2 rounded text-xs border text-center transition-colors cursor-pointer ${
                      repeat === 'once'
                        ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-semibold'
                        : 'border-[#2B2F3A] bg-[#131722] text-[#787B86] hover:text-[#D1D4DC]'
                    }`}
                  >
                    Once
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepeat('once_per_bar')}
                    className={`py-1.5 px-2 rounded text-xs border text-center transition-colors cursor-pointer ${
                      repeat === 'once_per_bar'
                        ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-semibold'
                        : 'border-[#2B2F3A] bg-[#131722] text-[#787B86] hover:text-[#D1D4DC]'
                    }`}
                  >
                    Once Per Bar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepeat('once_per_bar_close')}
                    className={`py-1.5 px-2 rounded text-xs border text-center transition-colors cursor-pointer ${
                      repeat === 'once_per_bar_close'
                        ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-semibold'
                        : 'border-[#2B2F3A] bg-[#131722] text-[#787B86] hover:text-[#D1D4DC]'
                    }`}
                  >
                    Once Per Bar Close
                  </button>
                </div>
              </div>

              {/* Alert Expiration */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                  Alert Expiration
                </label>
                <select
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value)}
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-3 py-2 text-xs text-[#D1D4DC] focus:border-[#2962FF] focus:outline-none cursor-pointer"
                >
                  <option value="none">Open-Ended (No Expiration)</option>
                  <option value="1d">Expires in 24 Hours (1 Day)</option>
                  <option value="7d">Expires in 7 Days (1 Week)</option>
                  <option value="30d">Expires in 30 Days (1 Month)</option>
                </select>
              </div>

              {/* Notification Channels: Sound & Browser Push */}
              <div className="flex flex-col gap-2 pt-1 border-t border-[#2B2F3A]">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                    Notification Channels
                  </label>
                  <button
                    type="button"
                    onClick={() => setTab('push')}
                    className="text-[10px] text-[#2962FF] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>Configure 24/7 Push</span>
                  </button>
                </div>

                {/* 24/7 Background Push (Cloudflare Worker + FCM) */}
                <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#131722] border border-[#2962FF]/40 hover:border-[#2962FF] cursor-pointer transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-[#2962FF]/15 flex items-center justify-center text-[#2962FF] shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <span>Android 24/7 Background Push</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#089981]/20 text-[#089981] font-mono">
                          FREE
                        </span>
                      </div>
                      <div className="text-[10px] text-[#787B86]">
                        Delivers even when app is closed or phone is locked
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={pushNotification}
                    onChange={(e) => setPushNotification(e.target.checked)}
                    className="w-4 h-4 rounded text-[#2962FF] focus:ring-0 cursor-pointer accent-[#2962FF]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  {/* Browser Push */}
                  <label className="flex items-center gap-2 p-2 rounded bg-[#131722] border border-[#2B2F3A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={browserNotification}
                      onChange={(e) => setBrowserNotification(e.target.checked)}
                      className="rounded text-[#2962FF] focus:ring-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-[#2962FF]" />
                      <span>Browser In-App</span>
                    </div>
                  </label>

                  {/* Android Vibration */}
                  <label className="flex items-center gap-2 p-2 rounded bg-[#131722] border border-[#2B2F3A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={vibrate}
                      onChange={(e) => setVibrate(e.target.checked)}
                      className="rounded text-[#2962FF] focus:ring-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-1.5">
                      <Vibrate className="w-3.5 h-3.5 text-[#089981]" />
                      <span>Device Vibrate</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Custom Notification Sound Tone */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                    Audio Chime Tone
                  </label>
                  <button
                    type="button"
                    onClick={() => alertEngine.playSpecificSound(sound)}
                    className="flex items-center gap-1 text-[#2962FF] hover:underline cursor-pointer"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>Preview Chime</span>
                  </button>
                </div>
                <select
                  value={sound}
                  onChange={(e) => setSound(e.target.value as AlertSoundType)}
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-3 py-2 text-xs text-[#D1D4DC] focus:border-[#2962FF] focus:outline-none cursor-pointer"
                >
                  {soundOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({s.desc})
                    </option>
                  ))}
                </select>
              </div>

              {/* Note / Comment */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                  Trading Note (Optional)
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Take profit 1 / Stop Loss level"
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-3 py-2 text-xs text-[#D1D4DC] focus:border-[#2962FF] focus:outline-none"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="w-full mt-2 py-2 px-4 rounded-lg bg-[#2962FF] hover:bg-[#1e53e5] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md"
              >
                {editingAlertId ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                <span>{editingAlertId ? 'Save Changes' : 'Create Alert'}</span>
              </button>
            </form>
          )}

          {/* TAB 2: ALERTS LIST */}
          {tab === 'list' && (
            <div className="flex flex-col gap-2 text-xs">
              {alerts.length === 0 ? (
                <div className="p-8 text-center text-[#787B86]">
                  No alerts created yet. Click &quot;Create&quot; or tap the &quot;+&quot; button on the chart price scale to add an alert.
                </div>
              ) : (
                alerts.map((item) => {
                  const isExpanded = expandedAlertId === item.id;
                  const statusColors = {
                    active: 'text-[#089981] bg-[#089981]/15 border-[#089981]/40',
                    triggered: 'text-[#F23645] bg-[#F23645]/15 border-[#F23645]/40',
                    disabled: 'text-[#787B86] bg-[#2A2E39] border-[#2B2F3A]',
                  };

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border transition-colors flex flex-col gap-2 ${
                        item.status === 'triggered'
                          ? 'border-[#F23645]/40 bg-[#F23645]/5'
                          : item.status === 'disabled'
                          ? 'border-[#2B2F3A] bg-[#181B24] opacity-60'
                          : 'border-[#2B2F3A] bg-[#131722]'
                      }`}
                    >
                      {/* Main row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-[#D1D4DC]">{item.symbol}</span>
                          <span className="font-mono font-bold text-[#2962FF]">
                            {item.price.toLocaleString()}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold border ${
                              statusColors[item.status]
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Enable/Disable Toggle */}
                          <button
                            onClick={() => handleToggleStatus(item.id, item.status)}
                            className={`p-1.5 rounded transition-colors cursor-pointer ${
                              item.status === 'active'
                                ? 'text-[#089981] hover:bg-[#2A2E39]'
                                : 'text-[#787B86] hover:text-[#089981] hover:bg-[#2A2E39]'
                            }`}
                            title={item.status === 'active' ? 'Disable alert' : 'Enable alert'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>

                          {/* Re-arm button if triggered */}
                          {item.status === 'triggered' && (
                            <button
                              onClick={() => handleReset(item.id)}
                              className="p-1.5 rounded text-[#787B86] hover:text-[#089981] hover:bg-[#2A2E39] cursor-pointer"
                              title="Re-arm alert"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Edit button */}
                          <button
                            onClick={() => handleStartEdit(item)}
                            className="p-1.5 rounded text-[#787B86] hover:text-[#2962FF] hover:bg-[#2A2E39] cursor-pointer"
                            title="Edit alert"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          {/* Details Toggle */}
                          <button
                            onClick={() => setExpandedAlertId(isExpanded ? null : item.id)}
                            className="p-1.5 rounded text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] cursor-pointer"
                            title="View alert details"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-1.5 rounded text-[#787B86] hover:text-[#F23645] hover:bg-[#2A2E39] cursor-pointer"
                            title="Delete alert"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Name / note snippet */}
                      {item.name && item.name !== item.symbol && (
                        <div className="text-[11px] text-[#A0A4AE] font-medium truncate">
                          {item.name}
                        </div>
                      )}
                      {item.note && (
                        <div className="text-[10px] text-[#787B86] truncate">
                          Note: {item.note}
                        </div>
                      )}

                      {/* Expanded Details Section */}
                      {isExpanded && (
                        <div className="pt-2 border-t border-[#2B2F3A] grid grid-cols-2 gap-2 text-[10px] text-[#787B86]">
                          <div>Condition: <span className="text-[#D1D4DC] capitalize">{item.condition.replace(/_/g, ' ')}</span></div>
                          <div>Timeframe: <span className="text-[#D1D4DC] font-mono">{item.timeframe || 'Any'}</span></div>
                          <div>Frequency: <span className="text-[#D1D4DC] capitalize">{item.repeat.replace(/_/g, ' ')}</span></div>
                          <div>Sound: <span className="text-[#D1D4DC] capitalize">{item.sound.replace(/_/g, ' ')}</span></div>
                          <div>Created: <span className="text-[#D1D4DC]">{new Date(item.createdAt).toLocaleTimeString()}</span></div>
                          <div>Triggered: <span className="text-[#D1D4DC]">{item.triggeredAt ? new Date(item.triggeredAt).toLocaleTimeString() : 'Never'}</span></div>
                          <div>Browser Push: <span className="text-[#D1D4DC]">{item.browserNotification !== false ? 'Enabled' : 'Disabled'}</span></div>
                          <div>Vibration: <span className="text-[#D1D4DC]">{item.vibrate ? 'Enabled' : 'Disabled'}</span></div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {alerts.length > 0 && (
                <button
                  onClick={() => {
                    if (window.confirm('Clear all alerts across all symbols?')) {
                      alertEngine.clearAllAlerts();
                      setAlerts([]);
                      onAlertsChanged();
                    }
                  }}
                  className="mt-3 text-[11px] text-[#F23645] hover:underline self-center p-1 cursor-pointer"
                >
                  Clear all alerts
                </button>
              )}
            </div>
          )}

          {/* TAB: PUSH & CLOUD BACKGROUND ENGINE */}
          {tab === 'push' && (
            <div className="flex flex-col gap-4 text-xs">
              {/* Status Header Card */}
              <div className="p-3.5 rounded-lg bg-[#131722] border border-[#2B2F3A] flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#2962FF]/20 flex items-center justify-center text-[#2962FF]">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-white text-xs">Android Background Push</div>
                      <div className="text-[10px] text-[#787B86]">Cloudflare Workers + D1 + FCM HTTP v1</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#089981]/15 text-[#089981] border border-[#089981]/30">
                    100% FREE
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#2B2F3A] text-[11px]">
                  <div className="flex items-center justify-between bg-[#181B24] p-2 rounded">
                    <span className="text-[#787B86]">Permission:</span>
                    <span
                      className={`font-semibold capitalize ${
                        permissionStatus === 'granted'
                          ? 'text-[#089981]'
                          : permissionStatus === 'denied'
                          ? 'text-[#F23645]'
                          : 'text-[#F59E0B]'
                      }`}
                    >
                      {permissionStatus}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-[#181B24] p-2 rounded">
                    <span className="text-[#787B86]">FCM Token:</span>
                    <span
                      className={`font-semibold ${
                        fcmService.getCurrentToken() ? 'text-[#089981]' : 'text-[#787B86]'
                      }`}
                    >
                      {fcmService.getCurrentToken() ? 'Registered' : 'Not Connected'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-[#181B24] p-2 rounded">
                    <span className="text-[#787B86]">Cron Polling:</span>
                    <span className="text-[#D1D4DC] font-mono font-semibold">1 Minute</span>
                  </div>
                  <div className="flex items-center justify-between bg-[#181B24] p-2 rounded">
                    <span className="text-[#787B86]">Data Source:</span>
                    <span className="text-[#089981] font-semibold">Binance USDⓈ-M</span>
                  </div>
                </div>
              </div>

              {/* Status Message Alert */}
              {pushStatusMsg && (
                <div
                  className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                    pushStatusMsg.isError
                      ? 'bg-[#F23645]/10 border-[#F23645]/40 text-[#F23645]'
                      : 'bg-[#089981]/10 border-[#089981]/40 text-[#089981]'
                  }`}
                >
                  {pushStatusMsg.isError ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-tight">{pushStatusMsg.text}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleEnablePush}
                  disabled={isRegisteringPush}
                  className="w-full py-2.5 px-3 rounded-lg bg-[#2962FF] hover:bg-[#1e53e5] disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>
                    {isRegisteringPush
                      ? 'Registering Device Token...'
                      : permissionStatus === 'granted' && fcmService.getCurrentToken()
                      ? 'Re-Sync Android Device Token'
                      : 'Enable Background Push on this Phone'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSendTestPush}
                  disabled={isSendingTest}
                  className="w-full py-2 px-3 rounded-lg bg-[#181B24] hover:bg-[#2A2E39] border border-[#2B2F3A] text-[#D1D4DC] hover:text-white font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {isSendingTest ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#2962FF]" />
                  ) : (
                    <Send className="w-3.5 h-3.5 text-[#089981]" />
                  )}
                  <span>Send Instant Test Notification to Phone</span>
                </button>
              </div>

              {/* Backend URL Configuration */}
              <div className="p-3 rounded-lg bg-[#131722] border border-[#2B2F3A] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Server className="w-3.5 h-3.5 text-[#2962FF]" />
                    <span>Cloudflare Worker Backend URL</span>
                  </div>
                  <span className="text-[10px] text-[#787B86] font-mono">
                    ID: {backendAlertApi.getUserId().slice(0, 8)}...
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={backendUrlInput}
                    onChange={(e) => setBackendUrlInput(e.target.value)}
                    placeholder="https://binance-futures-tv-alerts.<worker-subdomain>.workers.dev"
                    className="flex-1 bg-[#181B24] border border-[#2B2F3A] rounded px-2.5 py-1.5 text-xs text-[#D1D4DC] font-mono focus:border-[#2962FF] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveBackendUrl}
                    className="px-3 py-1.5 rounded bg-[#2A2E39] hover:bg-[#3A3F4D] text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Save
                  </button>
                </div>
                <div className="text-[10px] text-[#787B86]">
                  Points to your deployed Cloudflare Worker that runs 1-minute crons on Binance USDⓈ-M Futures.
                </div>
              </div>

              {/* Notification Trigger Logs */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86] flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-[#2962FF]" />
                    <span>Recent Trigger Logs</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleLoadHistory}
                    disabled={isLoadingLogs}
                    className="text-[10px] text-[#2962FF] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                <div className="p-2.5 rounded-lg bg-[#131722] border border-[#2B2F3A] flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                  {isLoadingLogs ? (
                    <div className="py-4 text-center text-[#787B86] text-xs">Loading logs...</div>
                  ) : historyLogs.length === 0 ? (
                    <div className="py-4 text-center text-[#787B86] text-xs">
                      No triggers recorded yet. Triggered price alerts will appear here.
                    </div>
                  ) : (
                    historyLogs.map((log, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between py-1 border-b border-[#2B2F3A]/60 last:border-0 text-[11px]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{log.symbol}</span>
                          <span className="text-[#089981] font-mono">${Number(log.price_at_trigger).toFixed(2)}</span>
                          <span className="text-[10px] text-[#787B86] capitalize">{log.condition?.replace(/_/g, ' ')}</span>
                        </div>
                        <span className="text-[10px] text-[#787B86] font-mono">
                          {new Date(log.created_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Android Background Checklist */}
              <div className="p-3 rounded-lg bg-[#181B24] border border-[#2B2F3A] flex flex-col gap-1.5 text-[11px] text-[#787B86]">
                <div className="font-semibold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#089981]" />
                  <span>Android Background Reliability Checklist:</span>
                </div>
                <ul className="list-disc list-inside space-y-1">
                  <li><b className="text-[#D1D4DC]">Battery Optimization:</b> In Android Settings &gt; Apps &gt; Chrome (or PWA) &gt; Battery, set to &quot;Unrestricted&quot;.</li>
                  <li><b className="text-[#D1D4DC]">Notifications:</b> Chrome &gt; Site Settings &gt; Notifications &gt; Allowed.</li>
                  <li><b className="text-[#D1D4DC]">PWA Install:</b> Tap browser menu &gt; &quot;Add to Home screen&quot; or &quot;Install app&quot; for instant lock-screen alerts.</li>
                  <li><b className="text-[#D1D4DC]">Cron Interval:</b> Evaluated every 60 seconds on Cloudflare global edge.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM SOUNDS & VIBRATION SETTINGS */}
          {tab === 'settings' && (
            <div className="flex flex-col gap-4 text-xs">
              {/* Global Sound Switch */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#131722] border border-[#2B2F3A]">
                <div className="flex items-center gap-2.5">
                  {settings.soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-[#089981]" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-[#787B86]" />
                  )}
                  <div>
                    <div className="font-semibold text-[#D1D4DC]">Alert Sound Chimes</div>
                    <div className="text-[10px] text-[#787B86]">Play audible alerts when triggers occur</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={handleToggleGlobalSound}
                  className="rounded text-[#2962FF] focus:ring-0 cursor-pointer w-4 h-4"
                />
              </div>

              {/* Volume Slider */}
              <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-[#131722] border border-[#2B2F3A]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#D1D4DC]">Alert Volume</span>
                  <span className="font-mono text-[11px] text-[#2962FF]">
                    {Math.round(settings.volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={settings.volume}
                  onChange={(e) => handleUpdateVolume(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-[#2A2E39] rounded appearance-none cursor-pointer accent-[#2962FF]"
                />
              </div>

              {/* Global Vibration Switch */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#131722] border border-[#2B2F3A]">
                <div className="flex items-center gap-2.5">
                  <Vibrate className={`w-4 h-4 ${settings.vibrationEnabled ? 'text-[#089981]' : 'text-[#787B86]'}`} />
                  <div>
                    <div className="font-semibold text-[#D1D4DC]">Android Device Vibration</div>
                    <div className="text-[10px] text-[#787B86]">Haptic pulse when price alert triggers</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.vibrationEnabled}
                  onChange={handleToggleGlobalVibration}
                  className="rounded text-[#2962FF] focus:ring-0 cursor-pointer w-4 h-4"
                />
              </div>

              {/* Sound Previews List */}
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                  Sound Tone Library &amp; Previews
                </label>
                <div className="divide-y divide-[#2B2F3A] bg-[#131722] rounded-lg border border-[#2B2F3A]">
                  {soundOptions.map((s) => (
                    <div key={s.id} className="p-2.5 flex items-center justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-[#D1D4DC]">{s.label}</span>
                        <span className="text-[10px] text-[#787B86]">{s.desc}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => alertEngine.playSpecificSound(s.id)}
                        className="px-2.5 py-1 rounded bg-[#2962FF]/15 hover:bg-[#2962FF]/25 text-[#2962FF] text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
