import React, { useState, useEffect } from 'react';
import { ListMusic, Play, Trash2, GripVertical, Plus, Music, Radio } from 'lucide-react';
import { playerEngine, PlayableTrack } from '../services/playerEngine';
import { roomSocket } from '../services/roomSocket';

export const PlaylistDetailView: React.FC = () => {
  const [queue, setQueue] = useState<PlayableTrack[]>(playerEngine.queue);
  const [currentIndex, setCurrentIndex] = useState<number>(playerEngine.index);

  useEffect(() => {
    const unsub = playerEngine.subscribe(() => {
      setQueue(playerEngine.queue);
      setCurrentIndex(playerEngine.index);
    });
    return unsub;
  }, []);

  const handlePlayIndex = (idx: number) => {
    playerEngine.playQueue(queue, idx);
  };

  const handleRemoveIndex = (idx: number) => {
    const updated = queue.filter((_, i) => i !== idx);
    let newIndex = currentIndex;
    if (idx < currentIndex) newIndex--;
    playerEngine.playQueue(updated, Math.max(0, Math.min(newIndex, updated.length - 1)));
  };

  return (
    <div className="h-full w-full p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar select-none">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-display tracking-tight flex items-center gap-2.5">
            <ListMusic className="w-6 h-6 text-purple-400" />
            Room Playback Queue
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time synchronized queue. All participants hear tracks in this exact order.
          </p>
        </div>

        {roomSocket.isInRoom && (
          <div className="px-3 py-1.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-semibold flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 animate-pulse text-purple-400" />
            <span>Room {roomSocket.roomId} Queue</span>
          </div>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="glass-panel p-12 rounded-3xl flex flex-col items-center justify-center text-center gap-3 border border-white/10 my-auto">
          <div className="w-16 h-16 rounded-2xl bg-purple-900/30 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-2">
            <ListMusic className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-white">Queue is Empty</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            Search for tracks or load local files to add them to the room queue.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {queue.map((track, i) => {
            const isCurrent = i === currentIndex;
            return (
              <div
                key={track.queueItemId || track.id + '-' + i}
                onClick={() => handlePlayIndex(i)}
                className={`glass-panel p-3.5 rounded-2xl flex items-center justify-between gap-4 cursor-pointer transition-all border ${
                  isCurrent
                    ? 'border-purple-500/60 bg-purple-950/40 shadow-lg shadow-purple-900/20'
                    : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="text-xs font-mono font-bold text-slate-400 w-5 text-center">
                    {isCurrent ? (
                      <span className="text-purple-400 animate-pulse">&bull;</span>
                    ) : (
                      i + 1
                    )}
                  </span>

                  <div className="w-10 h-10 rounded-xl bg-purple-900/40 border border-purple-500/30 flex items-center justify-center overflow-hidden shrink-0">
                    {track.artworkURL ? (
                      <img src={track.artworkURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Music className="w-5 h-5 text-purple-400" />
                    )}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <span className={`text-sm font-semibold truncate ${isCurrent ? 'text-purple-300' : 'text-white'}`}>
                      {track.title}
                    </span>
                    <span className="text-xs text-slate-400 truncate">{track.artist}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveIndex(i);
                    }}
                    className="w-8 h-8 rounded-lg hover:bg-red-500/20 flex items-center justify-center text-slate-400 hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
