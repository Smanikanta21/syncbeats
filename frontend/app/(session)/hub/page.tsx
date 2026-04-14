"use client";

import { motion } from "framer-motion";
import { Disc, Play, Plus, Search, ArrowRight, Clock, Laptop, Smartphone } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { devicesApi, roomsApi, type Device } from "../../../lib/api";

interface RecentRoom { id: string; created_at: string; playback_state: string; ended_at: string | null; }

export default function HubPage() {
  const router = useRouter();
  const { device: currentDevice } = useAuth();
  const [joinCode,    setJoinCode]    = useState("");
  const [isHosting,   setIsHosting]   = useState(false);
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);

  function DeviceGlyph({ userAgent }: { userAgent: string | null }) {
    if (userAgent?.includes("iPhone") || userAgent?.includes("Android")) return <Smartphone className="w-4 h-4 text-zinc-300" />;
    return <Laptop className="w-4 h-4 text-zinc-300" />;
  }

  useEffect(() => {
    roomsApi.mine()
      .then(({ rooms }) => setRecentRooms(rooms as RecentRoom[]))
      .catch(() => {}); // not critical if it fails

    devicesApi.mine()
      .then(({ devices }) => setDevices(devices))
      .catch(() => {});
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length > 3) {
      router.push(`/room/${joinCode.trim().toUpperCase()}`);
    }
  };

  const handleHost = async () => {
    setIsHosting(true);
    try {
      const data = await roomsApi.create();
      router.push(`/room/${data.roomId}`);
    } catch {
      // Fallback to client-side ID if server unreachable
      const randomId = Math.floor(100000 + Math.random() * 900000).toString();
      router.push(`/room/${randomId}`);
    } finally {
      setIsHosting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative px-4 sm:px-6 lg:px-8 overflow-hidden z-0">
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-[600px] bg-white/[0.015] blur-[150px] rounded-full pointer-events-none -z-10" />



      {/* Main Hub Content */}
      <main className="w-full max-w-5xl mx-auto flex-1 flex flex-col justify-center pb-20">
        
        <div className="text-center mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-black mb-4 text-zinc-200"
          >
            What's the move?
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-zinc-500 text-lg font-medium tracking-wide"
          >
            Start a new session to broadcast audio, or join a friend's room.
          </motion.p>
        </div>

        {/* The Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl mx-auto relative z-10">
          
          {/* HOST CARD */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            whileHover={{ y: -5 }}
            className="glass-panel p-8 rounded-[2.5rem] border border-white/5 bg-black/60 shadow-[0_20px_40px_rgba(0,0,0,0.4)] hover:shadow-[0_20px_60px_rgba(255,255,255,0.02)] transition-all group flex flex-col items-center text-center relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-64 h-64 bg-white/5 blur-[50px] rounded-full pointer-events-none group-hover:bg-white/10 transition-colors duration-1000" />
            
            <div className="w-20 h-20 rounded-[1.5rem] bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-white/10 transition-all duration-300">
              <Plus className="w-10 h-10 text-zinc-200" />
            </div>
            
            <h3 className="text-2xl font-bold text-zinc-200 mb-3">Host a Session</h3>
            <p className="text-zinc-500 mb-8 max-w-xs mx-auto text-sm leading-relaxed">
              Create a massive synchronized room. You'll control the playlist, volume, and playback.
            </p>
            
            <button 
              onClick={handleHost}
              disabled={isHosting}
              className="mt-auto w-full h-14 rounded-2xl bg-zinc-200 text-black font-bold text-lg hover:bg-white transition-all overflow-hidden relative shadow-[0_0_20px_rgba(255,255,255,0.05)] disabled:opacity-60 disabled:cursor-wait"
            >
              {isHosting ? "Creating Room…" : "Start Session"}
            </button>
          </motion.div>

          {/* JOIN CARD */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            whileHover={{ y: -5 }}
            className="glass-panel p-8 rounded-[2.5rem] border border-white/5 bg-black/60 shadow-[0_20px_40px_rgba(0,0,0,0.4)] hover:shadow-[0_20px_60px_rgba(255,255,255,0.02)] transition-all group flex flex-col items-center text-center relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[50px] rounded-full pointer-events-none group-hover:bg-white/10 transition-colors duration-1000" />
            
            <div className="w-20 h-20 rounded-[1.5rem] bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-white/10 transition-all duration-300">
              <Search className="w-10 h-10 text-zinc-200" />
            </div>
            
            <h3 className="text-2xl font-bold text-zinc-200 mb-3">Join a Session</h3>
            <p className="text-zinc-500 mb-8 max-w-xs mx-auto text-sm leading-relaxed">
              Already have a code? Punch it in below to instantly sync your audio to the host.
            </p>
            
            <form onSubmit={handleJoin} className="mt-auto w-full relative">
              <input 
                type="text" 
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-white/40 rounded-2xl pl-6 pr-16 py-4 text-zinc-200 font-bold tracking-[0.2em] text-center focus:outline-none focus:ring-1 focus:ring-white/40 transition-all placeholder:text-zinc-600 placeholder:tracking-normal placeholder:font-medium"
                placeholder="Enter 6-digit Code"
              />
              <button 
                type="submit"
                disabled={joinCode.length < 3}
                className="absolute right-2 top-2 bottom-2 w-12 flex items-center justify-center rounded-xl bg-white/10 text-zinc-300 hover:bg-zinc-200 hover:text-black disabled:opacity-50 disabled:hover:bg-white/10 disabled:hover:text-zinc-300 transition-all"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          </motion.div>

        </div>

        {/* Recent Sessions — live from DB */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-20 w-full max-w-4xl mx-auto"
        >
          <div className="flex items-center gap-2 mb-6 ml-2">
            <Clock className="w-4 h-4 text-zinc-500" />
            <h4 className="text-sm font-semibold tracking-widest text-zinc-500 uppercase">Recent Sessions</h4>
          </div>

          {recentRooms.length === 0 ? (
            <p className="text-zinc-600 text-sm font-medium text-center py-8">
              No sessions yet — host your first one above!
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {recentRooms.map((room) => (
                <div
                  key={room.id}
                  onClick={() => router.push(`/room/${room.id}`)}
                  className="glass-panel p-4 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 flex items-center justify-between cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                      {room.ended_at
                        ? <Disc className="w-5 h-5 text-zinc-600" />
                        : <Play className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                      }
                    </div>
                    <div>
                      <div className="text-sm font-bold text-zinc-300 font-mono tracking-widest">{room.id}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {!room.ended_at && (
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                        )}
                        <div className="text-xs text-zinc-600 font-medium">
                          {new Date(room.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="mt-10 w-full max-w-4xl mx-auto"
        >
          <div className="flex items-center justify-between gap-4 mb-6 ml-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-500">Devices</p>
              <h4 className="text-sm font-semibold tracking-widest text-zinc-500 uppercase mt-1">Your saved devices</h4>
            </div>
            <div className="text-sm text-zinc-500 font-medium">{devices.length} saved</div>
          </div>

          {devices.length === 0 ? (
            <p className="text-zinc-600 text-sm font-medium text-center py-8">No devices saved yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {devices.map((savedDevice) => {
                const isCurrent = currentDevice?.id === savedDevice.id;

                return (
                  <div
                    key={savedDevice.id}
                    className={`glass-panel p-4 rounded-2xl border bg-white/5 flex items-center justify-between transition-colors ${isCurrent ? "border-white/20" : "border-white/5 hover:bg-white/10"}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                        <DeviceGlyph userAgent={savedDevice.user_agent} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-zinc-200 truncate flex items-center gap-2">
                          {savedDevice.name}
                          {isCurrent && <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[10px] font-black uppercase tracking-widest">Current</span>}
                        </div>
                        <div className="text-xs text-zinc-600 font-medium truncate">{savedDevice.user_agent ?? "Unknown browser"}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

      </main>
    </div>
  );
}
