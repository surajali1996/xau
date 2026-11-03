import React, { useState } from 'react';
import { X, Clock, Plus } from 'lucide-react';

interface CustomTimeframeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (interval: string) => void;
  currentInterval: string;
}

export const CustomTimeframeModal: React.FC<CustomTimeframeModalProps> = ({
  isOpen,
  onClose,
  onApply,
  currentInterval,
}) => {
  const [val, setVal] = useState<string>('7');
  const [unit, setUnit] = useState<'m' | 'h' | 'd'>('m');
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const quickPresets = [
    { label: '2m', val: '2', unit: 'm' as const },
    { label: '7m', val: '7', unit: 'm' as const },
    { label: '10m', val: '10', unit: 'm' as const },
    { label: '13m', val: '13', unit: 'm' as const },
    { label: '45m', val: '45', unit: 'm' as const },
    { label: '2h', val: '2', unit: 'h' as const },
    { label: '3h', val: '3', unit: 'h' as const },
    { label: '8h', val: '8', unit: 'h' as const },
    { label: '2D', val: '2', unit: 'd' as const },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) {
      setError('Please enter a valid positive number');
      return;
    }
    if (unit === 'm' && num > 1440) {
      setError('Minutes must be between 1 and 1440');
      return;
    }
    if (unit === 'h' && num > 72) {
      setError('Hours must be between 1 and 72');
      return;
    }

    const intervalStr = `${num}${unit}`;
    onApply(intervalStr);
    onClose();
  };

  const handlePresetClick = (presetVal: string, presetUnit: 'm' | 'h' | 'd') => {
    onApply(`${presetVal}${presetUnit}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="bg-[#1E222D] border border-[#2B2F3A] rounded-xl shadow-2xl w-full max-w-sm overflow-hidden text-[#D1D4DC]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2B2F3A] bg-[#181B24]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#2962FF]" />
            <span className="text-sm font-semibold">Custom Timeframe</span>
          </div>
          <button
            onClick={onClose}
            className="text-[#787B86] hover:text-[#D1D4DC] p-1 rounded hover:bg-[#2A2E39]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
          <p className="text-xs text-[#787B86] leading-relaxed">
            Create any custom candle timeframe. Historical 1-minute candles from Binance
            will be dynamically aggregated client-side.
          </p>

          {/* Quick presets */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86] block mb-2">
              Popular Custom Intervals
            </label>
            <div className="grid grid-cols-3 gap-2">
              {quickPresets.map((preset) => {
                const intervalKey = `${preset.val}${preset.unit}`;
                const isActive = currentInterval === intervalKey;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePresetClick(preset.val, preset.unit)}
                    className={`py-1.5 px-2 text-xs font-mono font-medium rounded border transition-colors ${
                      isActive
                        ? 'border-[#2962FF] bg-[#2962FF]/20 text-white'
                        : 'border-[#2B2F3A] bg-[#131722] hover:bg-[#2A2E39] text-[#D1D4DC]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
              Enter Custom Value
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={val}
                onChange={(e) => {
                  setVal(e.target.value);
                  setError('');
                }}
                className="flex-1 bg-[#131722] border border-[#2B2F3A] rounded px-3 py-2 text-sm font-mono text-[#D1D4DC] focus:border-[#2962FF] focus:outline-none"
                placeholder="e.g. 7"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'm' | 'h' | 'd')}
                className="bg-[#131722] border border-[#2B2F3A] rounded px-3 py-2 text-sm text-[#D1D4DC] focus:border-[#2962FF] focus:outline-none cursor-pointer"
              >
                <option value="m">Minutes (m)</option>
                <option value="h">Hours (h)</option>
                <option value="d">Days (D)</option>
              </select>
            </div>
            {error && <span className="text-[11px] text-[#F23645]">{error}</span>}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            className="w-full mt-2 py-2 px-4 rounded bg-[#2962FF] hover:bg-[#1e53e5] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Apply Timeframe ({val}{unit})</span>
          </button>
        </form>
      </div>
    </div>
  );
};
