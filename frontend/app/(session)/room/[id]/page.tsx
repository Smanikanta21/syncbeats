"use client";

import { motion } from "framer-motion";
import { Copy, Users, QrCode, Smartphone, Laptop, Speaker, Volume2 } from "lucide-react";
import { usePathname } from "next/navigation";

// Mock Data
const participants = [
  { id: 1, name: "Rick Rubin", isHost: true, device: Smartphone, volume: 100, avatar: "RR" },
  { id: 2, name: "Studio Mac", isHost: false, device: Laptop, volume: 80, avatar: "SM" },
  { id: 3, name: "Living Room Sonos", isHost: false, device: Speaker, volume: 60, avatar: "LR" },
  { id: 4, name: "Sarah's iPhone", isHost: false, device: Smartphone, volume: 0, avatar: "S" },
];

export default function RoomPage() {
  const pathname = usePathname();
  const idStr = pathname.split('/').pop() || "000000";

  return (
    <div className="flex flex-col items-center justify-start relative px-4 sm:px-6 lg:px-8 mt-[450px] z-0 pb-32">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-[500px] bg-white/[0.015] blur-[150px] rounded-full pointer-events-none -z-10" />

      {/* Code & QR Section */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="text-center w-full max-w-4xl flex flex-col items-center"
      >
        <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-zinc-300 text-sm font-semibold tracking-widest mb-6 inline-flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
           <Users className="w-4 h-4 text-zinc-400" />
           Sync Session Active
        </span>

        <div className="flex flex-col md:flex-row items-center justify-center gap-12 mb-16">
          {/* Room Code */}
          <div className="text-center">
             <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm mb-2">Room Code</p>
             <h1 className="text-[5rem] sm:text-[7rem] font-black text-white tracking-tighter leading-none flex items-center justify-center gap-4 group cursor-pointer drop-shadow-2xl">
                {idStr}
                <div className="w-12 h-12 rounded-full bg-white/10 hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                   <Copy className="w-5 h-5 text-zinc-200" />
                </div>
             </h1>
          </div>

          <div className="hidden md:block w-px h-32 bg-white/10" />

          {/* Minimal QR Code Display */}
          <div className="flex flex-col items-center">
             <div className="p-4 bg-white/5 border border-white/10 rounded-3xl shadow-[0_0_30px_rgba(255,255,255,0.05)] hover:scale-105 transition-transform cursor-pointer group hover:bg-white">
                <QrCode className="w-28 h-28 text-white group-hover:text-black transition-colors" strokeWidth={1} />
             </div>
             <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs mt-4">Scan Code</p>
          </div>
        </div>
      </motion.div>

      {/* Connected Devices Grid */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="w-full max-w-3xl flex flex-col gap-6"
      >
         <h3 className="text-sm font-bold tracking-widest uppercase text-zinc-500 text-center md:text-left mb-2">Connected Devices ({participants.length})</h3>
         
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {participants.map((p) => (
              <div key={p.id} className="glass-panel p-5 rounded-[2rem] border border-white/5 bg-black/60 hover:bg-white/[0.03] transition-colors group flex flex-col gap-4 shadow-[0_10px_20px_rgba(0,0,0,0.4)]">
                 
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-700 flex items-center justify-center border border-white/10 relative">
                          <span className="font-black text-zinc-300 text-sm tracking-widest">{p.avatar}</span>
                          {/* Device badge overlapping avatar */}
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                             <p.device className="w-3 h-3 text-zinc-400" />
                          </div>
                       </div>
                       <div>
                          <div className="flex items-center gap-2">
                             <h4 className="font-bold text-zinc-200">{p.name}</h4>
                             {p.isHost && (
                               <span className="px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-widest bg-zinc-200 text-black">Host</span>
                             )}
                          </div>
                          <p className="text-xs font-medium text-zinc-500">Synced • 0ms Latency</p>
                       </div>
                    </div>
                 </div>

                 {/* Volume Control Mixer */}
                 <div className="flex items-center gap-3 w-full bg-black/40 p-3 rounded-xl border border-white/5 mix-blend-screen">
                    <Volume2 className={`w-4 h-4 ${p.volume === 0 ? "text-red-500/50" : "text-zinc-500"}`} />
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden group/slider cursor-pointer relative">
                       <div 
                         className={`h-full rounded-full transition-all duration-300 ${p.volume === 0 ? "bg-red-500/50" : "bg-zinc-300 group-hover/slider:bg-white"}`} 
                         style={{ width: `${p.volume}%` }} 
                       />
                    </div>
                    <span className="text-xs font-bold text-zinc-500 w-8 text-right">{p.volume}%</span>
                 </div>

              </div>
            ))}
         </div>
      </motion.div>

    </div>
  );
}
