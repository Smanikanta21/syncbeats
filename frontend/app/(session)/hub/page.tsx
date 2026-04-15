"use client";

import { motion } from "framer-motion";
import { Disc, Play, Plus, Search, ArrowRight, Clock, Laptop, Smartphone, Edit3, MoreHorizontal, Trash2, QrCode, UserRoundCog, X, Copy, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { devicesApi, roomsApi, type Device } from "../../../lib/api";

interface RecentRoom { id: string; created_at: string; playback_state: string; ended_at: string | null; }

function getPlatformLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("android")) return "Android";
  if (ua.includes("mac")) return "Mac";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("linux")) return "Linux";
  return "Browser";
}

export default function HubPage() {
  const router = useRouter();
  const { device: currentDevice } = useAuth();
  const [joinCode,    setJoinCode]    = useState("");
  const [isHosting,   setIsHosting]   = useState(false);
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [roomMenu, setRoomMenu] = useState<{ room: RecentRoom; x: number; y: number } | null>(null);
  const [roomToEnd, setRoomToEnd] = useState<RecentRoom | null>(null);
  const [roomInfo, setRoomInfo] = useState<RecentRoom | null>(null);
  const [roomToTransfer, setRoomToTransfer] = useState<RecentRoom | null>(null);
  const [newHostEmail, setNewHostEmail] = useState("");
  const [isTransferringHost, setIsTransferringHost] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [showDeviceRename, setShowDeviceRename] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState("");
  const [isRenamingDevice, setIsRenamingDevice] = useState(false);

  function DeviceGlyph({ userAgent }: { userAgent: string | null }) {
    if (userAgent?.includes("iPhone") || userAgent?.includes("Android")) return <Smartphone className="w-4 h-4 text-zinc-300" />;
    return <Laptop className="w-4 h-4 text-zinc-300" />;
  }

  const roomLink = roomInfo && typeof window !== "undefined"
    ? `${window.location.origin}/room/${roomInfo.id}`
    : roomInfo
      ? `/room/${roomInfo.id}`
      : "";

  const qrSrc = roomLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(roomLink)}`
    : "";

  useEffect(() => {
    roomsApi.mine()
      .then(({ rooms }) => setRecentRooms(rooms as RecentRoom[]))
      .catch(() => {}); // not critical if it fails

    devicesApi.mine()
      .then(({ devices }) => setDevices(devices))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!roomMenu) return;

    const closeMenu = () => setRoomMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRoomMenu(null);
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [roomMenu]);

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

  const handleRoomContextMenu = (event: React.MouseEvent<HTMLDivElement>, room: RecentRoom) => {
    event.preventDefault();
    setRoomMenu({ room, x: event.clientX, y: event.clientY });
  };

  const handleConfirmEndSession = async () => {
    if (!roomToEnd) return;

    try {
      await roomsApi.endSession(roomToEnd.id);
      setRecentRooms(prev => prev.filter(room => room.id !== roomToEnd.id));
      setRoomToEnd(null);
    } catch {
      alert("Failed to end session. Please try again.");
    }
  };

  const handleCopyRoomLink = async () => {
    if (!roomLink) return;
    try {
      await navigator.clipboard.writeText(roomLink);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 1200);
    } catch {
      alert("Could not copy link.");
    }
  };

  const handleChangeHost = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!roomToTransfer || !newHostEmail.trim()) return;

    setIsTransferringHost(true);
    try {
      await roomsApi.changeHost(roomToTransfer.id, newHostEmail.trim());
      setRecentRooms(prev => prev.filter(room => room.id !== roomToTransfer.id));
      setRoomToTransfer(null);
      setNewHostEmail("");
    } catch {
      alert("Failed to change host. Make sure the email exists.");
    } finally {
      setIsTransferringHost(false);
    }
  };

  const openDeviceRename = (deviceId: string, currentName: string) => {
    setEditingDeviceId(deviceId);
    setEditingDeviceName(currentName);
    setShowDeviceRename(true);
  };

  const handleDeviceRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingDeviceId || !editingDeviceName.trim()) return;

    setIsRenamingDevice(true);
    try {
      await devicesApi.rename(editingDeviceId, editingDeviceName.trim());
      setDevices(prev => prev.map(d =>
        d.id === editingDeviceId ? { ...d, name: editingDeviceName.trim() } : d
      ));
      setShowDeviceRename(false);
      setEditingDeviceId(null);
    } catch {
      alert("Failed to rename device.");
    } finally {
      setIsRenamingDevice(false);
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
            What&apos;s the move?
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-zinc-500 text-lg font-medium tracking-wide"
          >
            Start a new session to broadcast audio, or join a friend&apos;s room.
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
              Create a massive synchronized room. You&apos;ll control the playlist, volume, and playback.
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
                  onContextMenu={(event) => handleRoomContextMenu(event, room)}
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setRoomMenu({ room, x: event.clientX, y: event.clientY });
                      }}
                      className="md:hidden h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4 mx-auto" />
                    </button>
                    <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                  </div>
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
                        <div className="text-sm font-bold text-zinc-200 w-[75%] truncate flex items-center gap-2">
                          {savedDevice.name}
                          {isCurrent && <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[10px] font-black uppercase tracking-widest">Current</span>}
                        </div>
                        <div className="text-xs text-zinc-600 font-medium truncate">{getPlatformLabel(savedDevice.user_agent)}</div>
                      </div>
                      <button
                      onClick={() => openDeviceRename(savedDevice.id, savedDevice.name)}
                      className="h-10 w-12 rounded-lg border border-white/10 bg-white/5 text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-colors"
                    >
                      <Edit3 className="w-4 h-4 mx-auto" />
                    </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {roomMenu && (
          <div
            className="fixed z-[80] min-w-[220px] rounded-2xl border border-white/10 bg-zinc-950/95 p-2 shadow-2xl"
            style={{ left: roomMenu.x, top: roomMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => {
                setRoomToEnd(roomMenu.room);
                setRoomMenu(null);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-zinc-200 hover:bg-white/10 text-sm font-medium flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              End session
            </button>
            <button
              onClick={() => {
                setRoomInfo(roomMenu.room);
                setRoomMenu(null);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-zinc-200 hover:bg-white/10 text-sm font-medium flex items-center gap-2"
            >
              <QrCode className="w-4 h-4 text-zinc-300" />
              Room info + QR
            </button>
            <button
              onClick={() => {
                setRoomToTransfer(roomMenu.room);
                setRoomMenu(null);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-zinc-200 hover:bg-white/10 text-sm font-medium flex items-center gap-2"
            >
              <UserRoundCog className="w-4 h-4 text-zinc-300" />
              Change host
            </button>
          </div>
        )}

        {roomToEnd && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 backdrop-blur-xl px-4">
            <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-zinc-100">End Session?</h2>
                <button onClick={() => setRoomToEnd(null)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-zinc-400 text-sm mb-6">
                Do you really want to end session <span className="font-mono text-zinc-200">{roomToEnd.id}</span>?
              </p>
              <div className="flex items-center gap-3">
                <button onClick={() => setRoomToEnd(null)} className="h-11 flex-1 rounded-2xl border border-white/10 bg-white/5 text-zinc-200 font-semibold">No</button>
                <button onClick={handleConfirmEndSession} className="h-11 flex-1 rounded-2xl bg-red-500 text-white font-semibold">Yes, end</button>
              </div>
            </div>
          </div>
        )}

        {roomInfo && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 backdrop-blur-xl px-4">
            <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-zinc-100">Room Info</h2>
                <button onClick={() => setRoomInfo(null)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white p-4 w-fit mx-auto mb-5">
                <img src={qrSrc} alt={`QR code for room ${roomInfo.id}`} className="w-56 h-56" />
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Room Code</p>
                  <p className="font-mono text-zinc-100 tracking-widest">{roomInfo.id}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Room Link</p>
                  <p className="text-zinc-300 text-sm break-all">{roomLink}</p>
                </div>
                <button
                  onClick={handleCopyRoomLink}
                  className="w-full h-11 rounded-2xl border border-white/10 bg-white/5 text-zinc-100 font-semibold flex items-center justify-center gap-2"
                >
                  {copyDone ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  {copyDone ? "Copied" : "Copy Link"}
                </button>
              </div>
            </div>
          </div>
        )}

        {roomToTransfer && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 backdrop-blur-xl px-4">
            <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-zinc-100">Change Host</h2>
                <button onClick={() => setRoomToTransfer(null)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              <p className="text-zinc-400 text-sm mb-4">
                Enter the email of the user who should become host for <span className="font-mono text-zinc-200">{roomToTransfer.id}</span>.
              </p>

              <form className="space-y-4" onSubmit={handleChangeHost}>
                <input
                  type="email"
                  value={newHostEmail}
                  onChange={(event) => setNewHostEmail(event.target.value)}
                  placeholder="new-host@example.com"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-white/30"
                />
                <button
                  disabled={isTransferringHost || !newHostEmail.trim()}
                  className="h-11 w-full rounded-2xl bg-zinc-100 text-black font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isTransferringHost ? "Changing..." : "Transfer Host"}
                </button>
              </form>
            </div>
          </div>
        )}

        {showDeviceRename && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 backdrop-blur-xl px-4">
            <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-zinc-100">Rename Device</h2>
                <button onClick={() => setShowDeviceRename(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <form className="space-y-4" onSubmit={handleDeviceRename}>
                <input
                  autoFocus
                  type="text"
                  value={editingDeviceName}
                  onChange={(event) => setEditingDeviceName(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-white/30"
                  placeholder="My Device"
                />
                <button
                  disabled={isRenamingDevice || !editingDeviceName.trim()}
                  className="h-11 w-full rounded-2xl bg-zinc-100 text-black font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isRenamingDevice ? "Saving..." : "Save Device Name"}
                </button>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
