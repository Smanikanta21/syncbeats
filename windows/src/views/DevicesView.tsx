import React, { useState, useEffect } from 'react';
import { Laptop, Volume2, ShieldCheck, Zap, Radio, RefreshCw } from 'lucide-react';
import { roomSocket, Participant } from '../services/roomSocket';

export const DevicesView: React.FC = () => {
  const [participants, setParticipants] = useState<Participant[]>(roomSocket.participants);

  useEffect(() => {
    const unsub = roomSocket.subscribe(() => {
      setParticipants(roomSocket.participants);
    });
    return unsub;
  }, []);

  return (
    <div className="h-full w-full p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar select-none">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-display tracking-tight flex items-center gap-2.5">
            <Laptop className="w-6 h-6 text-purple-400" />
            Connected Devices
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time device sync status, volume levels, and network clock drift monitoring.
          </p>
        </div>

        {roomSocket.isInRoom && (
          <div className="px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 font-mono">
            <Zap className="w-3.5 h-3.5" />
            <span>NTP Offset: {Math.round(roomSocket.clockOffset)}ms</span>
          </div>
        )}
      </div>

      {!roomSocket.isInRoom ? (
        <div className="glass-panel p-12 rounded-3xl flex flex-col items-center justify-center text-center gap-3 border border-white/10 my-auto">
          <div className="w-16 h-16 rounded-2xl bg-purple-900/30 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-2">
            <Radio className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-white">Not Connected to a Room</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            Join or create a room to view connected devices, adjust individual volumes, and check sub-25ms sync.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {participants.map((p) => {
            const isSelf = p.socketId === roomSocket.currentSocketId;
            return (
              <div
                key={p.socketId}
                className={`glass-panel p-5 rounded-2xl border flex flex-col gap-3 ${
                  isSelf ? 'border-purple-500/50 bg-purple-950/30' : 'border-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-400/30 flex items-center justify-center text-purple-300">
                      <Laptop className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                        {p.displayName}
                        {isSelf && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono">
                            (This PC)
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">ID: {p.socketId}</span>
                    </div>
                  </div>

                  {p.isHost && (
                    <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-semibold">
                      <ShieldCheck className="w-3 h-3" />
                      Host
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs text-slate-400">
                  <span>Status: {p.isReady ? 'Ready & Synced' : 'Buffering...'}</span>
                  <span className="text-emerald-400 font-mono font-semibold flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Locked
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
