import React from 'react';
import {
  Minus,
  Square,
  Percent,
  Sliders,
  Trash2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Magnet,
  Undo2,
  Redo2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { DrawingTool } from '../types';

interface DrawingToolbarProps {
  activeTool: DrawingTool | null;
  onSelectTool: (tool: DrawingTool | null) => void;
  drawingsCount: number;
  onClearDrawings: () => void;
  onOpenSettings: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  favoriteTools?: DrawingTool[];
  onToggleFavorite?: (tool: DrawingTool) => void;
  magnetMode: boolean;
  onToggleMagnetMode: () => void;
  isAllLocked: boolean;
  onToggleLockAll: () => void;
  isAllHidden: boolean;
  onToggleHideAll: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  activeTool,
  onSelectTool,
  drawingsCount,
  onClearDrawings,
  onOpenSettings,
  isCollapsed,
  onToggleCollapse,
  magnetMode,
  onToggleMagnetMode,
  isAllLocked,
  onToggleLockAll,
  isAllHidden,
  onToggleHideAll,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => {
  // Collapsed state: Render minimalist expand button
  if (isCollapsed) {
    return (
      <div className="absolute left-1 top-12 z-30">
        <button
          onClick={onToggleCollapse}
          className="w-7 h-8 bg-[#1E222D]/95 border border-[#2B2F3A] rounded-r-md flex items-center justify-center text-[#787B86] hover:text-[#2962FF] hover:bg-[#2A2E39] shadow-lg transition-colors cursor-pointer"
          title="Expand Drawing Toolbar"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // EXACTLY 3 FUNCTIONAL DRAWING TOOLS (NO CURSOR MODE)
  const primaryTools = [
    {
      id: 'horizontal_line' as DrawingTool,
      label: 'Horizontal Line',
      icon: <Minus className="w-4 h-4 stroke-[2.5]" />,
      shortDesc: 'Tap chart to place',
    },
    {
      id: 'rectangle' as DrawingTool,
      label: 'Rectangle',
      icon: <Square className="w-4 h-4 stroke-[2]" />,
      shortDesc: 'Touch & drag area',
    },
    {
      id: 'price_range' as DrawingTool,
      label: 'Price Range Calculator (%)',
      icon: <Percent className="w-4 h-4 text-[#089981] stroke-[2.5]" />,
      shortDesc: 'Price & % Measurement',
    },
  ];

  return (
    <aside
      className="w-11 md:w-12 bg-[#131722] border-r border-[#2B2F3A] flex flex-col items-center py-2 gap-1 shrink-0 select-none z-30 transition-all duration-200"
      aria-label="Drawing Tools"
    >
      {/* Collapse button */}
      <button
        onClick={onToggleCollapse}
        className="w-8 h-6 rounded flex items-center justify-center text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D] transition-colors mb-0.5 cursor-pointer"
        title="Collapse Drawing Toolbar"
      >
        <PanelLeftClose className="w-3.5 h-3.5" />
      </button>

      {/* 3 CORE TOOLS (Tap to arm, tap again to disarm/pan) */}
      <div className="flex flex-col gap-1.5 w-full items-center">
        {primaryTools.map((tool) => {
          const isActive =
            activeTool === tool.id ||
            (tool.id === 'price_range' && activeTool === 'price_percentage_measure');

          return (
            <button
              key={tool.id}
              onClick={() => {
                if (isActive) {
                  onSelectTool(null); // Toggle off to pan/zoom mode
                } else {
                  onSelectTool(tool.id);
                }
              }}
              title={`${tool.label} (${tool.shortDesc})`}
              className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center transition-all cursor-pointer relative group touch-manipulation ${
                isActive
                  ? 'bg-[#2962FF] text-white shadow-lg ring-2 ring-[#2962FF]/60 scale-105'
                  : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
              }`}
            >
              {tool.icon}

              {/* Active dot indicator on mobile */}
              {isActive && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#089981] border border-[#131722]" />
              )}

              {/* Tooltip on hover (desktop) */}
              <div className="hidden md:group-hover:flex absolute left-full ml-2 px-2 py-1 bg-[#1E222D] text-white text-[11px] font-medium rounded shadow-xl border border-[#2B2F3A] whitespace-nowrap z-50 pointer-events-none items-center gap-1.5">
                <span>{tool.label}</span>
                <span className="text-[9px] text-[#787B86] font-mono">[{tool.shortDesc}]</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="w-6 h-px bg-[#2B2F3A] my-1" />

      {/* MAGNET MODE (Snaps to OHLC Candlestick Levels) */}
      <button
        onClick={onToggleMagnetMode}
        title={magnetMode ? 'Magnet Mode: ON (Snaps to Candles)' : 'Magnet Mode: OFF'}
        className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
          magnetMode
            ? 'bg-[#089981]/20 text-[#089981] border border-[#089981]/50'
            : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
        }`}
      >
        <Magnet className="w-4 h-4" />
      </button>

      {/* LOCK ALL DRAWINGS */}
      <button
        onClick={onToggleLockAll}
        title={isAllLocked ? 'Unlock All Drawings' : 'Lock All Drawings'}
        className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
          isAllLocked
            ? 'bg-[#F59E0B]/20 text-[#F59E0B]'
            : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
        }`}
      >
        {isAllLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
      </button>

      {/* HIDE ALL DRAWINGS */}
      <button
        onClick={onToggleHideAll}
        title={isAllHidden ? 'Show All Drawings' : 'Hide All Drawings'}
        className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
          isAllHidden
            ? 'bg-[#F23645]/20 text-[#F23645]'
            : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
        }`}
      >
        {isAllHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>

      {/* UNDO / REDO */}
      <div className="flex flex-col gap-0.5 mt-auto">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo Drawing"
          className="w-8 h-6 rounded flex items-center justify-center text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D] disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo Drawing"
          className="w-8 h-6 rounded flex items-center justify-center text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D] disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-6 h-px bg-[#2B2F3A] my-0.5" />

      {/* DRAWING SETTINGS TRIGGER */}
      <button
        onClick={onOpenSettings}
        title="Drawing Defaults & Colors"
        className="w-8 h-8 rounded flex items-center justify-center text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D] transition-colors cursor-pointer"
      >
        <Sliders className="w-4 h-4" />
      </button>

      {/* REMOVE ALL DRAWINGS BUTTON */}
      <button
        onClick={() => {
          if (drawingsCount > 0 && window.confirm(`Remove all ${drawingsCount} drawings on this chart?`)) {
            onClearDrawings();
          }
        }}
        disabled={drawingsCount === 0}
        title={drawingsCount > 0 ? `Remove All ${drawingsCount} Drawings` : 'No active drawings'}
        className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
          drawingsCount > 0
            ? 'text-[#787B86] hover:text-[#F23645] hover:bg-[#1E222D] cursor-pointer'
            : 'text-[#787B86]/25 cursor-not-allowed'
        }`}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </aside>
  );
};
