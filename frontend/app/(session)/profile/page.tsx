"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Headphones, LogOut, Edit3, Shield, Activity, Music, Laptop, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { devicesApi, type Device } from "../../../lib/api";

function DeviceGlyph({ userAgent }: { userAgent: string | null }) {
  if (userAgent?.includes("iPhone") || userAgent?.includes("Android")) return <Smartphone className="w-4 h-4 text-zinc-300" />;
  return <Laptop className="w-4 h-4 text-zinc-300" />;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, device, logout } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);

  const displayName = user?.name ?? "—";
  const displayEmail = user?.email ?? "—";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const accountId = user ? `#SB-${user.id.slice(0, 4).toUpperCase()}` : "—";
  const memberSince = user ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—";

  useEffect(() => {
    devicesApi.mine()
      .then(({ devices }) => setDevices(devices))
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex flex-col relative px-4 sm:px-6 lg:px-8 overflow-hidden z-0 pb-20">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[400px] bg-white/[0.015] blur-[150px] rounded-full pointer-events-none -z-10" />

      <main className="w-full max-w-5xl mx-auto flex-1 flex flex-col mt-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[220px]">

          {/* 1. Main Profile Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="md:col-span-2 md:row-span-2 glass-panel rounded-[2.5rem] border border-white/5 bg-black/60 shadow-[0_20px_40px_rgba(0,0,0,0.4)] relative overflow-hidden group flex flex-col p-10"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[60px] rounded-full pointer-events-none group-hover:bg-white/10 transition-colors duration-1000" />

            <div className="flex justify-between items-start w-full relative z-10">
              <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-600 flex items-center justify-center border-4 border-black shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                <span className="text-4xl font-black text-white tracking-widest">{initials}</span>
              </div>
              <button className="h-10 px-6 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold flex items-center gap-2 transition-all">
                <Edit3 className="w-4 h-4" /> Edit Profile
              </button>
            </div>

            <div className="mt-auto relative z-10">
              <h1 className="text-5xl font-black text-zinc-200 mb-2 tracking-tight">{displayName}</h1>
              <p className="text-zinc-500 font-medium text-xl mb-6">{displayEmail}</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mb-1">Member Since</p>
                  <p className="text-zinc-300 font-medium">{memberSince}</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mb-1">Account ID</p>
                  <p className="text-zinc-300 font-mono text-sm">{accountId}</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 2. Subscription */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}
            className="md:col-span-1 md:row-span-1 glass-panel rounded-[2.5rem] border border-white/5 bg-black/60 shadow-xl flex flex-col p-8 relative overflow-hidden group hover:border-white/10 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center"><Shield className="w-5 h-5 text-zinc-300" /></div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-green-400 font-bold tracking-widest uppercase">Active</span>
              </div>
            </div>
            <div className="mt-auto">
              <h3 className="text-2xl font-black text-zinc-200 mb-1">Beta Plan</h3>
              <p className="text-zinc-500 text-sm font-medium">Free during early access</p>
            </div>
          </motion.div>

          {/* 3. Audio */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
            className="md:col-span-1 md:row-span-1 glass-panel rounded-[2.5rem] border border-white/5 bg-black/60 shadow-xl flex flex-col p-8 relative overflow-hidden group hover:border-white/10 transition-colors cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-4"><Headphones className="w-5 h-5 text-zinc-300" /></div>
            <div className="mt-auto">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xl font-bold text-zinc-200">Hi-Fi Audio</h3>
                <div className="w-8 h-4 bg-zinc-700 rounded-full relative">
                  <div className="absolute right-1 top-1 bottom-1 w-2 bg-white rounded-full" />
                </div>
              </div>
              <p className="text-zinc-500 text-sm font-medium">Streams locally uncompressed</p>
            </div>
          </motion.div>

          {/* 4. Stats */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }}
            className="md:col-span-1 md:row-span-1 glass-panel rounded-[2.5rem] border border-white/5 bg-black/60 shadow-xl flex flex-col p-8 relative overflow-hidden group hover:border-white/10 transition-colors">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-4"><Activity className="w-5 h-5 text-zinc-300" /></div>
            <div className="mt-auto flex items-end gap-2">
              <h3 className="text-5xl font-black text-zinc-200 leading-none">0</h3>
              <p className="text-zinc-500 text-sm font-medium pb-1 leading-tight">Sessions<br />Hosted</p>
            </div>
          </motion.div>

          {/* 5. Integrations */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
            className="md:col-span-1 md:row-span-1 glass-panel rounded-[2.5rem] border border-white/5 bg-black/60 shadow-xl flex flex-col p-8 relative overflow-hidden group hover:border-white/10 transition-colors cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-4"><Music className="w-5 h-5 text-zinc-300" /></div>
            <div className="mt-auto">
              <h3 className="text-xl font-bold text-zinc-200 mb-1">Link Spotify</h3>
              <p className="text-zinc-500 text-sm font-medium">Import playlists directly</p>
            </div>
          </motion.div>

          {/* 6. Log Out */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 }}
            onClick={handleLogout}
            className="md:col-span-1 md:row-span-1 glass-panel rounded-[2.5rem] border border-white/5 bg-black/60 shadow-xl flex flex-col p-8 relative overflow-hidden group hover:border-red-500/30 hover:bg-red-500/5 transition-all cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-4 group-hover:bg-red-500/20 transition-colors">
              <LogOut className="w-5 h-5 text-red-500" />
            </div>
            <div className="mt-auto">
              <h3 className="text-xl font-bold text-red-500 mb-1">Log Out</h3>
              <p className="text-zinc-500 text-sm font-medium">Clear session &amp; return to login</p>
            </div>
          </motion.div>

          {/* 7. Devices */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}
            className="md:col-span-3 glass-panel rounded-[2.5rem] border border-white/5 bg-black/60 shadow-xl p-8 relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-500">Account Devices</p>
                <h3 className="text-2xl font-black text-zinc-100 mt-1">Your devices</h3>
              </div>
              <div className="text-sm text-zinc-500 font-medium">{devices.length} saved</div>
            </div>

            {devices.length === 0 ? (
              <p className="text-zinc-600 text-sm font-medium">No devices saved yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {devices.map((savedDevice) => {
                  const isCurrent = device?.id === savedDevice.id;
                  return (
                    <div
                      key={savedDevice.id}
                      className={`rounded-3xl border p-4 transition-colors ${isCurrent ? "border-white/20 bg-white/8" : "border-white/5 bg-white/[0.03]"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-center shrink-0">
                            <DeviceGlyph userAgent={savedDevice.user_agent} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-zinc-100 truncate">{savedDevice.name}</h4>
                              {isCurrent && <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[10px] font-black uppercase tracking-widest">Current</span>}
                            </div>
                            <p className="text-xs text-zinc-500 mt-1 truncate">{savedDevice.user_agent ?? "Unknown browser"}</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                        <span>Last seen {new Date(savedDevice.last_seen_at).toLocaleDateString()}</span>
                        <span>{savedDevice.device_key.slice(0, 8).toUpperCase()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

        </div>
      </main>
    </div>
  );
}
