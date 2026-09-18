"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../lib/utils";
import jsQR from "jsqr";
import { X, AlertCircle, ScanLine } from "lucide-react";

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
        videoRef.current.setAttribute("playsinline", "true"); // required to tell iOS safari we don't want fullscreen
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
          // Expected URL format: https://syncbeats.app/room/123456
          // or http://localhost:3000/room/123456
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

  return (
    <div className={cn('fixed', 'inset-0', 'z-[9999]', 'flex', 'items-center', 'justify-center', 'bg-black/90', 'backdrop-blur-md')}>
      {/* Hidden canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Close button */}
      <button 
        onClick={onClose}
        className={cn('absolute', 'top-8', 'right-8', 'p-3', 'rounded-full', 'bg-white/10', 'hover:bg-white/20', 'text-white', 'transition-colors', 'z-50')}
      >
        <X className="w-6 h-6" />
      </button>

      {hasCameraError ? (
        <div className="text-center text-white/80 flex flex-col items-center px-6">
          <AlertCircle className="w-12 h-12 mb-4 text-red-400" />
          <h2 className="text-xl font-bold mb-2">Camera Unavailable</h2>
          <p className="max-w-xs text-sm opacity-70">{cameraErrorText}</p>
        </div>
      ) : (
        <div className="relative w-full max-w-sm aspect-[3/4] rounded-[2rem] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10">
          <video 
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
          />
          
          {/* Overlay Darkening */}
          <div className="absolute inset-0 bg-black/40" />

          {/* Transparent Cutout (The Scan Area) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-64">
              {/* This cuts out the dark overlay */}
              <div className="absolute inset-0 bg-transparent rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
              
              {status === "scanning" && (
                <div className="absolute inset-0">
                   {/* Top Left */}
                   <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-3xl" />
                   {/* Top Right */}
                   <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-3xl" />
                   {/* Bottom Left */}
                   <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-3xl" />
                   {/* Bottom Right */}
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
                    className="absolute bottom-[-60px] left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-500/90 text-white px-4 py-2 rounded-full font-bold text-sm shadow-xl flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4" />
                    {errorMessage}
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>
          
          <div className="absolute bottom-8 left-0 right-0 text-center">
            <h3 className="text-white font-bold tracking-widest uppercase text-sm drop-shadow-md">Scan QR Code</h3>
            <p className="text-white/70 text-xs mt-2 font-medium drop-shadow-md">Point camera at a SyncBeats room</p>
          </div>
        </div>
      )}
    </div>
  );
}
