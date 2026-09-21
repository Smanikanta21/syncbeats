"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { DeviceSpatialState, Participant } from "../../lib/types";
import { SpatialAudioEngine, type SpatialPosition } from "../../audio/SpatialAudioEngine";
import { cn } from "@/lib/utils";
import { SpatialScene3D } from "./spatial/SpatialScene3D";


interface SpatialPanelProps {
  myDeviceId: string;
  myUserId?: string;
  spatialDevices: DeviceSpatialState[];
  participants: Participant[];
  isPlaying: boolean;
  onUpdatePosition: (deviceId: string, pos: SpatialPosition) => void;
  orbitSpeed?: number;
  orbitData?: { fromId: string; toId: string; frac: number } | null;
  onOrbitSpeedChange?: (speed: number) => void;
  roomId: string;
  spatialMode?: 'multiplayer' | '8d-solo';
  onSpatialModeChange?: (mode: 'multiplayer' | '8d-solo') => void;
  allow8DSolo?: boolean;
}

// ── Coordinate Conversion ─────────────────────────────────────────────────
// (2D helpers removed — positions are now handled by SpatialScene3D / Three.js)

// ── Ego-Centric Room View ─────────────────────────────────────────────────

export function SpatialPanel({
  myDeviceId,
  myUserId,
  spatialDevices,
  participants,
  isPlaying,
  onUpdatePosition,
  orbitSpeed = 3,
  onOrbitSpeedChange,
  roomId,
  spatialMode,
  onSpatialModeChange,
  allow8DSolo,
}: SpatialPanelProps) {
  const [orbitData, setOrbitData] = useState<{fromId: string, toId: string, frac: number} | null>(null);

  // Subscribe directly to the audio engine to avoid re-rendering the whole page
  useEffect(() => {
    const engine = SpatialAudioEngine.getInstance();
    engine.setOrbitUpdateCallback((fromId: string, toId: string, frac: number) => {
      setOrbitData({ fromId, toId, frac });
    });
    return () => {
      engine.setOrbitUpdateCallback(undefined as any);
    };
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);


  // Determine current user
  const myParticipant = participants.find((p) => p.socketId === myDeviceId);
  const resolvedMyUserId = myUserId ?? myParticipant?.userId ?? myParticipant?.socketId ?? myDeviceId;





  // Compute live stereo pan value from current orbit position (-1 left .. +1 right)
  const panValue = useMemo(() => {
    if (!orbitData) return 0;
    if (orbitData.fromId === '8D_MODE') {
      // In 8D mode, frac is actually the direct angle. Radius is fixed at 1.5.
      return Math.max(-1, Math.min(1, Math.sin(orbitData.frac) * 1.5));
    }

    const { fromId, toId, frac } = orbitData;
    const fromDev = spatialDevices.find(d => d.deviceId === fromId);
    const toDev = spatialDevices.find(d => d.deviceId === toId);
    if (!fromDev || !toDev) return 0;
    // Ease frac
    const ef = frac < 0.5 ? 2 * frac * frac : 1 - Math.pow(-2 * frac + 2, 2) / 2;
    // Pan is driven by sin(angle) — right = positive
    const panA = Math.sin(fromDev.position.angle) * fromDev.position.radius;
    const panB = Math.sin(toDev.position.angle) * toDev.position.radius;
    return Math.max(-1, Math.min(1, panA + (panB - panA) * ef));
  }, [orbitData, spatialDevices]);

  return (
    <div className={cn('flex-1', 'w-full', 'flex', 'flex-col', 'min-h-0', 'min-w-0')}>
      <div className={cn('flex', 'items-center', 'justify-between', 'mb-2', 'lg:mb-4', 'shrink-0')}>
        <div>
          <h2 className={cn('text-xs', 'font-black', 'uppercase', 'tracking-widest', 'text-foreground/50')}>
            Spatial Room
          </h2>
          <p className={cn('text-[10px]', 'lg:text-xs', 'text-foreground/40', 'mt-0.5')}>Drag users or devices to position them</p>
        </div>

        {allow8DSolo && (
          <div className={cn('flex', 'bg-foreground/5', 'p-1', 'rounded-full', 'border', 'border-foreground/10')}>
            <button 
              onClick={() => onSpatialModeChange?.('multiplayer')}
              className={`px-3 py-1 lg:px-4 lg:py-1.5 text-[10px] lg:text-xs rounded-full font-semibold transition-colors ${spatialMode === 'multiplayer' ? 'bg-blue-500 text-white shadow-md' : 'text-foreground/60 hover:text-foreground'}`}
            >
              Multiplayer
            </button>
            <button 
              onClick={() => onSpatialModeChange?.('8d-solo')}
              className={`px-3 py-1 lg:px-4 lg:py-1.5 text-[10px] lg:text-xs rounded-full font-semibold transition-colors flex items-center gap-1.5 ${spatialMode === '8d-solo' ? 'bg-violet-500 text-white shadow-md' : 'text-foreground/60 hover:text-foreground'}`}
            >
              8D Solo
            </button>
          </div>
        )}
      </div>

      <div className={cn('flex-1', 'w-full', 'flex', 'flex-col-reverse', 'lg:flex-row', 'gap-4', 'min-h-0')}>
          {/* ── 3D Spatial Scene ─────────────────────────────────────────── */}
          {(() => {
            // ── 3D Canvas (shared between inline + modal) ─────────────────
            const scene3D = (
              <SpatialScene3D
                spatialDevices={spatialDevices}
                participants={participants}
                myDeviceId={myDeviceId}
                myUserId={myUserId}
                isPlaying={isPlaying}
                onUpdatePosition={onUpdatePosition}
                className="absolute inset-0 w-full h-full"
              />
            );

            return (
              <>
                {/* INLINE VIEW — blurred/overlay on mobile until tapped */}
                <div
                  className={`flex-1 w-full relative overflow-hidden bg-black/5 dark:bg-[#07090F] touch-none rounded-3xl border border-foreground/5 ${!isMobileModalOpen ? "cursor-pointer lg:cursor-auto" : "hidden lg:block"}`}
                  onClick={() => {
                    if (window.innerWidth < 1024 && !isMobileModalOpen) {
                      setIsMobileModalOpen(true);
                    }
                  }}
                >
                  <div className={!isMobileModalOpen ? "absolute inset-0 lg:opacity-100 opacity-70 lg:blur-none blur-sm pointer-events-none lg:pointer-events-auto transition-all w-full h-full" : "absolute inset-0 w-full h-full"}>
                    {scene3D}
                  </div>

                  {/* "TAP TO EXPAND" pill — mobile only, shown when not yet opened */}
                  {!isMobileModalOpen && (
                    <div className={cn('absolute', 'inset-0', 'z-50', 'flex', 'items-center', 'justify-center', 'lg:hidden', 'pointer-events-none', 'bg-background/10')}>
                      <div className={cn('bg-foreground', 'text-background', 'px-5', 'py-2.5', 'rounded-full', 'font-black', 'text-xs', 'shadow-2xl', 'flex', 'items-center', 'gap-2', 'tracking-wide')}>
                        <Maximize2 className={cn('w-4', 'h-4')} />
                        <span>TAP TO EXPAND</span>
                      </div>
                    </div>
                  )}

                  {/* Hint overlay on desktop */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[9px] font-bold tracking-widest text-foreground/20 uppercase pointer-events-none select-none hidden lg:block">
                    Drag to rotate · Scroll to zoom
                  </div>
                </div>

                {/* MODAL VIEW — mobile only, full-screen */}
                {mounted && isMobileModalOpen && createPortal(
                  <div className={cn('fixed', 'inset-0', 'z-[100]', 'flex', 'flex-col', 'p-4', 'bg-background/92', 'backdrop-blur-3xl', 'animate-in', 'fade-in', 'duration-200', 'lg:hidden')}>
                    <div className={cn('flex', 'items-center', 'justify-between', 'mb-4', 'pt-12')}>
                      <div className={cn('flex', 'items-center', 'gap-4')}>
                        <h2 className={cn('text-xs', 'font-black', 'uppercase', 'tracking-widest', 'text-foreground/50')}>
                          Spatial Room
                        </h2>
                        {allow8DSolo && (
                          <div className={cn('flex', 'bg-foreground/5', 'p-1', 'rounded-full', 'border', 'border-foreground/10')}>
                            <button
                              onClick={(e) => { e.stopPropagation(); onSpatialModeChange?.('multiplayer'); }}
                              className={`px-3 py-1 text-[10px] rounded-full font-semibold transition-colors ${spatialMode === 'multiplayer' ? 'bg-blue-500 text-white shadow-md' : 'text-foreground/60 hover:text-foreground'}`}
                            >
                              Multiplayer
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onSpatialModeChange?.('8d-solo'); }}
                              className={`px-3 py-1 text-[10px] rounded-full font-semibold transition-colors ${spatialMode === '8d-solo' ? 'bg-violet-500 text-white shadow-md' : 'text-foreground/60 hover:text-foreground'}`}
                            >
                              8D Solo
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        className={cn('w-10', 'h-10', 'rounded-full', 'bg-foreground/10', 'flex', 'items-center', 'justify-center', 'text-foreground', 'hover:bg-foreground/20')}
                        onClick={(e) => { e.stopPropagation(); setIsMobileModalOpen(false); }}
                      >
                        <X className={cn('w-5', 'h-5')} />
                      </button>
                    </div>
                    <div className={cn('flex-1', 'w-full', 'relative', 'overflow-hidden', 'bg-black/10', 'dark:bg-[#07090F]', 'touch-none', 'rounded-3xl', 'border', 'border-foreground/10', 'shadow-2xl')}>
                      {scene3D}
                    </div>
                  </div>,
                  document.body,
                )}
              </>
            );
          })()}
        {/* Right side orbit controls (Responsive) */}
        {onOrbitSpeedChange && (
          <div className={cn('order-first', 'lg:order-last', 'lg:w-48', 'shrink-0', 'bg-foreground/5', 'rounded-2xl', 'p-3', 'lg:p-4', 'flex', 'flex-col', 'gap-3', 'lg:gap-4')}>
            <div className={cn('flex', 'flex-row', 'lg:flex-col', 'justify-between', 'items-center', 'lg:items-start', 'gap-2')}>
              <h3 className={cn('text-sm', 'font-semibold', 'text-foreground/90')}>Spatial Controller</h3>
              <div className={cn('text-[10px]', 'sm:text-xs', 'font-mono', 'text-cyan-400/90', 'flex', 'items-center', 'gap-1.5', 'font-bold', 'tracking-tight')}>
                {orbitSpeed.toFixed(1)}s / device
              </div>
            </div>
            <div className={cn('flex-1', 'flex', 'flex-col', 'justify-center')}>
              <div className={cn('text-[10px]', 'text-foreground/50', 'font-bold', 'mb-1')}>ORBIT SPEED</div>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={orbitSpeed}
                onChange={(e) => onOrbitSpeedChange(parseFloat(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #06b6d4 0%, #06b6d4 ${((orbitSpeed - 0.5) / 9.5) * 100}%, rgba(255,255,255,0.15) ${((orbitSpeed - 0.5) / 9.5) * 100}%, rgba(255,255,255,0.15) 100%)`
                }}
                className={cn('w-full', 'h-1.5', 'rounded-full', 'appearance-none', 'outline-none', 'cursor-pointer', '[&::-webkit-slider-thumb]:appearance-none', '[&::-webkit-slider-thumb]:w-3.5', '[&::-webkit-slider-thumb]:h-3.5', '[&::-webkit-slider-thumb]:rounded-full', '[&::-webkit-slider-thumb]:bg-cyan-400', '[&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(6,182,212,0.9)]')}
              />
              <div className={cn('flex', 'justify-between', 'text-[10px]', 'text-foreground/50', 'mt-1')}>
                <span>Fast</span>
                <span>Slow</span>
              </div>
            </div>

            
            {/* My Elevation Slider */}
            <div className={cn('flex-1', 'flex', 'flex-col', 'justify-center', 'border-t', 'border-foreground/10', 'pt-3', 'lg:pt-4')}>
              <div className={cn('text-[10px]', 'text-foreground/50', 'font-bold', 'mb-1')}>MY ELEVATION</div>
              <input
                type="range"
                min="-45"
                max="45"
                step="1"
                value={spatialDevices.find(d => d.deviceId === myDeviceId)?.position.elevation ?? 0}
                onChange={(e) => {
                  const myDev = spatialDevices.find(d => d.deviceId === myDeviceId);
                  if (myDev) {
                    onUpdatePosition(myDeviceId, { ...myDev.position, elevation: parseFloat(e.target.value) });
                  }
                }}
                className={cn('w-full', 'accent-white')}
              />
              <div className={cn('flex', 'justify-between', 'text-[10px]', 'text-foreground/50', 'mt-1', 'font-bold')}>
                <span>Floor</span>
                <span>Ear</span>
                <span>Ceil</span>
              </div>
            </div>

            {/* Live Pan Meter */}
            <div className={cn('flex-1', 'flex', 'flex-col', 'justify-center', 'border-t', 'border-foreground/10', 'pt-3', 'lg:pt-4')}>
              <div className={cn('text-[10px]', 'text-foreground/50', 'font-bold', 'mb-1')}>LIVE PAN</div>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={panValue}
                readOnly
                className={cn('w-full', 'accent-white', 'pointer-events-none')}
              />
              <div className={cn('flex', 'justify-between', 'text-[10px]', 'text-foreground/50', 'mt-1', 'font-bold')}>
                <span>L</span>
                <span>R</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
