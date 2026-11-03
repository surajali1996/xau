import React, { useRef } from 'react';
import {
  DrawingTool,
} from '../types';
import {
  TrendingUp,
  Minus,
  MoveVertical,
  ArrowUpRight,
  Maximize2,
  Square,
  Circle,
  Paintbrush,
  ArrowRight,
  Type,
  GitCommit,
  GitBranch,
  Ruler,
  CalendarRange,
  Percent,
  GripHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
  Tag,
  Crosshair,
  Layers,
  Spline,
} from 'lucide-react';

interface FavoriteDrawingToolsProps {
  favoriteTools: DrawingTool[];
  activeTool: DrawingTool;
  onSelectTool: (tool: DrawingTool) => void;
  onRemoveFavorite: (tool: DrawingTool) => void;
  onMoveFavorite: (index: number, direction: 'left' | 'right') => void;
}

export const getToolIcon = (tool: DrawingTool) => {
  switch (tool) {
    case 'trendline':
      return <TrendingUp className="w-4 h-4" />;
    case 'horizontal_line':
      return <Minus className="w-4 h-4" />;
    case 'horizontal_ray':
      return <ArrowRight className="w-4 h-4" />;
    case 'vertical_line':
      return <MoveVertical className="w-4 h-4" />;
    case 'ray':
      return <ArrowUpRight className="w-4 h-4" />;
    case 'extended_line':
      return <Maximize2 className="w-4 h-4" />;
    case 'arrow':
      return <ArrowRight className="w-4 h-4" />;
    case 'cross_line':
      return <Crosshair className="w-4 h-4" />;
    case 'rectangle':
      return <Square className="w-4 h-4" />;
    case 'circle':
      return <Circle className="w-4 h-4" />;
    case 'ellipse':
      return <Circle className="w-4 h-4 scale-x-125" />;
    case 'parallel_channel':
      return <Layers className="w-4 h-4" />;
    case 'brush':
      return <Paintbrush className="w-4 h-4" />;
    case 'polyline':
      return <Spline className="w-4 h-4" />;
    case 'fibonacci':
      return <GitCommit className="w-4 h-4" />;
    case 'fibonacci_extension':
      return <GitBranch className="w-4 h-4" />;
    case 'fibonacci_channel':
      return <Layers className="w-4 h-4" />;
    case 'fibonacci_timezones':
      return <CalendarRange className="w-4 h-4" />;
    case 'text':
      return <Type className="w-4 h-4" />;
    case 'price_label':
      return <Tag className="w-4 h-4" />;
    case 'arrow_marker':
      return <ArrowUpRight className="w-4 h-4" />;
    case 'price_percentage_measure':
      return <Percent className="w-4 h-4 text-[#089981]" />;
    case 'price_range':
      return <Ruler className="w-4 h-4" />;
    case 'date_and_price_range':
      return <CalendarRange className="w-4 h-4" />;
    case 'date_range':
      return <CalendarRange className="w-4 h-4" />;
    default:
      return <TrendingUp className="w-4 h-4" />;
  }
};

export const getToolLabel = (tool: DrawingTool) => {
  switch (tool) {
    case 'trendline':
      return 'Trend Line';
    case 'horizontal_line':
      return 'Horizontal Line';
    case 'horizontal_ray':
      return 'Horizontal Ray';
    case 'vertical_line':
      return 'Vertical Line';
    case 'ray':
      return 'Ray';
    case 'extended_line':
      return 'Extended Line';
    case 'arrow':
      return 'Arrow';
    case 'cross_line':
      return 'Cross Line';
    case 'rectangle':
      return 'Rectangle';
    case 'circle':
      return 'Circle';
    case 'ellipse':
      return 'Ellipse';
    case 'parallel_channel':
      return 'Parallel Channel';
    case 'brush':
      return 'Brush Freehand';
    case 'polyline':
      return 'Polyline / Path';
    case 'fibonacci':
      return 'Fibonacci Retracement';
    case 'fibonacci_extension':
      return 'Fibonacci Extension';
    case 'fibonacci_channel':
      return 'Fibonacci Channel';
    case 'fibonacci_timezones':
      return 'Fibonacci Time Zones';
    case 'text':
      return 'Text Annotation';
    case 'price_label':
      return 'Price Label Badge';
    case 'arrow_marker':
      return 'Arrow Marker';
    case 'price_percentage_measure':
      return 'Price Percentage Measure';
    case 'price_range':
      return 'Price Range';
    case 'date_and_price_range':
      return 'Date & Price Range';
    case 'date_range':
      return 'Date Range (Bars)';
    default:
      return tool;
  }
};

