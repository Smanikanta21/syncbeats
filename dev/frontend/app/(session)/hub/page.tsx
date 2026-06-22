"use client";

import { motion } from "framer-motion";
import { Disc, Play, Plus, Search, ArrowRight, Clock, Laptop, Smartphone, Edit3, MoreHorizontal, Trash2, QrCode, UserRoundCog, X, Copy, Check, ScanLine, Camera, LogOut, Radio } from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Magnetic from "../../../components/Magnetic";
import { useAuth } from "../../../context/AuthContext";
import { devicesApi, roomsApi, type Device } from "../../../lib/api";

interface RecentRoom { id: string; created_at: string; playback_state: string; ended_at: string | null; host_id: string; participant_count?: number; }

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
  const { user, device: currentDevice } = useAuth();
  const [joinCode, setJoinCode] = useState("");
  const [isHosting, setIsHosting] = useState(false);
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [roomMenu, setRoomMenu] = useState<{ room: RecentRoom; x: number; y: number } | null>(null);
  const [deviceMenu, setDeviceMenu] = useState<{ device: Device; x: number; y: number } | null>(null);
  const [roomToEnd, setRoomToEnd] = useState<RecentRoom | null>(null);
  const [roomInfo, setRoomInfo] = useState<RecentRoom | null>(null);
  const [roomToTransfer, setRoomToTransfer] = useState<RecentRoom | null>(null);
  const [newHostEmail, setNewHostEmail] = useState("");
  const [isTransferringHost, setIsTransferringHost] = useState(false);
  const [showDeviceRename, setShowDeviceRename] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState("");
  const [isRenamingDevice, setIsRenamingDevice] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "starting" | "scanning" | "success" | "error">("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const scanSuccessRef = useRef(false);
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setTheme(localStorage.getItem('theme'));
    }
  }, []);

  function DeviceGlyph({ userAgent }: { userAgent: string | null }) {
    if (userAgent?.includes("iPhone") || userAgent?.includes("Android")) return <Smartphone className="w-4 h-4 text-foreground/70" />;
    return <Laptop className="w-4 h-4 text-foreground/70" />;
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
      .catch(() => { }); // not critical if it fails

    devicesApi.mine()
      .then(({ devices }) => setDevices(devices))
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (!roomMenu && !deviceMenu) return;

    const closeMenu = () => { setRoomMenu(null); setDeviceMenu(null); };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setRoomMenu(null); setDeviceMenu(null); };
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [roomMenu, deviceMenu]);

  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) {
        window.clearInterval(scanIntervalRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []);

  const parseRoomIdFromScan = (payload: string): string | null => {
    const value = payload.trim();
    if (!value) return null;

    const directMatch = value.match(/^([a-zA-Z0-9_-]{4,20})$/);
    if (directMatch) return directMatch[1].toUpperCase();

    const roomMatch = value.match(/\/room\/([a-zA-Z0-9_-]{4,20})/);
    if (roomMatch) {
      return roomMatch[1].toUpperCase();
    }

    return null;
  };

  const stopScanner = useCallback(() => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setShowScanner(false);
  }, []);

  const openScannerModal = () => {
    setShowScanner(true);
    setScanStatus("idle");
    setScanError(null);
    scanSuccessRef.current = false;
  };

  const startScanner = async () => {
    setScanStatus("starting");
    setScanError(null);
    scanSuccessRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });

      mediaStreamRef.current = stream;
      if (!videoRef.current) throw new Error("Could not initialize camera preview.");

      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanStatus("scanning");

      // Try native BarcodeDetector first, fall back to jsQR
      const BarcodeDetectorCtor = (window as Window & { BarcodeDetector?: new (opts?: { formats?: string[] }) => { detect: (input: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
      const nativeDetector = BarcodeDetectorCtor ? new BarcodeDetectorCtor({ formats: ["qr_code"] }) : null;

      let jsQRFallback: any = null;

      // Create a hidden canvas for frame extraction (needed for jsQR fallback)
      if (!nativeDetector && !canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }

      let active = true;
      let lastScanTime = 0;

      const scanLoop = async (now: number) => {
        if (!active || scanSuccessRef.current || !mediaStreamRef.current) return;

        if (videoRef.current && videoRef.current.readyState >= videoRef.current.HAVE_ENOUGH_DATA) {
          // Native detector is hardware-accelerated, we can run it every frame (0ms throttle).
          // For jsQR CPU fallback, throttle to 80ms to prevent lag and CPU overload.
          const scanInterval = nativeDetector ? 0 : 80;
          if (now - lastScanTime >= scanInterval) {
            lastScanTime = now;
            let rawValue = "";

            try {
              if (nativeDetector) {
                const codes = await nativeDetector.detect(videoRef.current);
                if (codes.length) rawValue = codes[0].rawValue ?? "";
              } else {
                if (!jsQRFallback) {
                  jsQRFallback = (await import("jsqr")).default;
                }
                const video = videoRef.current;
                const canvas = canvasRef.current!;
                // Downscale image dimension to max 480px to speed up jsQR analysis by 10-20x
                const scale = Math.min(1, 480 / video.videoWidth);
                canvas.width = video.videoWidth * scale;
                canvas.height = video.videoHeight * scale;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  const result = jsQRFallback(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
                  if (result) rawValue = result.data;
                }
              }
            } catch {
              // Keep scanning on transient errors.
            }

            if (rawValue) {
              const parsedRoomId = parseRoomIdFromScan(rawValue);
              if (parsedRoomId) {
                scanSuccessRef.current = true;
                setScanStatus("success");
                active = false;

                // Vibrate on successful scan if API is supported
                if (typeof navigator !== "undefined" && navigator.vibrate) {
                  try {
                    navigator.vibrate([100, 50, 100]); // Short double vibration
                  } catch {
                    // Ignore vibration errors if blocked by browser context
                  }
                }

                // Smooth delay to let the user see the green border & feedback
                setTimeout(() => {
                  stopScanner();
                  router.push(`/room/${parsedRoomId}`);
                }, 800);
                return;
              }
            }
          }
        }

        if (active && mediaStreamRef.current && !scanSuccessRef.current) {
          requestAnimationFrame(scanLoop);
        }
      };

      requestAnimationFrame(scanLoop);

    } catch (err) {
      setScanStatus("error");
      const message = (err as Error).message || "Unable to access camera.";
      if (message.toLowerCase().includes("permission") || message.toLowerCase().includes("denied") || message.toLowerCase().includes("notallowed")) {
        setScanError("Camera permission denied. Please allow camera access and try again.");
      } else {
        setScanError(message);
      }
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length > 3) {
      window.open(`/room/${joinCode.trim().toUpperCase()}`, '_blank');
    }
  };

  const handleHost = async () => {
    setIsHosting(true);
    try {
      const data = await roomsApi.create();
      window.open(`/room/${data.roomId}`, '_blank');
    } catch {
      // Fallback to client-side ID if server unreachable
      const randomId = Math.floor(100000 + Math.random() * 900000).toString();
      window.open(`/room/${randomId}`, '_blank');
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
      toast.error("Failed to end session. Please try again.");
    }
  };

  const handleCopyRoomLink = async () => {
    if (!roomLink) return;
    try {
      await navigator.clipboard.writeText(roomLink);
      toast.success("Room link copied to clipboard!");
    } catch {
      toast.error("Could not copy link.");
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
      toast.error("Failed to change host. Make sure the email exists.");
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
      toast.error("Failed to rename device.");
    } finally {
      setIsRenamingDevice(false);
    }
  };

  return (
    <div className="min-h-screen relative px-4 sm:px-6 lg:px-8 z-0 bg-transparent text-foreground transition-colors duration-300">
      {/* Main Hub Content */}
      <main className="w-full max-w-4xl mx-auto pb-20 pt-4">

        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-black mb-4 text-foreground animate-fade-in-up">
            What&apos;s the move?
          </h1>
          <p className="text-foreground/60 text-lg font-medium tracking-wide animate-fade-in-up-delay">
            Start a new session to broadcast audio, or join a friend&apos;s room.
          </p>
        </div>

        {/* The Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl mx-auto relative z-10">

          {/* HOST CARD */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="glass-panel p-8 rounded-[2.5rem] shadow-xl transition-all group flex flex-col items-center text-center relative overflow-hidden"
          >
            <div className="w-20 h-20 rounded-3xl bg-foreground/5 border border-foreground/10 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-foreground/10 transition-all duration-300">
              <Plus className="w-10 h-10 text-foreground" />
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-3">Host a Session</h2>
            <p className="text-foreground/60 mb-8 max-w-xs mx-auto text-sm leading-relaxed">
              Create a massive synchronized room. You&apos;ll control the playlist, volume, and playback.
            </p>

            <Magnetic className="w-full mt-auto">
              <button
                onClick={handleHost}
                disabled={isHosting}
                className="w-full h-14 rounded-2xl bg-foreground text-background font-black text-lg hover:scale-[1.02] active:scale-95 transition-all shadow-lg disabled:opacity-60"
              >
                {isHosting ? "Creating Room…" : "Start Session"}
              </button>
            </Magnetic>
          </motion.div>

          {/* JOIN CARD */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="glass-panel p-8 rounded-[2.5rem] shadow-xl transition-all group flex flex-col items-center text-center relative overflow-hidden"
          >
            <div className="w-20 h-20 rounded-3xl bg-foreground/5 border border-foreground/10 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-foreground/10 transition-all duration-300">
              <Search className="w-10 h-10 text-foreground" />
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-3">Join a Session</h2>
            <p className="text-foreground/60 mb-8 max-w-xs mx-auto text-sm leading-relaxed">
              Already have a code? Punch it in below to instantly sync your audio to the host.
            </p>

            <form onSubmit={handleJoin} className="mt-auto w-full relative">
              <input
                type="text"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full bg-foreground/5 border border-foreground/10 hover:border-foreground/20 focus:border-foreground/30 focus:ring-1 focus:ring-foreground/30 rounded-2xl pl-6 pr-16 py-4 text-foreground font-bold tracking-[0.2em] text-center focus:outline-none transition-all placeholder:text-foreground/40 placeholder:tracking-normal placeholder:font-medium"
                placeholder="Enter 6-digit Code"
              />
              <button
                type="submit"
                disabled={joinCode.length < 3}
                aria-label="Join Room"
                className="absolute right-2 top-2 bottom-2 w-12 flex items-center justify-center rounded-xl bg-foreground/10 text-foreground hover:bg-foreground hover:text-background disabled:opacity-30 transition-all"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>

            <button
              type="button"
              onClick={openScannerModal}
              className="mt-3 w-full md:hidden h-12 rounded-2xl border border-foreground/10 bg-foreground/5 text-foreground font-semibold hover:bg-foreground/10 transition-all flex items-center justify-center gap-2"
            >
              <ScanLine className="w-4 h-4" />
              Scan QR from Phone
            </button>
          </motion.div>

        </div>

        {/* Recent Sessions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-20 w-full max-w-4xl mx-auto"
        >
          <div className="flex items-center gap-2 mb-6 ml-2">
            <Clock className="w-4 h-4 text-foreground/60" />
            <h2 className="text-sm font-semibold tracking-widest text-foreground/60 uppercase">Recent Sessions</h2>
          </div>

          {recentRooms.length === 0 ? (
            <p className="text-foreground/40 text-sm font-medium text-center py-8">
              No sessions yet — host your first one above!
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {recentRooms.map((room) => (
                <div
                  key={room.id}
                  onClick={() => window.open(`/room/${room.id}`, '_blank')}
                  onContextMenu={(event) => handleRoomContextMenu(event, room)}
                  className="glass-panel p-4 rounded-2xl border border-foreground/5 bg-foreground/5 hover:bg-foreground/10 flex items-center justify-between cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center">
                      {room.ended_at
                        ? <Disc className="w-5 h-5 text-foreground/40" />
                        : <Play className="w-4 h-4 text-foreground/60 group-hover:text-foreground transition-colors" />
                      }
                    </div>
                    <div>
                      <div className="text-sm font-bold text-foreground/70 font-mono tracking-widest">{room.id}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {!room.ended_at && (
                          <span className={`w-1.5 h-1.5 rounded-full ${!room.participant_count ? 'bg-red-400' : (room.playback_state === 'playing' ? 'bg-green-400 animate-pulse' : 'bg-green-400')} inline-block`} title={!room.participant_count ? 'Empty' : (room.playback_state === 'playing' ? 'Playing' : 'Paused')} />
                        )}
                        <div className="text-xs text-foreground/40 font-medium">
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
                      className="md:hidden h-8 w-8 rounded-lg border border-foreground/10 bg-foreground/5 text-foreground/60 hover:text-foreground hover:bg-foreground/10 transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4 mx-auto" />
                    </button>
                    <ArrowRight className="w-4 h-4 text-foreground/40 group-hover:text-foreground/60 transition-colors" />
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
          className="mt-10 w-full max-w-5xl mx-auto"
        >
          <div className="flex items-center justify-between gap-4 mb-6 ml-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-foreground/60">Devices</p>
              <h2 className="text-sm font-semibold tracking-widest text-foreground/60 uppercase mt-1">Your saved devices</h2>
            </div>
            <div className="text-sm text-foreground/60 font-medium">{devices.length} saved</div>
          </div>

          {devices.length === 0 ? (
            <p className="text-foreground/40 text-sm font-medium text-center py-8">No devices saved yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {devices.map((savedDevice) => {
                const isCurrent = currentDevice?.id === savedDevice.id;
                const isOffline = !isCurrent && (new Date().getTime() - new Date(savedDevice.last_seen_at).getTime() > 5 * 60 * 1000);

                return (
                  <div
                    key={savedDevice.id}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setDeviceMenu({ device: savedDevice, x: event.clientX, y: event.clientY });
                    }}
                    className={`glass-panel p-4 rounded-2xl border bg-foreground/5 flex items-center justify-between gap-3 transition-colors ${isCurrent ? "border-foreground/20" : "border-foreground/5 hover:bg-foreground/10"}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
                        <DeviceGlyph userAgent={savedDevice.user_agent} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0 mb-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOffline ? 'bg-red-400' : 'bg-green-400 animate-pulse'}`} title={isOffline ? 'Offline' : 'Online'} />
                          <span className="text-sm font-bold text-foreground truncate block" title={savedDevice.name}>
                            {savedDevice.name}
                          </span>
                          {isCurrent && <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[10px] font-black uppercase tracking-widest shrink-0">Current</span>}
                        </div>
                        <div className="text-xs text-foreground/40 font-medium truncate">{getPlatformLabel(savedDevice.user_agent)}</div>
                      </div>
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeviceMenu({ device: savedDevice, x: event.clientX, y: event.clientY });
                      }}
                      className="h-10 w-12 shrink-0 rounded-lg border border-foreground/10 bg-foreground/5 text-foreground/60 hover:text-foreground hover:bg-foreground/10 transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4 mx-auto" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {roomMenu && (
          <>
            {/* Mobile Bottom Sheet Menu */}
            <div className="md:hidden fixed inset-0 z-[80] bg-background/45 backdrop-blur-sm flex items-end" onClick={() => setRoomMenu(null)}>
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="w-full rounded-t-[2.5rem] border-t border-foreground/10 bg-background/95 p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] flex flex-col gap-4 shadow-[0_-20px_50px_rgba(0,0,0,0.3)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-12 h-1.5 rounded-full bg-foreground/20 mx-auto mb-2" />
                <h2 className="text-lg font-black text-foreground text-center mb-1">Room Settings</h2>
                <p className="text-xs text-foreground/40 font-mono text-center tracking-widest uppercase mb-2">Room: {roomMenu.room.id}</p>
                
                <div className="flex flex-col gap-2.5">
                  {roomMenu.room.host_id === user?.id && (
                    <button
                      onClick={() => {
                        setRoomToEnd(roomMenu.room);
                        setRoomMenu(null);
                      }}
                      className="w-full text-left px-4 py-3.5 rounded-2xl text-foreground hover:bg-foreground/5 text-base font-bold flex items-center gap-3 border border-foreground/5 bg-foreground/2 active:scale-[0.99] transition-all"
                    >
                      <Trash2 className="w-5 h-5 text-red-400" />
                      End session
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setRoomInfo(roomMenu.room);
                      setRoomMenu(null);
                    }}
                    className="w-full text-left px-4 py-3.5 rounded-2xl text-foreground hover:bg-foreground/5 text-base font-bold flex items-center gap-3 border border-foreground/5 bg-foreground/2 active:scale-[0.99] transition-all"
                  >
                    <QrCode className="w-5 h-5 text-foreground/70" />
                    Room info + QR
                  </button>
                  {roomMenu.room.host_id === user?.id && (
                    <button
                      onClick={() => {
                        setRoomToTransfer(roomMenu.room);
                        setRoomMenu(null);
                      }}
                      className="w-full text-left px-4 py-3.5 rounded-2xl text-foreground hover:bg-foreground/5 text-base font-bold flex items-center gap-3 border border-foreground/5 bg-foreground/2 active:scale-[0.99] transition-all"
                    >
                      <UserRoundCog className="w-5 h-5 text-foreground/70" />
                      Change host
                    </button>
                  )}
                </div>
                
                <button
                  onClick={() => setRoomMenu(null)}
                  className="mt-2 w-full h-12 rounded-2xl border border-foreground/10 bg-foreground/5 hover:bg-foreground/10 text-foreground font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
              </motion.div>
            </div>

            {/* Desktop Context Menu */}
            <div
              className="hidden md:block fixed z-[80] min-w-55 rounded-2xl border border-foreground/10 bg-background/95 p-2 shadow-2xl"
              style={{
                left: Math.min(roomMenu.x, typeof window !== "undefined" ? window.innerWidth - 200 : roomMenu.x),
                top: Math.min(roomMenu.y, typeof window !== "undefined" ? window.innerHeight - 160 : roomMenu.y),
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {roomMenu.room.host_id === user?.id && (
                <button
                  onClick={() => {
                    setRoomToEnd(roomMenu.room);
                    setRoomMenu(null);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-foreground hover:bg-foreground/10 text-sm font-medium flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                  End session
                </button>
              )}
              <button
                onClick={() => {
                  setRoomInfo(roomMenu.room);
                  setRoomMenu(null);
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-foreground hover:bg-foreground/10 text-sm font-medium flex items-center gap-2"
              >
                <QrCode className="w-4 h-4 text-foreground/70" />
                Room info + QR
              </button>
              {roomMenu.room.host_id === user?.id && (
                <button
                  onClick={() => {
                    setRoomToTransfer(roomMenu.room);
                    setRoomMenu(null);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-foreground hover:bg-foreground/10 text-sm font-medium flex items-center gap-2"
                >
                  <UserRoundCog className="w-4 h-4 text-foreground/70" />
                  Change host
                </button>
              )}
            </div>
          </>
        )}

        {deviceMenu && (
          <>
            {/* Mobile Bottom Sheet Menu */}
            <div className="md:hidden fixed inset-0 z-[80] bg-background/45 backdrop-blur-sm flex items-end" onClick={() => setDeviceMenu(null)}>
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="w-full rounded-t-[2.5rem] border-t border-foreground/10 bg-background/95 p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] flex flex-col gap-4 shadow-[0_-20px_50px_rgba(0,0,0,0.3)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-12 h-1.5 rounded-full bg-foreground/20 mx-auto mb-2" />
                <h2 className="text-lg font-black text-foreground text-center mb-1">Device Settings</h2>
                <p className="text-xs text-foreground/40 font-mono text-center tracking-widest uppercase mb-2">Device: {deviceMenu.device.name}</p>
                
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => {
                      openDeviceRename(deviceMenu.device.id, deviceMenu.device.name);
                      setDeviceMenu(null);
                    }}
                    className="w-full text-left px-4 py-3.5 rounded-2xl text-foreground hover:bg-foreground/5 text-base font-bold flex items-center gap-3 border border-foreground/5 bg-foreground/2 active:scale-[0.99] transition-all"
                  >
                    <Edit3 className="w-5 h-5 text-foreground/70" />
                    Rename this device
                  </button>
                  <button
                    onClick={() => {
                      toast.success("Ping sent to device!");
                      setDeviceMenu(null);
                    }}
                    className="w-full text-left px-4 py-3.5 rounded-2xl text-foreground hover:bg-foreground/5 text-base font-bold flex items-center gap-3 border border-foreground/5 bg-foreground/2 active:scale-[0.99] transition-all"
                  >
                    <Radio className="w-5 h-5 text-foreground/70" />
                    Ping this device
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await devicesApi.remove(deviceMenu.device.id);
                        const { devices: updatedDevices } = await devicesApi.mine();
                        setDevices(updatedDevices);
                      } catch {
                        toast.error("Failed to logout device");
                      }
                      setDeviceMenu(null);
                    }}
                    className="w-full text-left px-4 py-3.5 rounded-2xl text-foreground hover:bg-foreground/5 text-base font-bold flex items-center gap-3 border border-foreground/5 bg-foreground/2 active:scale-[0.99] transition-all"
                  >
                    <LogOut className="w-5 h-5 text-red-400" />
                    Logout this device
                  </button>
                </div>
                <button
                  onClick={() => setDeviceMenu(null)}
                  className="mt-2 w-full h-12 rounded-2xl border border-foreground/10 bg-foreground/5 hover:bg-foreground/10 text-foreground font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
              </motion.div>
            </div>

            {/* Desktop Context Menu */}
            <div
              className="hidden md:block fixed z-[80] min-w-55 rounded-2xl border border-foreground/10 bg-background/95 p-2 shadow-2xl"
              style={{
                left: Math.min(deviceMenu.x, typeof window !== "undefined" ? window.innerWidth - 240 : deviceMenu.x),
                top: Math.min(deviceMenu.y, typeof window !== "undefined" ? window.innerHeight - 160 : deviceMenu.y),
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                onClick={() => {
                  openDeviceRename(deviceMenu.device.id, deviceMenu.device.name);
                  setDeviceMenu(null);
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-foreground hover:bg-foreground/10 text-sm font-medium flex items-center gap-2"
              >
                <Edit3 className="w-4 h-4 text-foreground/70" />
                Rename this device
              </button>
              <button
                onClick={() => {
                  toast.success("Ping sent to device!");
                  setDeviceMenu(null);
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-foreground hover:bg-foreground/10 text-sm font-medium flex items-center gap-2"
              >
                <Radio className="w-4 h-4 text-foreground/70" />
                Ping this device
              </button>
              <button
                onClick={async () => {
                  try {
                    await devicesApi.remove(deviceMenu.device.id);
                    const { devices: updatedDevices } = await devicesApi.mine();
                    setDevices(updatedDevices);
                  } catch {
                    toast.error("Failed to logout device");
                  }
                  setDeviceMenu(null);
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-foreground hover:bg-foreground/10 text-sm font-medium flex items-center gap-2"
              >
                <LogOut className="w-4 h-4 text-red-400" />
                Logout this device
              </button>
            </div>
          </>
        )}

        {roomToEnd && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-background/70 backdrop-blur-xl px-4">
            <div className="w-full max-w-md rounded-4xl border border-foreground/10 bg-background p-6 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-foreground">End Session?</h2>
                <button onClick={() => setRoomToEnd(null)} aria-label="Close" className="text-foreground/60 hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-foreground/60 text-sm mb-6">
                Do you really want to end session <span className="font-mono text-foreground">{roomToEnd.id}</span>?
              </p>
              <div className="flex items-center gap-3">
                <button onClick={() => setRoomToEnd(null)} className="h-11 flex-1 rounded-2xl border border-foreground/10 bg-foreground/5 text-foreground font-semibold">No</button>
                <button onClick={handleConfirmEndSession} className="h-11 flex-1 rounded-2xl bg-red-500 text-white font-semibold">Yes, end</button>
              </div>
            </div>
          </div>
        )}

        {roomInfo && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-background/70 backdrop-blur-xl px-4">
            <div className="w-full max-w-md rounded-4xl border border-foreground/10 bg-background p-6 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-foreground">Room Info</h2>
                <button onClick={() => setRoomInfo(null)} aria-label="Close" className="text-foreground/60 hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>

              <div className="rounded-2xl border border-foreground/10 bg-background p-4 w-fit mx-auto mb-5">
                <Image src={qrSrc} alt={`QR code for room ${roomInfo.id}`} width={224} height={224} className="w-56 h-56" unoptimized />
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-foreground/10 bg-foreground/5 p-3">
                  <p className="text-xs text-foreground/60 uppercase tracking-widest mb-1">Room Code</p>
                  <p className="font-mono text-foreground tracking-widest">{roomInfo.id}</p>
                </div>
                <div className="rounded-xl border border-foreground/10 bg-foreground/5 p-3">
                  <p className="text-xs text-foreground/60 uppercase tracking-widest mb-1">Room Link</p>
                  <p className="text-foreground/70 text-sm break-all">{roomLink}</p>
                </div>
                <button
                  onClick={handleCopyRoomLink}
                  className="w-full h-11 rounded-2xl border border-foreground/10 bg-foreground/5 text-foreground font-semibold flex items-center justify-center gap-2 hover:bg-foreground/10 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy Link
                </button>
              </div>
            </div>
          </div>
        )}

        {roomToTransfer && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-background/70 backdrop-blur-xl px-4">
            <div className="w-full max-w-md rounded-4xl border border-foreground/10 bg-background p-6 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-foreground">Change Host</h2>
                <button onClick={() => setRoomToTransfer(null)} aria-label="Close" className="text-foreground/60 hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>

              <p className="text-foreground/60 text-sm mb-4">
                Enter the email of the user who should become host for <span className="font-mono text-foreground">{roomToTransfer.id}</span>.
              </p>

              <form className="space-y-4" onSubmit={handleChangeHost}>
                <input
                  type="email"
                  value={newHostEmail}
                  onChange={(event) => setNewHostEmail(event.target.value)}
                  placeholder="new-host@example.com"
                  className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-foreground outline-none transition-all placeholder:text-foreground/40 focus:border-foreground/30 focus:ring-1 focus:ring-foreground/30"
                />
                <button
                  disabled={isTransferringHost || !newHostEmail.trim()}
                  className="h-11 w-full rounded-2xl bg-foreground text-background font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isTransferringHost ? "Changing..." : "Transfer Host"}
                </button>
              </form>
            </div>
          </div>
        )}

        {showDeviceRename && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center bg-background/70 backdrop-blur-xl px-4">
            <div className="w-full max-w-md rounded-4xl border border-foreground/10 bg-background p-6 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-foreground">Rename Device</h2>
                <button onClick={() => setShowDeviceRename(false)} aria-label="Close" className="text-foreground/60 hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <form className="space-y-4" onSubmit={handleDeviceRename}>
                {(() => {
                  const dev = devices.find(d => d.id === editingDeviceId);
                  return dev ? (
                    <div className="flex items-center gap-3 mb-4 p-3.5 rounded-2xl border border-foreground/10 bg-foreground/5">
                      <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center shrink-0 shadow-sm border border-foreground/5">
                        <DeviceGlyph userAgent={dev.user_agent} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-widest text-foreground/40">Detected Type</span>
                        <span className="text-sm text-foreground font-semibold">
                          {getPlatformLabel(dev.user_agent)}
                        </span>
                      </div>
                    </div>
                  ) : null;
                })()}
                <input
                  autoFocus
                  type="text"
                  value={editingDeviceName}
                  onChange={(event) => setEditingDeviceName(event.target.value)}
                  className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-foreground outline-none transition-all placeholder:text-foreground/40 focus:border-foreground/30 focus:ring-1 focus:ring-foreground/30"
                  placeholder="My Device"
                />
                <button
                  disabled={isRenamingDevice || !editingDeviceName.trim()}
                  className="h-11 w-full rounded-2xl bg-foreground text-background font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isRenamingDevice ? "Saving..." : "Save Device Name"}
                </button>
              </form>
            </div>
          </div>
        )}

        {showScanner && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 backdrop-blur-xl px-4">
            <div className="w-full max-w-md rounded-4xl border border-foreground/10 bg-background p-5 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black text-foreground">Scan Room QR</h2>
                <button onClick={stopScanner} aria-label="Close" className="text-foreground/60 hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>

              <div className={`rounded-2xl overflow-hidden border bg-background/60 relative aspect-3/4 flex items-center justify-center transition-all duration-300 ${
                scanStatus === "success"
                  ? "border-green-500 shadow-[0_0_30px_rgba(34,197,94,0.4)]"
                  : scanStatus === "scanning"
                    ? "border-foreground/30 shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                    : "border-foreground/10"
              }`}>
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />

                {/* Laser animation */}
                {scanStatus === "scanning" && (
                  <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-background via-background/80 to-transparent z-80 pointer-events-none" />
                )}

                {/* Target crop corner brackets */}
                {scanStatus === "scanning" && (
                  <div className="absolute -inset-[1px] bg-linear-to-b from-transparent to-background/90 z-80 pointer-events-none rounded-[32px]">
                    <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-green-400 rounded-tl-md" />
                    <div className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-green-400 rounded-tr-md" />
                    <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-green-400 rounded-bl-md" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-green-400 rounded-br-md" />
                  </div>
                )}

                {/* Status Badges */}
                {scanStatus === "scanning" && (
                  <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 border border-white/10 backdrop-blur-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Scanning</span>
                  </div>
                )}
                {scanStatus === "success" && (
                  <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30 backdrop-blur-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Success</span>
                  </div>
                )}

                {scanStatus === "idle" && (
                  <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center px-6 z-20">
                    <Camera className="w-8 h-8 text-foreground/70 mb-3" />
                    <p className="text-sm text-foreground/70">To scan room QR codes, allow camera permission.</p>
                    <button
                      type="button"
                      onClick={startScanner}
                      className="mt-4 h-10 rounded-xl bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground"
                    >
                      Allow Camera Access
                    </button>
                  </div>
                )}
                {scanStatus === "starting" && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center text-foreground/70 text-sm font-semibold z-20">Starting camera...</div>
                )}
                {scanStatus === "error" && (
                  <div className="absolute inset-0 bg-background/75 flex flex-col items-center justify-center text-center px-6 z-20">
                    <Camera className="w-6 h-6 text-red-400 mb-3" />
                    <p className="text-sm text-red-300">{scanError ?? "Unable to scan QR"}</p>
                    <button
                      type="button"
                      onClick={startScanner}
                      className="mt-4 h-9 rounded-lg border border-foreground/20 px-3 text-xs font-semibold text-foreground hover:border-foreground/40"
                    >
                      Retry Camera Access
                    </button>
                  </div>
                )}
              </div>

              <p className="mt-4 text-xs text-foreground/60 text-center">Point your camera at the room QR code.</p>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
