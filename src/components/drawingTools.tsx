import React from 'react';
import {
  MousePointer2,
  TrendingUp,
  Minus,
  MoveHorizontal,
  MoveVertical,
  ArrowUpRight,
  ArrowRight,
  Crosshair,
  Info,
  Compass,
  Square,
  Circle,
  Triangle,
  Spline,
  Paintbrush,
  Highlighter,
  Type,
  MessageSquare,
  Tag,
  ArrowBigUp,
  Layers,
  GitFork,
  GitCommitHorizontal,
  GitBranch,
  Rows3,
  Columns3,
  CalendarRange,
  Ruler,
  Percent,
  TrendingDown,
  Maximize2,
} from 'lucide-react';
import { DrawingTool, FibLevel } from '../types';

export type ToolKind = 'click1' | 'drag2' | 'click3' | 'multi' | 'freehand';

export interface ToolDef {
  id: DrawingTool;
  label: string;
  shortcut?: string;
  kind: ToolKind;
}

export interface ToolGroup {
  id: string;
  label: string;
  tools: ToolDef[];
}

// TradingView-style grouping of the left drawing toolbar
export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'lines',
    label: 'Trend Line Tools',
    tools: [
      { id: 'trendline', label: 'Trend Line', shortcut: 'Alt + T', kind: 'drag2' },
      { id: 'ray', label: 'Ray', kind: 'drag2' },
      { id: 'info_line', label: 'Info Line', kind: 'drag2' },
      { id: 'extended_line', label: 'Extended Line', kind: 'drag2' },
      { id: 'trend_angle', label: 'Trend Angle', kind: 'drag2' },
      { id: 'arrow', label: 'Arrow', kind: 'drag2' },
      { id: 'horizontal_line', label: 'Horizontal Line', shortcut: 'Alt + H', kind: 'click1' },
      { id: 'horizontal_ray', label: 'Horizontal Ray', shortcut: 'Alt + J', kind: 'click1' },
      { id: 'vertical_line', label: 'Vertical Line', shortcut: 'Alt + V', kind: 'click1' },
      { id: 'cross_line', label: 'Cross Line', shortcut: 'Alt + C', kind: 'click1' },
    ],
  },
  {
    id: 'channels',
    label: 'Channels & Pitchforks',
    tools: [
      { id: 'parallel_channel', label: 'Parallel Channel', kind: 'click3' },
      { id: 'pitchfork', label: 'Pitchfork', kind: 'click3' },
    ],
  },
  {
    id: 'fib',
    label: 'Fibonacci Tools',
    tools: [
      { id: 'fibonacci', label: 'Fib Retracement', shortcut: 'Alt + F', kind: 'drag2' },
      { id: 'fibonacci_extension', label: 'Trend-Based Fib Extension', kind: 'click3' },
      { id: 'fibonacci_channel', label: 'Fib Channel', kind: 'click3' },
      { id: 'fibonacci_timezones', label: 'Fib Time Zone', kind: 'drag2' },
    ],
  },
  {
    id: 'shapes',
    label: 'Geometric Shapes',
    tools: [
      { id: 'rectangle', label: 'Rectangle', shortcut: 'Alt + Shift + R', kind: 'drag2' },
      { id: 'circle', label: 'Circle', kind: 'drag2' },
      { id: 'ellipse', label: 'Ellipse', kind: 'drag2' },
      { id: 'triangle', label: 'Triangle', kind: 'click3' },
      { id: 'polyline', label: 'Path / Polyline (double-tap to finish)', kind: 'multi' },
      { id: 'brush', label: 'Brush', kind: 'freehand' },
      { id: 'highlighter', label: 'Highlighter', kind: 'freehand' },
    ],
  },
  {
    id: 'annotations',
    label: 'Annotation Tools',
    tools: [
      { id: 'text', label: 'Text', kind: 'click1' },
      { id: 'callout', label: 'Callout', kind: 'drag2' },
      { id: 'price_label', label: 'Price Label', kind: 'click1' },
      { id: 'arrow_marker', label: 'Arrow Marker', kind: 'click1' },
    ],
  },
  {
    id: 'forecast',
    label: 'Forecasting & Measurement',
    tools: [
      { id: 'long_position', label: 'Long Position', kind: 'drag2' },
      { id: 'short_position', label: 'Short Position', kind: 'drag2' },
      { id: 'price_range', label: 'Price Range (%)', kind: 'drag2' },
      { id: 'date_range', label: 'Date Range', kind: 'drag2' },
      { id: 'date_and_price_range', label: 'Date & Price Range', kind: 'drag2' },
    ],
  },
];

export const ALL_TOOLS: ToolDef[] = TOOL_GROUPS.flatMap((g) => g.tools);

export const getToolDef = (tool: DrawingTool): ToolDef | undefined =>
  ALL_TOOLS.find((t) => t.id === tool) ||
  (tool === 'price_percentage_measure'
    ? { id: tool, label: 'Price Range (%)', kind: 'drag2' }
    : undefined);

export const getToolKind = (tool: DrawingTool): ToolKind => getToolDef(tool)?.kind || 'drag2';

export const getToolLabel = (tool: DrawingTool): string =>
  tool === 'cursor' ? 'Cursor' : getToolDef(tool)?.label || tool.replace(/_/g, ' ');