export const FavoriteDrawingTools: React.FC<FavoriteDrawingToolsProps> = ({
  favoriteTools,
  activeTool,
  onSelectTool,
  onRemoveFavorite,
  onMoveFavorite,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  if (favoriteTools.length === 0) return null;

  const handleStartDrag = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    isDraggingRef.current = true;
    const rect = containerRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };

    const handleMove = (moveX: number, moveY: number) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const x = Math.max(10, Math.min(window.innerWidth - 300, moveX - dragOffsetRef.current.x));
      const y = Math.max(50, Math.min(window.innerHeight - 80, moveY - dragOffsetRef.current.y));
      containerRef.current.style.left = `${x}px`;
      containerRef.current.style.top = `${y}px`;
      containerRef.current.style.bottom = 'auto';
      containerRef.current.style.transform = 'none';
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleMove(moveEvent.clientX, moveEvent.clientY);
    };

    const handleTouchMove = (touchEvent: TouchEvent) => {
      if (touchEvent.touches.length > 0) {
        handleMove(touchEvent.touches[0].clientX, touchEvent.touches[0].clientY);
      }
    };

    const handleEndDrag = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEndDrag);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEndDrag);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEndDrag);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleEndDrag);
  };

  return (
    <div
      ref={containerRef}
      style={{ bottom: '24px', left: '72px' }}
      className="fixed z-35 flex items-center gap-1 p-1 bg-[#1E222D]/95 border border-[#2B2F3A] rounded-lg shadow-xl backdrop-blur-md select-none text-[#D1D4DC]"
    >
      {/* Drag handle */}
      <div
        onMouseDown={(e) => handleStartDrag(e.clientX, e.clientY)}
        onTouchStart={(e) => {
          if (e.touches[0]) handleStartDrag(e.touches[0].clientX, e.touches[0].clientY);
        }}
        className="px-1 py-1 cursor-grab active:cursor-grabbing text-[#787B86] hover:text-[#D1D4DC] touch-none"
        title="Drag Favorites Bar"
      >
        <GripHorizontal className="w-3.5 h-3.5" />
      </div>

      <div className="w-px h-5 bg-[#2B2F3A] mx-0.5" />

      {/* Tool icons with reorder & quick removal */}
      <div className="flex items-center gap-1 overflow-x-auto max-w-[70vw] no-scrollbar">
        {favoriteTools.map((tool, idx) => {
          const isActive = activeTool === tool;
          return (
            <div key={tool} className="relative group flex items-center">
              <button
                onClick={() => onSelectTool(tool)}
                className={`p-1.5 rounded flex items-center justify-center transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#2962FF] text-white shadow-xs'
                    : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
                }`}
                title={getToolLabel(tool)}
              >
                {getToolIcon(tool)}
              </button>

              {/* Hover actions: Move Left, Move Right, Remove */}
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center gap-0.5 bg-[#181B24] border border-[#2B2F3A] rounded px-1 py-0.5 shadow-lg z-50">
                {idx > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveFavorite(idx, 'left');
                    }}
                    className="p-0.5 text-[#787B86] hover:text-white"
                    title="Move Left"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                )}
                {idx < favoriteTools.length - 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveFavorite(idx, 'right');
                    }}
                    className="p-0.5 text-[#787B86] hover:text-white"
                    title="Move Right"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFavorite(tool);
                  }}
                  className="p-0.5 text-[#787B86] hover:text-[#F23645]"
                  title="Remove from favorites"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
