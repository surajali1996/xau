import React, { useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Scissors,
  X,
  GripHorizontal,
} from 'lucide-react';
import { ReplayState, ReplaySpeed } from '../types';

interface BarReplayEngineProps {
  replayState: ReplayState;
  onPlayToggle: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onSpeedChange: (speed: ReplaySpeed) => void;
  onSelectCutoff: () => void;
  onExitReplay: () => void;
  onSeek: (index: number) => void;
}

export const BarReplayEngine: React.FC<BarReplayEngineProps> = ({
  replayState,
  onPlayToggle,
  onStepForward,
  onStepBackward,
  onSpeedChange,
  onSelectCutoff,
  onExitReplay,
  onSeek,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Floating window dragging logic for mouse and touch
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
      const x = Math.max(10, Math.min(window.innerWidth - 360, moveX - dragOffsetRef.current.x));
      const y = Math.max(50, Math.min(window.innerHeight - 110, moveY - dragOffsetRef.current.y));
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

  const speeds: ReplaySpeed[] = [0.5, 1, 2, 3, 5, 10];
  const currentBar = replayState.allCandles[replayState.currentIndex];
  const totalCount = replayState.allCandles.length;

  return (
    <>
      {/* Cutoff selection banner notice */}
      {replayState.isSelectingCutoff && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#2962FF] text-white px-4 py-2 rounded-lg shadow-xl text-xs font-medium flex items-center gap-2 border border-blue-400/30 animate-pulse select-none">
          <Scissors className="w-4 h-4" />
          <span>Click on any candle on the chart to set the replay cut-off point</span>
          <button
            onClick={() => onExitReplay()}
            className="ml-3 text-white/80 hover:text-white p-0.5 rounded hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Replay Toolbar */}
      {replayState.isActive && (
        <div
          ref={containerRef}
          style={{ bottom: '48px', left: '50%', transform: 'translateX(-50%)' }}
          className="fixed z-40 bg-[#1E222D] border border-[#2B2F3A] rounded-xl shadow-2xl p-2.5 flex flex-col gap-2 select-none min-w-[340px] md:min-w-[420px] backdrop-blur-md bg-opacity-95 text-[#D1D4DC]"
        >
          {/* Top row: Drag Handle & Meta & Exit button */}
          <div className="flex items-center justify-between border-b border-[#2B2F3A] pb-1.5">
            <div
              onMouseDown={(e) => handleStartDrag(e.clientX, e.clientY)}
              onTouchStart={(e) => {
                if (e.touches[0]) handleStartDrag(e.touches[0].clientX, e.touches[0].clientY);
              }}
              className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing text-[#787B86] hover:text-[#D1D4DC] px-1 py-0.5 rounded touch-none"
            >
              <GripHorizontal className="w-4 h-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#2962FF]">
                Bar Replay
              </span>
            </div>

            <div className="flex items-center gap-3">
              {currentBar && (
                <span className="text-[11px] font-mono text-[#787B86] tabular-nums">
                  {new Date(currentBar.time * 1000).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
              <button
                onClick={onExitReplay}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#F23645]/15 text-[#F23645] hover:bg-[#F23645]/25 transition-colors"
                title="Exit Replay and return to live stream"
              >
                <X className="w-3 h-3" />
                <span>Exit Replay</span>
              </button>
            </div>
          </div>

          {/* Middle row: Timeline progress scrubber */}
          <div className="flex items-center gap-2 px-1">
            <span className="text-[10px] font-mono text-[#787B86] tabular-nums">
              {replayState.currentIndex + 1}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0, totalCount - 1)}
              value={replayState.currentIndex}
              onChange={(e) => onSeek(parseInt(e.target.value, 10))}
              className="flex-1 h-1.5 bg-[#2A2E39] rounded-lg appearance-none cursor-pointer accent-[#2962FF]"
            />
            <span className="text-[10px] font-mono text-[#787B86] tabular-nums">
              {totalCount}
            </span>
          </div>

          {/* Bottom row: Playback controls */}
          <div className="flex items-center justify-between pt-1">
            {/* Cut-off button */}
            <button
              onClick={onSelectCutoff}
              className={`p-1.5 rounded transition-colors text-xs flex items-center gap-1 ${
                replayState.isSelectingCutoff
                  ? 'bg-[#2962FF] text-white'
                  : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39]'
              }`}
              title="Jump to a specific bar cutoff"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Jump to Bar</span>
            </button>

            {/* Stepper buttons & Play/Pause */}
            <div className="flex items-center gap-1 bg-[#131722] p-0.5 rounded-lg border border-[#2B2F3A]">
              <button
                onClick={onStepBackward}
                disabled={replayState.currentIndex <= 0}
                className="p-1.5 rounded text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Step 1 Bar Backward"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={onPlayToggle}
                className="px-3 py-1.5 rounded bg-[#2962FF] text-white hover:bg-[#1e53e5] transition-colors flex items-center justify-center"
                title={replayState.isPlaying ? 'Pause' : 'Play'}
              >
                {replayState.isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>

              <button
                onClick={onStepForward}
                disabled={replayState.currentIndex >= totalCount - 1}
                className="p-1.5 rounded text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Step 1 Bar Forward"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Speed Selector */}
            <div className="flex items-center gap-0.5 bg-[#131722] p-0.5 rounded-lg border border-[#2B2F3A]">
              {speeds.map((s) => (
                <button
                  key={s}
                  onClick={() => onSpeedChange(s)}
                  className={`px-1.5 py-1 text-[11px] font-mono rounded transition-colors ${
                    replayState.speed === s
                      ? 'bg-[#2A2E39] text-[#2962FF] font-bold'
                      : 'text-[#787B86] hover:text-[#D1D4DC]'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