export const getToolIcon = (tool: DrawingTool, cls = 'w-4 h-4'): React.ReactNode => {
  switch (tool) {
    case 'cursor':
      return <MousePointer2 className={cls} />;
    case 'trendline':
      return <TrendingUp className={cls} />;
    case 'ray':
      return <ArrowUpRight className={cls} />;
    case 'info_line':
      return <Info className={cls} />;
    case 'extended_line':
      return <Maximize2 className={`${cls} rotate-45`} />;
    case 'trend_angle':
      return <Compass className={cls} />;
    case 'arrow':
      return <ArrowRight className={`${cls} -rotate-45`} />;
    case 'horizontal_line':
      return <Minus className={`${cls} stroke-[2.5]`} />;
    case 'horizontal_ray':
      return <MoveHorizontal className={cls} />;
    case 'vertical_line':
      return <MoveVertical className={cls} />;
    case 'cross_line':
      return <Crosshair className={cls} />;
    case 'parallel_channel':
      return <Layers className={cls} />;
    case 'pitchfork':
      return <GitFork className={`${cls} rotate-90`} />;
    case 'fibonacci':
      return <Rows3 className={cls} />;
    case 'fibonacci_extension':
      return <GitBranch className={cls} />;
    case 'fibonacci_channel':
      return <GitCommitHorizontal className={cls} />;
    case 'fibonacci_timezones':
      return <Columns3 className={cls} />;
    case 'rectangle':
      return <Square className={cls} />;
    case 'circle':
      return <Circle className={cls} />;
    case 'ellipse':
      return <Circle className={`${cls} scale-x-125 scale-y-75`} />;
    case 'triangle':
      return <Triangle className={cls} />;
    case 'polyline':
      return <Spline className={cls} />;
    case 'brush':
      return <Paintbrush className={cls} />;
    case 'highlighter':
      return <Highlighter className={cls} />;
    case 'text':
      return <Type className={cls} />;
    case 'callout':
      return <MessageSquare className={cls} />;
    case 'price_label':
      return <Tag className={cls} />;
    case 'arrow_marker':
      return <ArrowBigUp className={cls} />;
    case 'long_position':
      return <TrendingUp className={`${cls} text-[#089981]`} />;
    case 'short_position':
      return <TrendingDown className={`${cls} text-[#F23645]`} />;
    case 'price_range':
    case 'price_percentage_measure':
      return <Percent className={cls} />;
    case 'date_range':
      return <CalendarRange className={cls} />;
    case 'date_and_price_range':
      return <Ruler className={cls} />;
    default:
      return <TrendingUp className={cls} />;
  }
};

// Default Fibonacci levels (TradingView defaults)
export const DEFAULT_FIB_LEVELS: FibLevel[] = [
  { ratio: 0, color: '#787B86', enabled: true },
  { ratio: 0.236, color: '#F23645', enabled: true },
  { ratio: 0.382, color: '#FF9800', enabled: true },
  { ratio: 0.5, color: '#4CAF50', enabled: true },
  { ratio: 0.618, color: '#089981', enabled: true },
  { ratio: 0.786, color: '#00BCD4', enabled: true },
  { ratio: 1, color: '#787B86', enabled: true },
  { ratio: 1.618, color: '#2962FF', enabled: true },
  { ratio: 2.618, color: '#F23645', enabled: false },
  { ratio: 3.618, color: '#9C27B0', enabled: false },
  { ratio: 4.236, color: '#E91E63', enabled: false },
];

export const DEFAULT_FIB_EXT_LEVELS: FibLevel[] = [
  { ratio: 0, color: '#787B86', enabled: true },
  { ratio: 0.236, color: '#F23645', enabled: false },
  { ratio: 0.382, color: '#FF9800', enabled: true },
  { ratio: 0.5, color: '#4CAF50', enabled: true },
  { ratio: 0.618, color: '#089981', enabled: true },
  { ratio: 0.786, color: '#00BCD4', enabled: false },
  { ratio: 1, color: '#787B86', enabled: true },
  { ratio: 1.618, color: '#2962FF', enabled: true },
  { ratio: 2.618, color: '#F23645', enabled: true },
  { ratio: 3.618, color: '#9C27B0', enabled: false },
  { ratio: 4.236, color: '#E91E63', enabled: false },
];

export const DEFAULT_FIB_TIME_LEVELS: FibLevel[] = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89].map((r) => ({
  ratio: r,
  color: '#2962FF',
  enabled: true,
}));

export const getDefaultLevels = (tool: DrawingTool): FibLevel[] | undefined => {
  if (tool === 'fibonacci' || tool === 'fibonacci_channel') return DEFAULT_FIB_LEVELS;
  if (tool === 'fibonacci_extension') return DEFAULT_FIB_EXT_LEVELS;
  if (tool === 'fibonacci_timezones') return DEFAULT_FIB_TIME_LEVELS;
  return undefined;
};

// Tools whose shape can be filled (have a background)
export const FILLABLE_TOOLS: DrawingTool[] = [
  'rectangle',
  'circle',
  'ellipse',
  'triangle',
  'parallel_channel',
  'pitchfork',
  'fibonacci',
  'fibonacci_channel',
  'fibonacci_extension',
  'callout',
];

// Tools whose lines can be extended left/right
export const EXTENDABLE_TOOLS: DrawingTool[] = [
  'trendline',
  'info_line',
  'trend_angle',
  'ray',
  'extended_line',
  'rectangle',
  'parallel_channel',
  'fibonacci',
  'fibonacci_channel',
  'fibonacci_extension',
];

export const TEXT_TOOLS: DrawingTool[] = ['text', 'callout'];

export const DRAWING_COLORS = [
  '#FFFFFF', '#B2B5BE', '#787B86', '#434651', '#131722',
  '#F23645', '#FF9800', '#FFEB3B', '#4CAF50', '#089981',
  '#00BCD4', '#2962FF', '#673AB7', '#9C27B0', '#E91E63',
  '#F7525F', '#FFB74D', '#FFF176', '#81C784', '#4DB6AC',
  '#4DD0E1', '#5B9CF6', '#9575CD', '#BA68C8', '#F06292',
];
