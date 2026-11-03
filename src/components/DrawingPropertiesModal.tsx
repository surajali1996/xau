import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, RotateCcw, Bold, Italic } from 'lucide-react';
import { DrawingItem, DrawingPoint, FibLevel, LineStyleType, DrawingSettings } from '../types';
import {
  DRAWING_COLORS,
  EXTENDABLE_TOOLS,
  FILLABLE_TOOLS,
  getDefaultLevels,
  getToolIcon,
  getToolLabel,
} from './drawingTools';

interface DrawingPropertiesModalProps {
  drawing: DrawingItem | null;
  onClose: () => void;
  onApply: (drawing: DrawingItem) => void;
  onSaveAsDefault?: (drawing: DrawingItem) => void;
  defaultSettings?: DrawingSettings;
}

type Tab = 'style' | 'text' | 'levels' | 'position' | 'coords';

const toLocalInput = (sec: number) => {
  const d = new Date(sec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const ColorSwatchPicker: React.FC<{
  value: string;
  onChange: (c: string) => void;
  opacity?: number;
  onOpacityChange?: (o: number) => void;
}> = ({ value, onChange, opacity, onOpacityChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded border border-[#2B2F3A] bg-[#131722] p-1 cursor-pointer hover:border-[#2962FF]"
      >
        <span className="block w-full h-full rounded-sm" style={{ backgroundColor: value, opacity: opacity ?? 1 }} />
      </button>
      {open && (
        <div className="absolute z-50 top-9 left-0 w-56 p-2.5 bg-[#1E222D] border border-[#2B2F3A] rounded-lg shadow-2xl">
          <div className="grid grid-cols-5 gap-1.5">
            {DRAWING_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange(c)}
                style={{ backgroundColor: c }}
                className={`w-8 h-6 rounded-sm border cursor-pointer ${
                  value.toLowerCase() === c.toLowerCase() ? 'border-white ring-1 ring-[#2962FF]' : 'border-[#2B2F3A]'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2.5">
            <input
              type="color"
              value={value.length === 7 ? value : '#2962FF'}
              onChange={(e) => onChange(e.target.value)}
              className="w-8 h-7 bg-transparent border border-[#2B2F3A] rounded cursor-pointer"
              title="Custom color"
            />
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 bg-[#131722] border border-[#2B2F3A] rounded px-2 py-1 font-mono text-[11px] uppercase"
            />
          </div>
          {onOpacityChange && (
            <div className="mt-2.5">
              <div className="flex justify-between text-[10px] text-[#787B86] mb-1">
                <span>Opacity</span>
                <span className="font-mono">{Math.round((opacity ?? 1) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((opacity ?? 1) * 100)}
                onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
                className="w-full accent-[#2962FF]"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 w-full py-1 rounded bg-[#2A2E39] text-[11px] hover:bg-[#363A45] cursor-pointer"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 min-h-9">
    <span className="text-[#B2B5BE] text-xs">{label}</span>
    <div className="flex items-center gap-2">{children}</div>
  </div>
);

const Check: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[#D1D4DC] min-h-8">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 accent-[#2962FF] cursor-pointer"
    />
    {label}
  </label>
);

export const DrawingPropertiesModal: React.FC<DrawingPropertiesModalProps> = ({
  drawing,
  onClose,
  onApply,
  onSaveAsDefault,
  defaultSettings,
}) => {
  const [draft, setDraft] = useState<DrawingItem | null>(drawing);
  const [tab, setTab] = useState<Tab>('style');

  useEffect(() => {
    setDraft(drawing);
    setTab('style');
  }, [drawing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!drawing || !draft) return null;

  const set = (patch: Partial<DrawingItem>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const tool = draft.tool;
  const isFib = ['fibonacci', 'fibonacci_extension', 'fibonacci_channel', 'fibonacci_timezones'].includes(tool);
  const isPosition = tool === 'long_position' || tool === 'short_position';
  const hasTextTab = tool !== 'brush' && tool !== 'highlighter';
  const levels: FibLevel[] = draft.levels || getDefaultLevels(tool) || [];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'style', label: 'Style' },
    ...(isFib ? [{ id: 'levels' as Tab, label: 'Levels' }] : []),
    ...(isPosition ? [{ id: 'position' as Tab, label: 'Inputs' }] : []),
    ...(hasTextTab ? [{ id: 'text' as Tab, label: 'Text' }] : []),
    { id: 'coords', label: 'Coordinates' },
  ];

  const updatePoint = (idx: number, patch: Partial<DrawingPoint>) => {
    const pts = draft.points.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    set({ points: pts });
  };

  const updateLevel = (idx: number, patch: Partial<FibLevel>) => {
    const next = levels.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    set({ levels: next });
  };

  const pointLabel = (i: number) => {
    if (isPosition) return ['Entry', 'Target', 'Stop'][i] || `Point ${i + 1}`;
    if (tool === 'callout') return ['Anchor', 'Label'][i];
    return `Point ${i + 1}`;
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 select-none"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#1E222D] border border-[#2B2F3A] rounded-xl shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col text-[#D1D4DC]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2B2F3A]">
          <div className="flex items-center gap-2">
            <span className="text-[#2962FF]">{getToolIcon(tool)}</span>
            <span className="text-sm font-semibold">{getToolLabel(tool)}</span>
          </div>
          <button onClick={onClose} className="text-[#787B86] hover:text-[#D1D4DC] p-1 rounded hover:bg-[#2A2E39] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2B2F3A] px-2 overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap cursor-pointer ${
                tab === t.id ? 'border-[#2962FF] text-white' : 'border-transparent text-[#787B86] hover:text-[#D1D4DC]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1">
          {tab === 'style' && (
            <>
              <Row label="Line">
                <ColorSwatchPicker value={draft.color} onChange={(c) => set({ color: c })} />
                <select
                  value={draft.lineWidth}
                  onChange={(e) => set({ lineWidth: Number(e.target.value) })}
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-2 h-8 text-xs cursor-pointer"
                >
                  {[1, 2, 3, 4, 5, 6, 8].map((w) => (
                    <option key={w} value={w}>
                      {w}px
                    </option>
                  ))}
                </select>
                <select
                  value={draft.lineStyle || 'solid'}
                  onChange={(e) => set({ lineStyle: e.target.value as LineStyleType })}
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-2 h-8 text-xs cursor-pointer"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </Row>

              {FILLABLE_TOOLS.includes(tool) && (
                <Row label="Background">
                  <input
                    type="checkbox"
                    checked={draft.showBackground !== false}
                    onChange={(e) => set({ showBackground: e.target.checked })}
                    className="w-4 h-4 accent-[#2962FF] cursor-pointer"
                  />
                  <ColorSwatchPicker
                    value={draft.fillColor || draft.color}
                    onChange={(c) => set({ fillColor: c })}
                    opacity={draft.fillOpacity ?? 0.15}
                    onOpacityChange={(o) => set({ fillOpacity: o })}
                  />
                </Row>
              )}

              {EXTENDABLE_TOOLS.includes(tool) && tool !== 'extended_line' && (
                <div className="flex flex-col gap-1 py-1">
                  <div className="flex gap-4">
                    <Check checked={!!draft.extendLeft} onChange={(v) => set({ extendLeft: v })} label="Extend left (←)" />
                    <Check checked={!!draft.extendRight} onChange={(v) => set({ extendRight: v })} label="Extend right (→)" />
                  </div>
                  {tool === 'rectangle' && (
                    <div className="flex gap-4">
                      <Check checked={!!draft.extendUp} onChange={(v) => set({ extendUp: v })} label="Extend up (↑)" />
                      <Check checked={!!draft.extendDown} onChange={(v) => set({ extendDown: v })} label="Extend down (↓)" />
                    </div>
                  )}
                </div>
              )}

              {tool === 'parallel_channel' && (
                <Check checked={draft.middleLine !== false} onChange={(v) => set({ middleLine: v })} label="Middle line" />
              )}

              {(tool === 'info_line' ||
                tool === 'trend_angle' ||
                tool === 'price_range' ||
                tool === 'price_percentage_measure' ||
                tool === 'date_range' ||
                tool === 'date_and_price_range' ||
                isPosition) && (
                <Check checked={draft.showStats !== false} onChange={(v) => set({ showStats: v })} label="Show stats" />
              )}

              {(isFib || tool === 'horizontal_line' || tool === 'horizontal_ray') && (
                <Check checked={draft.showLabels !== false} onChange={(v) => set({ showLabels: v })} label="Show price labels" />
              )}

              <div className="border-t border-[#2B2F3A] mt-2 pt-2 flex flex-col">
                <Check checked={!!draft.locked} onChange={(v) => set({ locked: v })} label="Lock (prevent moving)" />
                <Check checked={!!draft.hidden} onChange={(v) => set({ hidden: v })} label="Hide drawing" />
              </div>
            </>
          )}

          {tab === 'levels' && isFib && (
            <>
              <div className="flex items-center gap-4 mb-1">
                <Check checked={draft.showBackground !== false} onChange={(v) => set({ showBackground: v })} label="Background" />
                {tool !== 'fibonacci_timezones' && (
                  <Check checked={!!draft.reverse} onChange={(v) => set({ reverse: v })} label="Reverse" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {levels.map((lvl, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={lvl.enabled}
                      onChange={(e) => updateLevel(i, { enabled: e.target.checked })}
                      className="w-4 h-4 accent-[#2962FF] cursor-pointer shrink-0"
                    />
                    <input
                      type="number"
                      step="0.001"
                      value={lvl.ratio}
                      onChange={(e) => updateLevel(i, { ratio: Number(e.target.value) })}
                      className="w-full min-w-0 bg-[#131722] border border-[#2B2F3A] rounded px-1.5 h-8 font-mono text-xs"
                    />
                    <ColorSwatchPicker value={lvl.color} onChange={(c) => updateLevel(i, { color: c })} />
                    <button
                      onClick={() => set({ levels: levels.filter((_, j) => j !== i) })}
                      className="p-1 text-[#787B86] hover:text-[#F23645] cursor-pointer shrink-0"
                      title="Remove level"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => set({ levels: [...levels, { ratio: 1.272, color: '#FF9800', enabled: true }] })}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-[#2B2F3A] text-xs hover:border-[#2962FF] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add level
                </button>
                <button
                  onClick={() => set({ levels: undefined })}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-[#2B2F3A] text-xs hover:border-[#2962FF] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </button>
              </div>
            </>
          )}

          {tab === 'position' && isPosition && (
            <>
              <Row label="Account size (USDT)">
                <input
                  type="number"
                  value={draft.accountSize ?? 1000}
                  onChange={(e) => set({ accountSize: Number(e.target.value) })}
                  className="w-32 bg-[#131722] border border-[#2B2F3A] rounded px-2 h-8 font-mono text-xs"
                />
              </Row>
              <Row label="Risk (%)">
                <input
                  type="number"
                  step="0.1"
                  value={draft.riskPercent ?? 1}
                  onChange={(e) => set({ riskPercent: Number(e.target.value) })}
                  className="w-32 bg-[#131722] border border-[#2B2F3A] rounded px-2 h-8 font-mono text-xs"
                />
              </Row>
              {draft.points.length >= 3 &&
                (['Entry price', 'Target price', 'Stop price'] as const).map((lbl, i) => (
                  <Row key={lbl} label={lbl}>
                    <input
                      type="number"
                      step="any"
                      value={draft.points[i].price}
                      onChange={(e) => updatePoint(i, { price: Number(e.target.value) })}
                      className="w-32 bg-[#131722] border border-[#2B2F3A] rounded px-2 h-8 font-mono text-xs"
                    />
                  </Row>
                ))}
              {draft.points.length >= 3 && (() => {
                const entry = draft.points[0].price;
                const risk = Math.abs(entry - draft.points[2].price);
                const reward = Math.abs(draft.points[1].price - entry);
                const riskAmt = ((draft.accountSize ?? 1000) * (draft.riskPercent ?? 1)) / 100;
                const qty = risk > 0 ? riskAmt / risk : 0;
                return (
                  <div className="mt-2 p-2.5 rounded bg-[#131722] border border-[#2B2F3A] font-mono text-[11px] grid grid-cols-2 gap-1">
                    <span className="text-[#787B86]">Risk/Reward</span>
                    <span className="text-right">{risk > 0 ? (reward / risk).toFixed(2) : '—'}</span>
                    <span className="text-[#787B86]">Qty</span>
                    <span className="text-right">{qty.toFixed(4)}</span>
                    <span className="text-[#787B86]">Risk amount</span>
                    <span className="text-right text-[#F23645]">{riskAmt.toFixed(2)}</span>
                    <span className="text-[#787B86]">Reward amount</span>
                    <span className="text-right text-[#089981]">{(qty * reward).toFixed(2)}</span>
                  </div>
                );
              })()}
            </>
          )}

          {tab === 'text' && hasTextTab && (
            <>
              <textarea
                value={draft.text || ''}
                onChange={(e) => set({ text: e.target.value })}
                placeholder="Add text"
                rows={3}
                className="w-full bg-[#131722] border border-[#2B2F3A] rounded p-2 text-xs resize-none focus:border-[#2962FF] outline-none"
              />
              <Row label="Text style">
                <ColorSwatchPicker value={draft.textColor || draft.color} onChange={(c) => set({ textColor: c })} />
                <select
                  value={draft.fontSize || 14}
                  onChange={(e) => set({ fontSize: Number(e.target.value) })}
                  className="bg-[#131722] border border-[#2B2F3A] rounded px-2 h-8 text-xs cursor-pointer"
                >
                  {[10, 11, 12, 14, 16, 20, 24, 28, 32, 40].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => set({ bold: !draft.bold })}
                  className={`w-8 h-8 rounded border flex items-center justify-center cursor-pointer ${
                    draft.bold ? 'border-[#2962FF] bg-[#2962FF]/20 text-white' : 'border-[#2B2F3A] text-[#787B86]'
                  }`}
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => set({ italic: !draft.italic })}
                  className={`w-8 h-8 rounded border flex items-center justify-center cursor-pointer ${
                    draft.italic ? 'border-[#2962FF] bg-[#2962FF]/20 text-white' : 'border-[#2B2F3A] text-[#787B86]'
                  }`}
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
              </Row>
            </>
          )}

          {tab === 'coords' && (
            <div className="flex flex-col gap-2">
              {draft.points.map((p, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className="text-[11px] text-[#787B86] font-semibold">{pointLabel(i)}</span>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      value={p.price}
                      onChange={(e) => updatePoint(i, { price: Number(e.target.value) })}
                      className="flex-1 min-w-0 bg-[#131722] border border-[#2B2F3A] rounded px-2 h-8 font-mono text-xs"
                      title="Price"
                    />
                    <input
                      type="datetime-local"
                      value={toLocalInput(p.time)}
                      onChange={(e) => {
                        const t = new Date(e.target.value).getTime();
                        if (!isNaN(t)) updatePoint(i, { time: Math.floor(t / 1000) });
                      }}
                      className="flex-1 min-w-0 bg-[#131722] border border-[#2B2F3A] rounded px-2 h-8 font-mono text-xs"
                      title="Time"
                    />
                  </div>
                </div>
              ))}
              {draft.points.length === 0 && <span className="text-xs text-[#787B86]">No editable anchors.</span>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[#2B2F3A]">
          <div className="flex items-center gap-1.5">
            {defaultSettings && (
              <button
                type="button"
                onClick={() => {
                  set({
                    color: defaultSettings.color,
                    lineWidth: defaultSettings.lineWidth,
                    lineStyle: defaultSettings.lineStyle,
                    fillColor: defaultSettings.fillColor || defaultSettings.color,
                    fillOpacity: defaultSettings.fillOpacity,
                    fontSize: defaultSettings.fontSize,
                    extendLeft: defaultSettings.extendLeft,
                    extendRight: defaultSettings.extendRight,
                    extendUp: defaultSettings.extendUp,
                    extendDown: defaultSettings.extendDown,
                  });
                }}
                className="px-2.5 py-1.5 rounded border border-[#2B2F3A] text-[11px] text-[#B2B5BE] hover:border-[#2962FF] hover:text-white cursor-pointer"
                title="Reset this drawing to default drawing settings"
              >
                Use default
              </button>
            )}
            <button
              onClick={() => onSaveAsDefault?.(draft)}
              className="px-2.5 py-1.5 rounded border border-[#2B2F3A] text-[11px] text-[#B2B5BE] hover:border-[#2962FF] hover:text-white cursor-pointer"
              title="Use this style for new drawings"
            >
              Save as default
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-[#2B2F3A] text-xs hover:bg-[#2A2E39] cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onApply(draft);
                onClose();
              }}
              className="px-4 py-1.5 rounded bg-[#2962FF] hover:bg-[#1e53e5] text-white text-xs font-semibold cursor-pointer"
            >
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
