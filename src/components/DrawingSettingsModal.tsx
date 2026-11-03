import React from 'react';
import { X, Sliders, Check } from 'lucide-react';
import { DrawingSettings } from '../types';

interface DrawingSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: DrawingSettings;
  onUpdateSettings: (newSettings: DrawingSettings) => void;
}

export const DrawingSettingsModal: React.FC<DrawingSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  const colorPalette = [
    '#2962FF', // Blue
    '#089981', // Green
    '#F23645', // Red
    '#F59E0B', // Amber
    '#A855F7', // Purple
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#FFFFFF', // White
  ];

  const widths = [1, 2, 3, 4];
  const styles: ('solid' | 'dashed' | 'dotted')[] = ['solid', 'dashed', 'dotted'];
  const opacities = [0.1, 0.2, 0.35, 0.5, 0.8];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="bg-[#1E222D] border border-[#2B2F3A] rounded-xl shadow-2xl w-full max-w-sm overflow-hidden text-[#D1D4DC]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2B2F3A] bg-[#181B24]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#2962FF]" />
            <span className="text-sm font-semibold">Drawing Tool Defaults</span>
          </div>
          <button
            onClick={onClose}
            className="text-[#787B86] hover:text-[#D1D4DC] p-1 rounded hover:bg-[#2A2E39]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 flex flex-col gap-4 text-xs">
          {/* Line Color */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
              Line & Outline Color
            </label>
            <div className="flex items-center gap-2">
              {colorPalette.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, color: col })}
                  style={{ backgroundColor: col }}
                  className={`w-6 h-6 rounded-full border-2 transition-transform flex items-center justify-center ${
                    settings.color === col
                      ? 'border-white scale-110 shadow-md'
                      : 'border-transparent hover:scale-105'
                  }`}
                >
                  {settings.color === col && (
                    <Check
                      className={`w-3.5 h-3.5 ${
                        col === '#FFFFFF' ? 'text-black' : 'text-white'
                      }`}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Line Width */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
              Line Thickness
            </label>
            <div className="grid grid-cols-4 gap-2">
              {widths.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, lineWidth: w })}
                  className={`py-1.5 rounded border text-center transition-colors flex items-center justify-center gap-1.5 ${
                    settings.lineWidth === w
                      ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-bold'
                      : 'border-[#2B2F3A] bg-[#131722] text-[#787B86] hover:text-[#D1D4DC]'
                  }`}
                >
                  <div
                    style={{ height: `${w}px` }}
                    className="w-4 bg-current rounded-full"
                  />
                  <span>{w}px</span>
                </button>
              ))}
            </div>
          </div>

          {/* Line Style */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
              Line Pattern
            </label>
            <div className="grid grid-cols-3 gap-2">
              {styles.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, lineStyle: s })}
                  className={`py-1.5 rounded border capitalize text-center transition-colors ${
                    settings.lineStyle === s
                      ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-bold'
                      : 'border-[#2B2F3A] bg-[#131722] text-[#787B86] hover:text-[#D1D4DC]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Infinite Extensions (Lines and Rectangles) */}
          <div className="flex flex-col gap-2 pt-1 border-t border-[#2B2F3A]">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
                Default Infinite Extensions
              </label>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
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
                  })
                }
                className="text-[10px] text-[#2962FF] hover:underline cursor-pointer"
              >
                Reset Defaults
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label
                onClick={() =>
                  onUpdateSettings({ ...settings, extendLeft: !settings.extendLeft })
                }
                className={`flex items-center gap-2 p-2 rounded border cursor-pointer select-none transition-colors ${
                  settings.extendLeft
                    ? 'border-[#2962FF] bg-[#2962FF]/15 text-white'
                    : 'border-[#2B2F3A] bg-[#131722] text-[#787B86]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!settings.extendLeft}
                  readOnly
                  className="rounded text-[#2962FF] focus:ring-0"
                />
                <span className="text-xs">Extend Left (←)</span>
              </label>

              <label
                onClick={() =>
                  onUpdateSettings({ ...settings, extendRight: !settings.extendRight })
                }
                className={`flex items-center gap-2 p-2 rounded border cursor-pointer select-none transition-colors ${
                  settings.extendRight
                    ? 'border-[#2962FF] bg-[#2962FF]/15 text-white'
                    : 'border-[#2B2F3A] bg-[#131722] text-[#787B86]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!settings.extendRight}
                  readOnly
                  className="rounded text-[#2962FF] focus:ring-0"
                />
                <span className="text-xs">Extend Right (→)</span>
              </label>

              <label
                onClick={() =>
                  onUpdateSettings({ ...settings, extendUp: !settings.extendUp })
                }
                className={`flex items-center gap-2 p-2 rounded border cursor-pointer select-none transition-colors ${
                  settings.extendUp
                    ? 'border-[#2962FF] bg-[#2962FF]/15 text-white'
                    : 'border-[#2B2F3A] bg-[#131722] text-[#787B86]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!settings.extendUp}
                  readOnly
                  className="rounded text-[#2962FF] focus:ring-0"
                />
                <span className="text-xs">Extend Up (↑)</span>
              </label>

              <label
                onClick={() =>
                  onUpdateSettings({ ...settings, extendDown: !settings.extendDown })
                }
                className={`flex items-center gap-2 p-2 rounded border cursor-pointer select-none transition-colors ${
                  settings.extendDown
                    ? 'border-[#2962FF] bg-[#2962FF]/15 text-white'
                    : 'border-[#2B2F3A] bg-[#131722] text-[#787B86]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!settings.extendDown}
                  readOnly
                  className="rounded text-[#2962FF] focus:ring-0"
                />
                <span className="text-xs">Extend Down (↓)</span>
              </label>
            </div>
            <span className="text-[10px] text-[#787B86]">
              When enabled, rectangles can span infinitely horizontally (Left/Right) and vertically (Up/Down) across the chart.
            </span>
          </div>

          {/* Rectangle Fill Opacity */}
          <div className="flex flex-col gap-1.5 pt-1 border-t border-[#2B2F3A]">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
              Rectangle Fill Opacity
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {opacities.map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, fillOpacity: op })}
                  className={`py-1 rounded border text-center font-mono ${
                    settings.fillOpacity === op
                      ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-bold'
                      : 'border-[#2B2F3A] bg-[#131722] text-[#787B86] hover:text-[#D1D4DC]'
                  }`}
                >
                  {Math.round(op * 100)}%
                </button>
              ))}
            </div>
          </div>

          {/* Text Font Size */}
          <div className="flex flex-col gap-1.5 pt-1 border-t border-[#2B2F3A]">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787B86]">
              Text Note Size
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[12, 14, 16, 20].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, fontSize: sz })}
                  className={`py-1.5 rounded border text-center font-mono ${
                    (settings.fontSize || 14) === sz
                      ? 'border-[#2962FF] bg-[#2962FF]/20 text-white font-bold'
                      : 'border-[#2B2F3A] bg-[#131722] text-[#787B86] hover:text-[#D1D4DC]'
                  }`}
                >
                  {sz}px
                </button>
              ))}
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="w-full mt-2 py-2 rounded bg-[#2962FF] hover:bg-[#1e53e5] text-white text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
