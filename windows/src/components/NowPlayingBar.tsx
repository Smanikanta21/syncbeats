import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Music, Radio, Zap } from 'lucide-react';
import { playerEngine, PlayableTrack } from '../services/playerEngine';
import { roomSocket } from '../services/roomSocket';

export const NowPlayingBar: React.FC = () => {
  const [current, setCurrent] = useState<PlayableTrack | null>(playerEngine.current);
  const [isPlaying, setIsPlaying] = useState(playerEngine.isPlaying);
  const [currentTime, setCurrentTime] = useState(playerEngine.currentTime);
  const [duration, setDuration] = useState(playerEngine.duration);
  const [volume, setVolume] = useState(playerEngine.volume);
  const [latency, setLatency] = useState(roomSocket.latencyMs);

  useEffect(() => {
    const unsubEngine = playerEngine.subscribe(() => {
      setCurrent(playerEngine.current);
      setIsPlaying(playerEngine.isPlaying);
      setCurrentTime(playerEngine.currentTime);
      setDuration(playerEngine.duration);
      setVolume(playerEngine.volume);
    });

    const unsubRoom = roomSocket.subscribe(() => {
      setLatency(roomSocket.latencyMs);
    });

    return () => {
      unsubEngine();
      unsubRoom();
    };
  }, []);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="h-20 w-full glass-panel border-t border-white/10 px-6 flex items-center justify-between gap-6 shrink-0 z-30 select-none">
      {/* Left: Track Details */}
      <div className="flex items-center gap-4 min-w-[240px] max-w-[300px]">
        <div className="w-12 h-12 rounded-xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center overflow-hidden shrink-0 shadow-lg">
          {current?.artworkURL ? (
            <img src={current.artworkURL} alt="" className="w-full h-full object-cover" />
          ) : (
            <Music className="w-6 h-6 text-purple-400" />
          )}
        </div>

        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-white truncate">
            {current ? current.title : 'No Track Selected'}
          </span>
          <span className="text-xs text-slate-400 truncate">
            {current ? current.artist : 'Select a track or join a room'}
          </span>
        </div>
      </div>

      {/* Center: Controls & Seekbar */}
      <div className="flex flex-col items-center gap-1.5 flex-1 max-w-[550px]">
        <div className="flex items-center gap-5">
          <button
            onClick={() => playerEngine.prev()}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => playerEngine.togglePlayPause()}
            disabled={!current}
            className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 hover:from-purple-500 hover:to-indigo-400 flex items-center justify-center text-white shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <button
            onClick={() => playerEngine.next()}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <div className="w-full flex items-center gap-3 text-xs font-mono text-slate-400">
          <span>{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => playerEngine.seek(Number(e.target.value))}
            className="flex-1 accent-purple-500 h-1 bg-white/10 rounded-lg cursor-pointer hover:bg-white/20 transition-all"
          />
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right: Volume & Room Latency badge */}
      <div className="flex items-center gap-4 min-w-[200px] justify-end">
        {roomSocket.isInRoom && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-mono">
            <Zap className="w-3.5 h-3.5 text-purple-400" />
            <span>{latency}ms</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => playerEngine.setVolume(volume === 0 ? 0.8 : 0)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => playerEngine.setVolume(Number(e.target.value))}
            className="w-24 accent-purple-500 h-1 bg-white/10 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
