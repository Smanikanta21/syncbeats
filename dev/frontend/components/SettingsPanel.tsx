import { useState, useEffect, useRef } from "react";
import { X, Sliders, Palette, Zap, Save, RefreshCw, Check, Sun, Radio, Smartphone, Sparkles } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";

interface SettingsPanelProps {
  onClose: () => void;
  onlyVisuals?: boolean;
  onInteractionStateChange?: (interacting: boolean) => void;
}

function RoomPreview({ 
  bassHue, 
  midHue, 
  highHue, 
  brightness, 
  contrast,
  onInteractionStateChange
}: { 
  bassHue: number; 
  midHue: number; 
  highHue: number; 
  brightness: number; 
  contrast: number; 
  onInteractionStateChange?: (interacting: boolean) => void;
}) {
  const { settings, updateSettings } = useSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const positions = {
    sub: settings.ambientPositions?.sub || { x: 20, y: 25 },
    bass: settings.ambientPositions?.bass || { x: 80, y: 25 },
    lowMid: settings.ambientPositions?.lowMid || { x: 20, y: 75 },
    mid: settings.ambientPositions?.mid || { x: 80, y: 75 },
    upperMid: settings.ambientPositions?.upperMid || { x: 50, y: 20 },
    high: settings.ambientPositions?.high || { x: 50, y: 80 },
  };

  const [localPositions, setLocalPositions] = useState(positions);

  useEffect(() => {
    setLocalPositions(positions);
  }, [
    positions.sub?.x, positions.sub?.y,
    positions.bass?.x, positions.bass?.y,
    positions.lowMid?.x, positions.lowMid?.y,
    positions.mid?.x, positions.mid?.y,
    positions.upperMid?.x, positions.upperMid?.y,
    positions.high?.x, positions.high?.y
  ]);

  const startDrag = (band: 'sub' | 'bass' | 'lowMid' | 'mid' | 'upperMid' | 'high') => (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const targetEl = e.currentTarget as HTMLElement;
    try {
      targetEl.setPointerCapture(e.pointerId);
    } catch {}

    onInteractionStateChange?.(true);

    const rect = containerRef.current.getBoundingClientRect();
    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const xPct = Math.max(0, Math.min(100, ((moveEvent.clientX - rect.left) / rect.width) * 100));
      const yPct = Math.max(0, Math.min(100, ((moveEvent.clientY - rect.top) / rect.height) * 100));
      setLocalPositions(prev => ({
        ...prev,
        [band]: { x: Math.round(xPct), y: Math.round(yPct) }
      }));
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      try {
        targetEl.releasePointerCapture(upEvent.pointerId);
      } catch {}

      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      onInteractionStateChange?.(false);

      setLocalPositions(latest => {
        updateSettings({
          ambientPositions: latest
        });
        return latest;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const bMult = brightness / 100;
  const cMult = contrast / 100;
  
  const adjustSat = (base: number) => Math.min(100, base * Math.pow(cMult, 1.2));
  const adjustLight = (base: number) => base + (50 - base) * (1 - 1 / cMult);
  
  const opacities = [0.28, 0.24, 0.24].map(v => v * bMult);

  const lightCount = settings.activeLightCount || 3;
  const activeBands: ('sub' | 'bass' | 'lowMid' | 'mid' | 'upperMid' | 'high')[] = 
    lightCount === 3 
      ? ['bass', 'mid', 'high']
      : lightCount === 4
      ? ['sub', 'bass', 'mid', 'high']
      : lightCount === 5
      ? ['sub', 'bass', 'mid', 'upperMid', 'high']
      : ['sub', 'bass', 'lowMid', 'mid', 'upperMid', 'high'];

  const bandConfigs = {
    sub: {
      hue: settings.ambientColors.subHue ?? 320,
      sat: adjustSat(85),
      light: adjustLight(55),
      opacity: opacities[0],
      blur: 'blur-[26px]',
      size: 'w-[50%] h-[50%]',
      colorClass: 'bg-pink-500',
      borderColor: 'rgba(236,72,153,0.5)'
    },
    bass: {
      hue: settings.ambientColors.bassHue ?? 0,
      sat: adjustSat(85),
      light: adjustLight(55),
      opacity: opacities[0],
      blur: 'blur-[24px]',
      size: 'w-[50%] h-[50%]',
      colorClass: 'bg-orange-500',
      borderColor: 'rgba(249,115,22,0.5)'
    },
    lowMid: {
      hue: settings.ambientColors.lowMidHue ?? 40,
      sat: adjustSat(85),
      light: adjustLight(55),
      opacity: opacities[1],
      blur: 'blur-[24px]',
      size: 'w-[50%] h-[50%]',
      colorClass: 'bg-orange-400',
      borderColor: 'rgba(251,146,60,0.5)'
    },
    mid: {
      hue: settings.ambientColors.midHue ?? 120,
      sat: adjustSat(80),
      light: adjustLight(50),
      opacity: opacities[1],
      blur: 'blur-[22px]',
      size: 'w-[45%] h-[45%]',
      colorClass: 'bg-teal-500',
      borderColor: 'rgba(20,184,166,0.5)'
    },
    upperMid: {
      hue: settings.ambientColors.upperMidHue ?? 200,
      sat: adjustSat(80),
      light: adjustLight(50),
      opacity: opacities[1],
      blur: 'blur-[22px]',
      size: 'w-[45%] h-[45%]',
      colorClass: 'bg-blue-500',
      borderColor: 'rgba(59,130,246,0.5)'
    },
    high: {
      hue: settings.ambientColors.highHue ?? 280,
      sat: adjustSat(75),
      light: adjustLight(55),
      opacity: opacities[2],
      blur: 'blur-[26px]',
      size: 'w-[55%] h-[55%]',
      colorClass: 'bg-purple-500',
      borderColor: 'rgba(168,85,247,0.5)'
    }
  };

  return (
    <div ref={containerRef} className={cn('w-full', 'h-[250px]', 'rounded-3xl', 'relative', 'overflow-hidden', 'bg-[#0A0D14]', 'border', 'border-white/[0.08]', 'shadow-[inset_0_2px_10px_rgba(0,0,0,0.8),0_10px_30px_rgba(0,0,0,0.5)]', 'flex', 'flex-col', 'justify-between', 'p-3', 'select-none', 'touch-none', 'mb-6')}>
      
      {/* Glowing Ambient Background Blobs */}
      {activeBands.map(band => {
        const conf = bandConfigs[band];
        const pos = localPositions[band] || positions[band];
        if (!pos) return null;
        return (
          <div 
            key={`blob-${band}`}
            className={cn('absolute', 'rounded-full', conf.blur, conf.size, '-translate-x-1/2', '-translate-y-1/2', 'pointer-events-none')}
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              opacity: conf.opacity,
              background: `radial-gradient(circle, hsla(${conf.hue}, ${conf.sat}%, ${conf.light}%, 1) 0%, hsla(${conf.hue}, ${conf.sat}%, ${conf.light}%, 0) 70%)`
            }}
          />
        );
      })}

      {/* Interactive Drag Handles for Lights */}
      <div className="absolute inset-0 z-20 pointer-events-none touch-none">
        {/* Helper instruction text */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/60 border border-white/10 rounded-full px-2.5 py-0.5 text-[7px] font-bold uppercase tracking-widest text-white/50">
          Drag nodes to move lights
        </div>

        {activeBands.map(band => {
          const conf = bandConfigs[band];
          const pos = localPositions[band] || positions[band];
          if (!pos) return null;
          return (
            <div
              key={`handle-${band}`}
              onPointerDown={startDrag(band)}
              className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border bg-black/85 flex items-center justify-center pointer-events-auto cursor-grab active:cursor-grabbing shadow-lg select-none touch-none"
              style={{
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                borderColor: `hsla(${conf.hue}, 100%, 50%, 0.6)`,
                boxShadow: `0 0 12px hsla(${conf.hue}, 100%, 50%, 0.5)`
              }}
            >
              <div 
                className="w-2.5 h-2.5 rounded-full animate-pulse" 
                style={{
                  background: `hsl(${conf.hue}, 100%, 50%)`,
                  boxShadow: `0 0 8px hsl(${conf.hue}, 100%, 50%)`
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Grid Overlay Line */}
      <div className={cn('absolute', 'inset-0', 'bg-[radial-gradient(ellipse_at_center,transparent_20%,#090c13_95%)]', 'pointer-events-none')} />

      {/* Room UI Mockup */}
      <div className={cn('relative', 'z-10', 'w-full', 'h-full', 'flex', 'flex-col', 'justify-between', 'pointer-events-none', 'opacity-90')}>
        
        {/* Header Row */}
        <div className={cn('flex', 'items-center', 'justify-between', 'w-full', 'h-4', 'px-1', 'shrink-0')}>
          {/* Room Info */}
          <div className={cn('flex', 'items-center', 'gap-1')}>
            <div className={cn('w-1.5', 'h-1.5', 'rounded-full', 'bg-emerald-500', 'animate-pulse')} />
            <span className={cn('text-[6px]', 'font-black', 'text-white/50', 'tracking-wider')}>ROOM: 798591</span>
          </div>
          {/* Mini Dynamic Island */}
          <div className={cn('px-2', 'py-0.5', 'rounded-full', 'bg-black/85', 'border', 'border-white/10', 'flex', 'items-center', 'gap-1', 'scale-[0.85]', 'shrink-0')}>
            <div className={cn('w-1', 'h-1', 'rounded-full', 'bg-emerald-500')} />
            <div className={cn('w-2', 'h-1', 'flex', 'gap-[0.5px]', 'items-center')}>
              <div className={cn('w-[0.5px]', 'h-0.5', 'bg-white/60', 'animate-pulse')} />
              <div className={cn('w-[0.5px]', 'h-1', 'bg-white/80')} />
              <div className={cn('w-[0.5px]', 'h-0.5', 'bg-white/60', 'animate-pulse')} />
            </div>
            <span className={cn('text-[4px]', 'font-bold', 'text-white/90')}>Calling</span>
          </div>
          {/* Controls Placeholder */}
          <div className={cn('w-4', 'h-1.5', 'rounded', 'bg-white/10')} />
        </div>

        {/* Main Grid Row */}
        <div className={cn('flex-1', 'w-full', 'flex', 'gap-2', 'items-center', 'my-1.5', 'min-h-0')}>
          
          {/* Devices Pane - Hidden on Mobile */}
          <div className={cn('hidden', 'md:flex', 'bg-white/[0.03]', 'border', 'border-white/[0.06]', 'rounded-xl', 'p-1', 'w-[23%]', 'flex-col', 'gap-1', 'h-full')}>
            <span className={cn('text-[5px]', 'font-black', 'tracking-widest', 'text-white/30', 'mb-0.5')}>DEVICES</span>
            <div className={cn('flex', 'items-center', 'gap-1', 'bg-white/[0.04]', 'p-0.5', 'rounded')}>
              <div className={cn('w-2', 'h-2', 'rounded', 'bg-blue-500/20', 'flex', 'items-center', 'justify-center', 'text-[4px]', 'font-bold', 'text-blue-400')}>AB</div>
              <div className={cn('flex-1', 'flex', 'flex-col', 'gap-[0.5px]')}>
                <div className={cn('w-6', 'h-0.5', 'bg-white/60', 'rounded')} />
                <div className={cn('w-4', 'h-[0.5px]', 'bg-white/30', 'rounded')} />
              </div>
            </div>
            <div className={cn('flex', 'items-center', 'gap-1', 'opacity-40')}>
              <div className={cn('w-2', 'h-2', 'rounded', 'bg-white/10')} />
              <div className={cn('w-5', 'h-0.5', 'bg-white/40', 'rounded')} />
            </div>
          </div>

          {/* Spatial Grid - Takes full width on Mobile */}
          <div className={cn('bg-white/[0.02]', 'border', 'border-white/[0.05]', 'rounded-xl', 'flex-1', 'h-full', 'relative', 'overflow-hidden', 'flex', 'items-center', 'justify-center')}>
            {/* Perspective wireframe svg */}
            <svg className={cn('absolute', 'inset-0', 'w-full', 'h-full', 'stroke-white/[0.06]', 'stroke-[0.5]')} viewBox="0 0 100 100" fill="none" preserveAspectRatio="none">
              <line x1="15" y1="90" x2="35" y2="10" />
              <line x1="50" y1="90" x2="50" y2="10" />
              <line x1="85" y1="90" x2="65" y2="10" />
              <line x1="10" y1="90" x2="90" y2="90" />
              <line x1="16" y1="70" x2="84" y2="70" />
              <line x1="22" y1="50" x2="78" y2="50" />
              <line x1="28" y1="30" x2="72" y2="30" />
            </svg>
            
            {/* Pulse Glow for Host */}
            <div className={cn('absolute', 'w-5', 'h-5', 'rounded-full', 'bg-blue-500/30', 'blur-sm', 'animate-ping')} />
            {/* Host node */}
            <div className={cn('w-3.5', 'h-3.5', 'rounded-full', 'bg-blue-500', 'border', 'border-white/20', 'shadow-[0_0_8px_rgba(59,130,246,0.6)]', 'flex', 'items-center', 'justify-center', 'text-[4px]', 'font-black', 'text-white', 'relative', 'z-10')}>
              AB
            </div>

            {/* Mobile Radial Menu Mockup (Floating at bottom-right) */}
            <div className={cn('md:hidden', 'absolute', 'bottom-2', 'right-2', 'w-5', 'h-5', 'rounded-full', 'bg-white/10', 'border', 'border-white/20', 'flex', 'items-center', 'justify-center', 'shadow-md')}>
              <div className={cn('w-1.5', 'h-1.5', 'rounded-full', 'bg-white/70')} />
            </div>
            {/* Mobile Radial Items Fanning Mockup */}
            <div className={cn('md:hidden', 'absolute', 'bottom-2', 'right-8', 'w-3.5', 'h-3.5', 'rounded-full', 'bg-white/10', 'border', 'border-white/20', 'flex', 'items-center', 'justify-center')} />
            <div className={cn('md:hidden', 'absolute', 'bottom-7', 'right-7', 'w-3.5', 'h-3.5', 'rounded-full', 'bg-white/10', 'border', 'border-white/20', 'flex', 'items-center', 'justify-center')} />
            <div className={cn('md:hidden', 'absolute', 'bottom-8', 'right-2', 'w-3.5', 'h-3.5', 'rounded-full', 'bg-white/10', 'border', 'border-white/20', 'flex', 'items-center', 'justify-center')} />
          </div>

          {/* Queue Pane - Hidden on Mobile */}
          <div className={cn('hidden', 'md:flex', 'bg-white/[0.03]', 'border', 'border-white/[0.06]', 'rounded-xl', 'p-1', 'w-[28%]', 'flex-col', 'gap-1', 'h-full')}>
            <span className={cn('text-[5px]', 'font-black', 'tracking-widest', 'text-white/30', 'mb-0.5')}>QUEUE (13)</span>
            <div className={cn('flex', 'items-center', 'gap-1', 'bg-white/[0.05]', 'p-0.5', 'rounded', 'border', 'border-white/5')}>
              <div className={cn('w-2', 'h-2', 'rounded', 'bg-foreground/10', 'flex', 'items-center', 'justify-center', 'shrink-0')}>
                <div className={cn('w-1.5', 'h-1.5', 'rounded-full', 'bg-white/20', 'border', 'border-dashed', 'border-white/40', 'animate-spin')} style={{ animationDuration: '3s' }} />
              </div>
              <div className={cn('flex-1', 'flex', 'flex-col', 'gap-[0.5px]')}>
                <div className={cn('w-8', 'h-0.5', 'bg-white/80', 'rounded')} />
                <div className={cn('w-5', 'h-[0.5px]', 'bg-white/40', 'rounded')} />
              </div>
            </div>
            <div className={cn('flex', 'items-center', 'gap-1', 'opacity-55')}>
              <div className={cn('w-2', 'h-2', 'rounded', 'bg-foreground/10', 'shrink-0')} />
              <div className={cn('flex-1', 'flex', 'flex-col', 'gap-[0.5px]')}>
                <div className={cn('w-7', 'h-0.5', 'bg-white/60', 'rounded')} />
                <div className={cn('w-4', 'h-[0.5px]', 'bg-white/30', 'rounded')} />
              </div>
            </div>
          </div>

        </div>

        {/* Equalizer Row - Hidden on Mobile */}
        <div className={cn('hidden', 'md:flex', 'bg-white/[0.03]', 'border', 'border-white/[0.06]', 'rounded-xl', 'p-1', 'px-3', 'items-center', 'justify-between', 'w-full', 'h-[22px]', 'shrink-0')}>
          <div className={cn('w-1.5', 'h-1.5', 'rounded-full', 'bg-white/10')} />
          <div className={cn('flex', 'gap-2', 'items-center', 'flex-1', 'justify-center')}>
            {/* EQ Sliders */}
            {[4, 8, 3, 7, 5].map((h, i) => (
              <div key={i} className={cn('w-[1.5px]', 'h-3', 'bg-white/10', 'rounded-full', 'relative', 'flex', 'items-center', 'justify-center')}>
                <div className={cn('absolute', 'w-1', 'h-1', 'rounded-full', 'bg-white')} style={{ bottom: `${h * 10}%` }} />
              </div>
            ))}
          </div>
          <div className={cn('w-5', 'h-1', 'bg-white/10', 'rounded')} />
        </div>

        {/* Mobile Equalizer / Status Row - Visible on Mobile */}
        <div className={cn('md:hidden', 'bg-white/[0.03]', 'border', 'border-white/[0.06]', 'rounded-xl', 'p-1', 'px-2.5', 'flex', 'items-center', 'justify-between', 'w-full', 'h-4', 'shrink-0')}>
          <div className={cn('flex', 'gap-1', 'items-center')}>
            <div className={cn('w-1', 'h-1', 'bg-white/30', 'rounded-full')} />
            <span className={cn('text-[4px]', 'font-bold', 'text-white/40')}>EQ ACTIVE</span>
          </div>
          <div className={cn('flex', 'gap-1', 'items-center')}>
            {[3, 6, 2, 5].map((h, i) => (
              <div key={i} className={cn('w-[1px]', 'h-1.5', 'bg-white/20', 'rounded-full', 'relative')}>
                <div className={cn('absolute', 'w-[1px]', 'bg-white')} style={{ height: `${h * 15}%`, bottom: 0 }} />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export function SettingsPanel({ onClose, onlyVisuals = false, onInteractionStateChange }: SettingsPanelProps) {
  const { settings, updateSettings } = useSettings();
  const { user, updateSettings: saveDbSettings } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    if (!isInteracting) return;
    const handleUp = () => {
      setIsInteracting(false);
      onInteractionStateChange?.(false);
    };
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [isInteracting, onInteractionStateChange]);

  const handleSaveToCloud = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await saveDbSettings(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      console.error("Failed to save settings to cloud", e);
    } finally {
      setIsSaving(false);
    }
  };
  
  const PALETTES_BY_COUNT: Record<number, { name: string; colors: any; brightness: number; contrast: number; }[]> = {
    3: [
      {
        name: "Default",
        colors: { subHue: 320, bassHue: 0, lowMidHue: 40, midHue: 120, upperMidHue: 200, highHue: 240 },
        brightness: 100,
        contrast: 100
      },
      {
        name: "Miami Neon",
        colors: { subHue: 320, bassHue: 180, lowMidHue: 40, midHue: 320, upperMidHue: 200, highHue: 270 },
        brightness: 110,
        contrast: 130
      },
      {
        name: "Fire & Ice",
        colors: { subHue: 320, bassHue: 15, lowMidHue: 40, midHue: 190, upperMidHue: 200, highHue: 240 },
        brightness: 100,
        contrast: 120
      },
      {
        name: "Golden Hour",
        colors: { subHue: 320, bassHue: 25, lowMidHue: 40, midHue: 355, upperMidHue: 200, highHue: 280 },
        brightness: 115,
        contrast: 110
      },
      {
        name: "Organic Sage",
        colors: { subHue: 320, bassHue: 130, lowMidHue: 40, midHue: 160, upperMidHue: 200, highHue: 45 },
        brightness: 100,
        contrast: 100
      }
    ],
    4: [
      {
        name: "Default",
        colors: { subHue: 320, bassHue: 0, lowMidHue: 40, midHue: 120, upperMidHue: 200, highHue: 280 },
        brightness: 100,
        contrast: 100
      },
      {
        name: "Retrowave Grid",
        colors: { subHue: 320, bassHue: 270, lowMidHue: 40, midHue: 210, upperMidHue: 200, highHue: 25 },
        brightness: 120,
        contrast: 140
      },
      {
        name: "Volcanic Dusk",
        colors: { subHue: 355, bassHue: 290, lowMidHue: 40, midHue: 20, upperMidHue: 200, highHue: 50 },
        brightness: 110,
        contrast: 115
      },
      {
        name: "Northern Lights",
        colors: { subHue: 190, bassHue: 280, lowMidHue: 40, midHue: 140, upperMidHue: 200, highHue: 230 },
        brightness: 100,
        contrast: 110
      },
      {
        name: "Cotton Candy",
        colors: { subHue: 200, bassHue: 270, lowMidHue: 40, midHue: 330, upperMidHue: 200, highHue: 20 },
        brightness: 120,
        contrast: 100
      }
    ],
    5: [
      {
        name: "Default",
        colors: { subHue: 320, bassHue: 0, lowMidHue: 40, midHue: 120, upperMidHue: 200, highHue: 280 },
        brightness: 100,
        contrast: 100
      },
      {
        name: "Tokio Drift",
        colors: { subHue: 330, bassHue: 280, lowMidHue: 40, midHue: 180, upperMidHue: 250, highHue: 65 },
        brightness: 120,
        contrast: 140
      },
      {
        name: "Sherbet Sunrise",
        colors: { subHue: 25, bassHue: 350, lowMidHue: 40, midHue: 5, upperMidHue: 50, highHue: 335 },
        brightness: 115,
        contrast: 115
      },
      {
        name: "Cyber Forest",
        colors: { subHue: 140, bassHue: 90, lowMidHue: 40, midHue: 200, upperMidHue: 240, highHue: 310 },
        brightness: 100,
        contrast: 120
      },
      {
        name: "Midnight Mirage",
        colors: { subHue: 160, bassHue: 320, lowMidHue: 40, midHue: 220, upperMidHue: 250, highHue: 280 },
        brightness: 95,
        contrast: 125
      }
    ],
    6: [
      {
        name: "Default",
        colors: { subHue: 320, bassHue: 0, lowMidHue: 40, midHue: 120, upperMidHue: 200, highHue: 280 },
        brightness: 100,
        contrast: 100
      },
      {
        name: "Rainbow Spectrum",
        colors: { subHue: 0, bassHue: 300, lowMidHue: 240, midHue: 35, upperMidHue: 120, highHue: 180 },
        brightness: 100,
        contrast: 100
      },
      {
        name: "Neon Oasis",
        colors: { subHue: 90, bassHue: 165, lowMidHue: 350, midHue: 200, upperMidHue: 250, highHue: 310 },
        brightness: 120,
        contrast: 135
      },
      {
        name: "Desert Horizon",
        colors: { subHue: 345, bassHue: 355, lowMidHue: 275, midHue: 45, upperMidHue: 30, highHue: 15 },
        brightness: 110,
        contrast: 115
      },
      {
        name: "Glacial Dream",
        colors: { subHue: 210, bassHue: 150, lowMidHue: 325, midHue: 175, upperMidHue: 230, highHue: 260 },
        brightness: 105,
        contrast: 110
      }
    ]
  };

  const activeLightCount = settings.activeLightCount || 3;
  const currentPalettes = PALETTES_BY_COUNT[activeLightCount] || PALETTES_BY_COUNT[3];

  return (
    <div className={cn('flex', 'flex-col', 'h-full', 'w-full', 'min-h-0')}>
      <div className={cn('flex', 'items-center', 'justify-between', 'px-2', 'pb-2', 'shrink-0')}>
        <h2 className={cn('text-2xl', 'font-black', 'text-foreground')}>{onlyVisuals ? 'Room Visuals' : 'App Settings'}</h2>
        <button onClick={onClose} className={cn('p-2', 'rounded-full', 'bg-foreground/5', 'hover:bg-foreground/10', 'text-foreground/50', 'hover:text-foreground', 'transition-colors')}>
          <X className={cn('w-5', 'h-5')} />
        </button>
      </div>

      <div 
        className={cn('flex-1', 'min-h-0', 'overflow-y-auto', 'space-y-6', 'pr-2', 'custom-scrollbar', 'pb-10', 'mt-2', 'overscroll-contain')} 
        data-lenis-prevent="true"
      >
        
        {/* Gradient Editor */}
        <section className={cn('p-5', 'rounded-3xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'shadow-lg')}>
          <div className={cn('flex', 'items-center', 'gap-2', 'mb-4')}>
            <Palette className={cn('w-5', 'h-5', 'text-foreground/70')} />
            <h3 className={cn('text-lg', 'font-bold', 'text-foreground')}>Gradient Editor</h3>
          </div>
          <p className={cn('text-xs', 'text-foreground/60', 'mb-4')}>
            Customize the ambient background glow that pulses to the beat of the music.
          </p>

          <div className={cn('flex', 'flex-wrap', 'gap-2', 'mb-4')}>
            {currentPalettes.map((palette) => {
              const isActive = JSON.stringify(settings.ambientColors) === JSON.stringify(palette.colors);
              return (
                <button 
                  key={palette.name}
                  onClick={() => updateSettings({
                    ambientColors: palette.colors,
                    ambientBrightness: palette.brightness,
                    ambientContrast: palette.contrast
                  })}
                  className={cn(
                    'px-3', 'py-1.5', 'rounded-full', 'border', 'text-xs', 'font-bold', 'transition-all',
                    isActive 
                      ? 'bg-foreground text-background border-foreground shadow-sm scale-[1.02]' 
                      : 'bg-foreground/5 hover:bg-foreground/10 border-foreground/10 text-foreground/70'
                  )}
                >
                  {palette.name}
                </button>
              );
            })}
          </div>

          {/* Light Count Selector */}
          <div className="mb-6 p-4 rounded-2xl bg-foreground/[0.03] border border-foreground/5">
            <label className={cn('text-[10px]', 'font-black', 'uppercase', 'tracking-widest', 'text-foreground/40', 'block', 'mb-2')}>Light Blobs Count</label>
            <div className="flex gap-1.5">
              {[3, 4, 5, 6].map(count => (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    const presetPositions = {
                      3: {
                        sub: { x: 50, y: 15 },
                        bass: { x: 30, y: 35 },
                        lowMid: { x: 20, y: 75 },
                        mid: { x: 70, y: 35 },
                        upperMid: { x: 80, y: 75 },
                        high: { x: 50, y: 75 }
                      },
                      4: {
                        sub: { x: 50, y: 15 },
                        bass: { x: 18, y: 50 },
                        lowMid: { x: 20, y: 75 },
                        mid: { x: 82, y: 50 },
                        upperMid: { x: 80, y: 75 },
                        high: { x: 50, y: 85 }
                      },
                      5: {
                        sub: { x: 50, y: 15 },
                        bass: { x: 18, y: 45 },
                        lowMid: { x: 20, y: 75 },
                        mid: { x: 82, y: 45 },
                        upperMid: { x: 72, y: 75 },
                        high: { x: 28, y: 75 }
                      },
                      6: {
                        sub: { x: 50, y: 15 },
                        bass: { x: 18, y: 38 },
                        lowMid: { x: 18, y: 68 },
                        mid: { x: 82, y: 38 },
                        upperMid: { x: 82, y: 68 },
                        high: { x: 50, y: 85 }
                      }
                    }[count as 3 | 4 | 5 | 6];
                    updateSettings({ 
                      activeLightCount: count,
                      ambientPositions: presetPositions
                    });
                  }}
                  className={cn(
                    'flex-1', 'py-1.5', 'rounded-xl', 'text-xs', 'font-bold', 'transition-all', 'border',
                    (settings.activeLightCount || 3) === count 
                      ? 'bg-foreground text-background border-foreground shadow-sm scale-[1.02]' 
                      : 'bg-foreground/[0.03] text-foreground/60 border-foreground/5 hover:bg-foreground/10'
                  )}
                >
                  {count} Lights
                </button>
              ))}
            </div>
          </div>
 
          <RoomPreview 
            bassHue={settings.ambientColors.bassHue}
            midHue={settings.ambientColors.midHue}
            highHue={settings.ambientColors.highHue}
            brightness={settings.ambientBrightness}
            contrast={settings.ambientContrast}
          />
 
          <div 
            className="space-y-5"
            onPointerDown={() => {
              setIsInteracting(true);
              onInteractionStateChange?.(true);
            }}
          >
            {[
              { key: 'subHue' as const, label: 'Sub-Bass (Lows)', activeIf: [4, 5, 6] },
              { key: 'bassHue' as const, label: 'Bass (Lows)', activeIf: [3, 4, 5, 6] },
              { key: 'lowMidHue' as const, label: 'Low Mids', activeIf: [6] },
              { key: 'midHue' as const, label: 'Mids', activeIf: [3, 4, 5, 6] },
              { key: 'upperMidHue' as const, label: 'Upper Mids', activeIf: [5, 6] },
              { key: 'highHue' as const, label: 'Treble (Highs)', activeIf: [3, 4, 5, 6] },
            ]
              .filter(ctrl => ctrl.activeIf.includes(settings.activeLightCount || 3))
              .map(ctrl => {
                const value = settings.ambientColors[ctrl.key] ?? 0;
                return (
                  <div key={ctrl.key}>
                    <div className={cn('flex', 'justify-between', 'mb-1')}>
                      <label className={cn('text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50')}>{ctrl.label}</label>
                      <span className={cn('text-xs', 'font-medium')} style={{ color: `hsl(${value}, 80%, 50%)` }}>{value}°</span>
                    </div>
                    <input 
                      type="range" min="0" max="360" value={value} 
                      onChange={(e) => updateSettings({ ambientColors: { ...settings.ambientColors, [ctrl.key]: Number(e.target.value) } })}
                      className="w-full"
                      style={{ accentColor: `hsl(${value}, 80%, 50%)` }}
                    />
                  </div>
                );
              })}
            <div className={cn('pt-4', 'border-t', 'border-foreground/5')}>
              <div className={cn('flex', 'justify-between', 'mb-1')}>
                <label className={cn('text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50')}>Brightness</label>
                <span className={cn('text-xs', 'font-medium')}>{settings.ambientBrightness}%</span>
              </div>
              <input 
                type="range" min="10" max="200" value={settings.ambientBrightness} 
                onChange={(e) => updateSettings({ ambientBrightness: Number(e.target.value) })}
                className={cn('w-full', 'accent-white')}
              />
            </div>

            <div>
              <div className={cn('flex', 'justify-between', 'mb-1')}>
                <label className={cn('text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50')}>Contrast</label>
                <span className={cn('text-xs', 'font-medium')}>{settings.ambientContrast}%</span>
              </div>
              <input 
                type="range" min="10" max="200" value={settings.ambientContrast} 
                onChange={(e) => updateSettings({ ambientContrast: Number(e.target.value) })}
                className={cn('w-full', 'accent-white')}
              />
            </div>
          </div>

          <div className={cn('flex', 'gap-2', 'mt-6')}>
            <button 
              onClick={() => updateSettings({
                ambientColors: { subHue: 320, bassHue: 0, lowMidHue: 40, midHue: 120, upperMidHue: 200, highHue: 280 },
                ambientBrightness: 100,
                ambientContrast: 100
              })}
              className={cn('flex-1', 'py-2', 'rounded-xl', 'bg-foreground/5', 'text-foreground/70', 'text-sm', 'font-bold', 'flex', 'items-center', 'justify-center', 'gap-2', 'hover:bg-foreground/10', 'transition', 'border', 'border-foreground/10')}
            >
              <RefreshCw className={cn('w-4', 'h-4')} /> Reset Default
            </button>

            {user && (
              <button 
                onClick={handleSaveToCloud}
                disabled={isSaving}
                className={cn('flex-1', 'py-2', 'rounded-xl', 'bg-foreground', 'text-background', 'text-sm', 'font-bold', 'flex', 'items-center', 'justify-center', 'gap-2', 'hover:bg-foreground/90', 'transition', 'disabled:opacity-50')}
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                ) : saveSuccess ? (
                  <>
                    <Check className={cn('w-4', 'h-4')} /> Saved!
                  </>
                ) : (
                  <>
                    <Save className={cn('w-4', 'h-4')} /> Save to Cloud
                  </>
                )}
              </button>
            )}
          </div>
        </section>

        {!onlyVisuals && (
          /* Sync Settings */
          <section className={cn('p-5', 'rounded-3xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'shadow-lg')}>
            <div className={cn('flex', 'items-center', 'gap-2', 'mb-4')}>
              <Zap className={cn('w-5', 'h-5', 'text-foreground/70')} />
              <h3 className={cn('text-lg', 'font-bold', 'text-foreground')}>Synchronization</h3>
            </div>
            
            <div className="space-y-6">
              <div>
                <div className={cn('flex', 'justify-between', 'mb-1')}>
                  <label className={cn('text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50')}>Audio Latency Offset (ms)</label>
                  <span className={cn('text-xs', 'font-medium')}>{settings.audioLatencyOffsetMs} ms</span>
                </div>
                <input 
                  type="range" min="-500" max="500" step="10" 
                  value={settings.audioLatencyOffsetMs} 
                  onChange={(e) => updateSettings({ audioLatencyOffsetMs: Number(e.target.value) })}
                  className={cn('w-full', 'accent-white')}
                />
                <p className={cn('text-[10px]', 'text-foreground/40', 'mt-1')}>
                  Adjust this if your Bluetooth headphones or speakers are out of sync. Negative values play audio earlier.
                </p>
              </div>

              <div>
                <label className={cn('text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50', 'block', 'mb-2')}>Sync Aggressiveness</label>
                <div className={cn('flex', 'gap-2')}>
                  <button 
                    onClick={() => updateSettings({ syncAggressiveness: 'high' })}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition ${settings.syncAggressiveness === 'high' ? 'bg-foreground text-background' : 'bg-foreground/10 text-foreground/70 hover:bg-foreground/20'}`}
                  >
                    High Accuracy
                  </button>
                  <button 
                    onClick={() => updateSettings({ syncAggressiveness: 'saver' })}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition ${settings.syncAggressiveness === 'saver' ? 'bg-foreground text-background' : 'bg-foreground/10 text-foreground/70 hover:bg-foreground/20'}`}
                  >
                    Battery Saver
                  </button>
                </div>
                <p className={cn('text-[10px]', 'text-foreground/40', 'mt-2')}>
                  High Accuracy pings the server more frequently to keep playback perfectly aligned. Battery Saver relaxes the sync interval.
                </p>
              </div>
            </div>
          </section>
        )}

        {!onlyVisuals && (
          <>
            {/* Screen Awake Feature */}
            <section className={cn('p-5', 'rounded-3xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'shadow-lg')}>
              <div className={cn('flex', 'items-center', 'justify-between', 'mb-3')}>
                <div className={cn('flex', 'items-center', 'gap-2')}>
                  <Sun className={cn('w-5', 'h-5', 'text-amber-400')} />
                  <h3 className={cn('text-lg', 'font-bold', 'text-foreground')}>Screen & Display</h3>
                </div>
                {settings.keepScreenAwake && (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Awake Active
                  </span>
                )}
              </div>
              <p className={cn('text-xs', 'text-foreground/60', 'mb-4')}>
                Keep your device screen awake during room listening sessions to prevent browser audio throttling and tab sleep.
              </p>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-foreground/[0.03] border border-foreground/5">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">Keep Screen Awake</span>
                  <span className="text-[10px] text-foreground/40">Uses Web Screen Wake Lock API</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateSettings({ keepScreenAwake: !settings.keepScreenAwake })}
                  className={cn(
                    "relative w-12 h-6 rounded-full transition-colors duration-200 border border-foreground/10 cursor-pointer p-0.5",
                    settings.keepScreenAwake ? "bg-amber-500 border-amber-400" : "bg-foreground/10"
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-md",
                      settings.keepScreenAwake ? "translate-x-6" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </section>

            {/* Dynamic Island Customizer Section */}
            <section className={cn('p-5', 'rounded-3xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'shadow-lg')}>
              <div className={cn('flex', 'items-center', 'gap-2', 'mb-3')}>
                <Radio className={cn('w-5', 'h-5', 'text-purple-400')} />
                <h3 className={cn('text-lg', 'font-bold', 'text-foreground')}>Dynamic Island Customizer</h3>
              </div>
              <p className={cn('text-xs', 'text-foreground/60', 'mb-4')}>
                Customize the glow theme, artwork display, and auto-shrink behavior of your Dynamic Island player.
              </p>

              <div className="space-y-4">
                {/* Glow Accent Theme */}
                <div>
                  <label className={cn('text-[10px]', 'font-black', 'uppercase', 'tracking-widest', 'text-foreground/40', 'block', 'mb-2')}>Glow Accent Theme</label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {[
                      { id: "violet", label: "Violet", color: "bg-purple-500" },
                      { id: "cyan", label: "Cyan", color: "bg-cyan-500" },
                      { id: "emerald", label: "Emerald", color: "bg-emerald-500" },
                      { id: "amber", label: "Amber", color: "bg-amber-500" },
                      { id: "dark", label: "Dark", color: "bg-zinc-700" },
                      { id: "none", label: "None", color: "bg-black border border-white/20" },
                    ].map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => updateSettings({
                          islandCustomizer: { ...settings.islandCustomizer, glowColor: theme.id as any }
                        })}
                        className={cn(
                          'py-2 px-1 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 transition-all border cursor-pointer',
                          settings.islandCustomizer?.glowColor === theme.id
                            ? 'bg-foreground text-background border-foreground shadow-sm scale-105'
                            : 'bg-foreground/[0.03] text-foreground/70 border-foreground/5 hover:bg-foreground/10'
                        )}
                      >
                        <div className={cn('w-3 h-3 rounded-full', theme.color)} />
                        {theme.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto-Shrink Delay */}
                <div>
                  <label className={cn('text-[10px]', 'font-black', 'uppercase', 'tracking-widest', 'text-foreground/40', 'block', 'mb-2')}>Auto-Shrink Delay</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { sec: 3, label: "3s Fast" },
                      { sec: 6, label: "6s Default" },
                      { sec: 10, label: "10s Relaxed" },
                      { sec: 0, label: "Never" },
                    ].map((option) => (
                      <button
                        key={option.sec}
                        type="button"
                        onClick={() => updateSettings({
                          islandCustomizer: { ...settings.islandCustomizer, autoShrinkDelaySec: option.sec }
                        })}
                        className={cn(
                          'py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer',
                          settings.islandCustomizer?.autoShrinkDelaySec === option.sec
                            ? 'bg-foreground text-background border-foreground shadow-sm scale-105'
                            : 'bg-foreground/[0.03] text-foreground/70 border-foreground/5 hover:bg-foreground/10'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Show Album Art Toggle */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-foreground/[0.03] border border-foreground/5">
                  <span className="text-xs font-bold text-foreground">Show Album Artwork Thumbnail</span>
                  <button
                    type="button"
                    onClick={() => updateSettings({
                      islandCustomizer: { ...settings.islandCustomizer, showAlbumArt: !settings.islandCustomizer?.showAlbumArt }
                    })}
                    className={cn(
                      "relative w-12 h-6 rounded-full transition-colors duration-200 border border-foreground/10 cursor-pointer p-0.5",
                      settings.islandCustomizer?.showAlbumArt ? "bg-purple-500 border-purple-400" : "bg-foreground/10"
                    )}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-md",
                        settings.islandCustomizer?.showAlbumArt ? "translate-x-6" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

      </div>
    </div>
  );
}
