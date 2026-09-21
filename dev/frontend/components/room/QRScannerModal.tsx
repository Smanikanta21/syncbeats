"use client";

import { useEffect, useRef, useState, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../lib/utils";
import jsQR from "jsqr";
import { X, AlertCircle, ScanLine, Clock, ArrowRight, Clipboard, CameraOff, Music } from "lucide-react";
import { roomsApi, RoomRecord } from "../../lib/api";

interface QRScannerModalProps {
  onClose: () => void;
}

type ScanStatus = "scanning" | "success" | "error";

export function QRScannerModal({ onClose }: QRScannerModalProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<number>(0);
  
  const [status, setStatus] = useState<ScanStatus>("scanning");
  const [errorMessage, setErrorMessage] = useState("");
  const [hasCameraError, setHasCameraError] = useState(false);
  const [cameraErrorText, setCameraErrorText] = useState("");

  // Manual Entry State
  const [joinCode, setJoinCode] = useState("");
  
  // Recent Rooms State
  const [recentRooms, setRecentRooms] = useState<RoomRecord[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  // Fetch recent rooms
  useEffect(() => {
    setLoadingRooms(true);
    roomsApi.mine()
      .then(({ rooms }) => {
        setRecentRooms(rooms.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => {
        setLoadingRooms(false);
      });
  }, []);

  const startCamera = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API not available. This usually happens if you are accessing the site via an IP address without HTTPS. iOS requires HTTPS for camera access.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true"); 
        await videoRef.current.play();
        scanLoop();
      }
    } catch (err: any) {
      console.error("Camera access denied or unavailable", err);
      setCameraErrorText(err?.message || "Please allow camera permissions to scan QR codes.");
      setHasCameraError(true);
    }
  };

  const stopCamera = useCallback(() => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [stopCamera]);

  const handleValidQR = (roomId: string) => {
    if (status !== "scanning") return;
    setStatus("success");
    
    // Play success feedback
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([50, 50, 50]);
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      try {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } catch (e) {}
    }

    setTimeout(() => {
      stopCamera();
      onClose();
      router.push(`/room/${roomId}`);
    }, 800);
  };

  const handleInvalidQR = () => {
    if (status !== "scanning") return;
    setStatus("error");
    setErrorMessage("Not a SyncBeats Room QR");
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([100, 100, 100]);
    setTimeout(() => setStatus("scanning"), 2500);
  };

  const scanLoop = () => {
    if (!videoRef.current || !canvasRef.current || status === "success") return;
    const video = videoRef.current;
    
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        let foundUrl: string | null = null;
        
        if ('BarcodeDetector' in window) {
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          detector.detect(canvas).then((barcodes: any) => {
            if (barcodes.length > 0) {
              foundUrl = barcodes[0].rawValue;
              processUrl(foundUrl);
            }
          }).catch(() => {
            fallbackScan(ctx, canvas.width, canvas.height);
          });
        } else {
          fallbackScan(ctx, canvas.width, canvas.height);
        }

        function processUrl(url: string | null) {
          if (!url) return;
          if (url.includes("/room/")) {
            const parts = url.split("/room/");
            if (parts.length > 1 && parts[1].length > 0) {
              const roomId = parts[1].split("?")[0].replace(/[^a-zA-Z0-9-]/g, "");
              handleValidQR(roomId);
            } else {
              handleInvalidQR();
            }
          } else {
            handleInvalidQR();
          }
        }

        function fallbackScan(ctx: CanvasRenderingContext2D, w: number, h: number) {
          const imageData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imageData.data, w, h, { inversionAttempts: "dontInvert" });
          if (code && code.data) {
            processUrl(code.data);
          }
        }
      }
    }
    
    if (status === "scanning") {
      requestRef.current = requestAnimationFrame(scanLoop);
    }
  };

  const handleManualJoin = (e: FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length >= 4) {
      const code = joinCode.trim().toUpperCase();
      stopCamera();
      onClose();
      router.push(`/room/${code}`);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        const cleaned = text.trim().toUpperCase().slice(0, 6);
        if (cleaned) setJoinCode(cleaned);
      }
    } catch {}
  };

  return (
    <div className={cn('fixed', 'inset-0', 'z-9999', 'flex', 'flex-col', 'items-center', 'p-4', 'sm:p-8', 'bg-black/90', 'backdrop-blur-md', 'overflow-y-auto')}>
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Header & Close button */}
      <div className="w-full max-w-sm flex items-center justify-between shrink-0 mb-6 mt-4">
        <h2 className="text-white font-bold tracking-widest uppercase text-lg">Join Room</h2>
        <button 
          onClick={onClose}
          className={cn('p-2', 'rounded-full', 'bg-white/10', 'hover:bg-white/20', 'text-white', 'transition-colors')}
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-6 pb-20">
        {/* Scanner */}
        {hasCameraError ? (
          <div className="text-center text-white/80 flex flex-col items-center px-6 py-10 bg-white/5 rounded-4xl border border-white/10">
            <CameraOff className="w-12 h-12 mb-4 text-red-400" />
            <h2 className="text-xl font-bold mb-2">Camera Unavailable</h2>
            <p className="max-w-xs text-sm opacity-70">{cameraErrorText}</p>
          </div>
        ) : (
          <div className="relative w-full aspect-3/4 rounded-4xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10 shrink-0">
            <video 
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            
            <div className="absolute inset-0 bg-black/40" />

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-64 h-64">
                <div className="absolute inset-0 bg-transparent rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
                
                {status === "scanning" && (
                  <div className="absolute inset-0">
                     <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-3xl" />
                     <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-3xl" />
                     <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-3xl" />
                     <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-3xl" />
                  </div>
                )}

                <AnimatePresence>
                  {status === "success" && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute inset-0 bg-emerald-500/20 rounded-3xl flex items-center justify-center backdrop-blur-sm"
                    >
                      <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.8)]">
                        <ScanLine className="w-8 h-8 text-white" />
                      </div>
                    </motion.div>
                  )}
                  
                  {status === "error" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute -bottom-15 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-500/90 text-white px-4 py-2 rounded-full font-bold text-sm shadow-xl flex items-center gap-2"
                    >
                      <AlertCircle className="w-4 h-4" />
                      {errorMessage}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            
            <div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none">
              <p className="text-white/70 text-xs mt-2 font-medium drop-shadow-md">Point camera at a SyncBeats room</p>
            </div>
          </div>
        )}

        {/* Manual Code Entry */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-white/50 text-xs font-bold uppercase tracking-widest">
            <div className="flex-1 h-px bg-white/10" />
            <span>Or Enter Code</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <form onSubmit={handleManualJoin} className="relative flex items-center">
            <input
              type="text"
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="------"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-center text-2xl font-black tracking-[0.2em] text-white placeholder:text-white/20 outline-none focus:border-emerald-400 focus:bg-white/10 transition-all uppercase"
            />
            
            {joinCode.length === 0 && (
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="absolute right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 text-[10px] font-bold flex items-center gap-1 transition-colors"
              >
                <Clipboard className="w-4 h-4" /> Paste
              </button>
            )}

            <AnimatePresence>
              {joinCode.length >= 4 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  type="submit"
                  className="absolute right-3 w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-400 transition-colors shadow-lg"
                >
                  <ArrowRight className="w-6 h-6" />
                </motion.button>
              )}
            </AnimatePresence>
          </form>
        </div>

        {/* Recent Rooms */}
        <div className="flex flex-col gap-3 mt-4">
          <div className="flex items-center gap-2 text-white/80 font-semibold text-sm">
            <Clock className="w-4 h-4 text-emerald-400" />
            Recent Rooms
          </div>
          
          <div className="flex flex-col gap-2">
            {loadingRooms ? (
              <div className="text-white/30 text-xs py-4 text-center">Loading...</div>
            ) : recentRooms.length === 0 ? (
              <div className="text-white/30 text-xs py-4 text-center bg-white/5 rounded-2xl border border-white/5">
                No recent active rooms found.
              </div>
            ) : (
              recentRooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => {
                    stopCamera();
                    onClose();
                    router.push(`/room/${room.id}`);
                  }}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                    <Music className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-bold text-white truncate">Room {room.id}</div>
                    <div className="text-[11px] text-white/50 truncate">
                      {room.participant_count || 0} participants • Room ID: {room.id}
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-white/30 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                </button>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
