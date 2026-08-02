import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Music, Radio, ChevronUp, ChevronDown, Zap } from 'lucide-react';
import { playerEngine, PlayableTrack } from '../services/playerEngine';
import { roomSocket } from '../services/roomSocket';

export type IslandMode = 'miniPlayer' | 'player' | 'welcome' | 'hidden';

export const FloatingIsland: React.FC = () => {
  const [mode, setMode] = useState<IslandMode>('miniPlayer');
  const [current, setCurrent] = useState<PlayableTrack | null>(playerEngine.current);
  const [isPlaying, setIsPlaying] = useState(playerEngine.isPlaying);
  const [currentTime, setCurrentTime] = useState(playerEngine.currentTime);
  const [duration, setDuration] = useState(playerEngine.duration);
  const [latency, setLatency] = useState(roomSocket.latencyMs);

  useEffect(() => {
    const unsubEngine = playerEngine.subscribe(() => {
      setCurrent(playerEngine.current);
      setIsPlaying(playerEngine.isPlaying);
      setCurrentTime(playerEngine.currentTime);
      setDuration(playerEngine.duration);
    });

    const unsubRoom = roomSocket.subscribe(() => {
      setLatency(roomSocket.latencyMs);
    });

    return () => {
      unsubEngine();
      unsubRoom();
    };
  }, []);

  if (!current) {
    return (
      <div className="fixed top-12 left-1/2 -translate-x-1/2 z-40">
        <div className="glass-island px-4 py-1.5 rounded-full flex items-center gap-2.5 text-xs text-slate-400 shadow-xl border border-white/10">
          <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          <span>SyncBeats Idle &bull; Join a Room or Play a Track</span>
        </div>
      </div>
    );
  }

  const toggleExpand = () => {
    setMode((prev) => (prev === 'miniPlayer' ? 'player' : 'miniPlayer'));
  };

  return (
    <div className="fixed top-12 left-1/2 -translate-x-1/2 z-40 transition-all duration-300 ease-out">
      {mode === 'miniPlayer' ? (
        <div
          onClick={toggleExpand}
          className="glass-island px-4 py-2 rounded-full flex items-center gap-3 cursor-pointer hover:scale-105 transition-all shadow-2xl border border-purple-500/30 group"
        >
          <div className="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-400/40 flex items-center justify-center overflow-hidden shrink-0">
            {current.artworkURL ? (
              <img src={current.artworkURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <Music className="w-3.5 h-3.5 text-purple-300" />
            )}
          </div>

          <div className="flex flex-col max-w-[160px]">
            <span className="text-xs font-semibold text-white truncate leading-tight">
              {current.title}
            </span>
            <span className="text-[10px] text-slate-400 truncate leading-tight">
              {current.artist}
            </span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              playerEngine.togglePlayPause();
            }}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
          </button>

          <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
        </div>
      ) : (
        <div className="glass-island p-4 rounded-3xl w-[400px] flex flex-col gap-3 shadow-2xl border border-purple-500/40 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-purple-400 animate-pulse" />
              <span className="text-xs font-semibold text-purple-300 font-display">
                {roomSocket.isInRoom ? `Room ${roomSocket.roomId} &bull; Synced` : 'Local Playback'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {roomSocket.isInRoom && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" />
                  {latency}ms
                </span>
              )}
              <button
                onClick={toggleExpand}
                className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-600/30 border border-purple-400/30 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
              {current.artworkURL ? (
                <img src={current.artworkURL} alt="" className="w-full h-full object-cover" />
              ) : (
                <Music className="w-6 h-6 text-purple-300" />
              )}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-bold text-white truncate">{current.title}</span>
              <span className="text-xs text-slate-400 truncate">{current.artist}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => playerEngine.seek(Number(e.target.value))}
              className="w-full accent-purple-500 h-1 bg-white/20 rounded-lg cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-center gap-4 pt-1">
            <button
              onClick={() => playerEngine.prev()}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={() => playerEngine.togglePlayPause()}
              className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 hover:from-purple-500 hover:to-indigo-400 flex items-center justify-center text-white shadow-lg shadow-purple-500/30"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>

            <button
              onClick={() => playerEngine.next()}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
