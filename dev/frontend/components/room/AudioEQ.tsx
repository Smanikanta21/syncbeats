"use client";

import { useMemo } from "react";
import { SlidersHorizontal, ChevronDown, Settings, Lightbulb, RotateCcw } from "lucide-react";
import { useSettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";

interface AudioEQProps {
  eqGains: number[];
  setEqBand: (index: number, gain: number) => void;
  onOpenVisuals?: () => void;
}

const PRESETS = {
  "Flat": [0, 0, 0, 0, 0],
  "Bass Boost": [6, 4, 0, 0, 0],
  "Treble Boost": [0, 0, 0, 4, 6],
  "Vocal": [-2, 2, 6, 4, -2],
  "Electronic": [6, 2, -2, 4, 6],
  "Acoustic": [4, 2, 0, 2, 4]
};

export function AudioEQ({ eqGains, setEqBand, onOpenVisuals }: AudioEQProps) {
  const { settings, updateSettings } = useSettings();
  const bands = [
    { label: "60", suffix: "Hz" },
    { label: "230", suffix: "Hz" },
    { label: "910", suffix: "Hz" },
    { label: "3.6", suffix: "kHz" },
    { label: "14", suffix: "kHz" },
  ];

  const currentPreset = useMemo(() => {
    for (const [name, gains] of Object.entries(PRESETS)) {
      if (gains.every((g, i) => g === eqGains[i])) return name;
    }
    return "Custom";
  }, [eqGains]);

  return (
    <div className={cn('w-full', 'h-full', 'flex', 'flex-col', 'relative')}>
      <div className={cn('flex', 'items-center', 'justify-between', 'mb-4', 'shrink-0')}>
        <div className={cn('flex', 'items-center', 'gap-3')}>
          <div className={cn('flex', 'items-center', 'gap-1.5')}>
            <SlidersHorizontal className={cn('w-3.5', 'h-3.5', 'text-foreground/50')} />
            <h3 className={cn('text-xs', 'font-black', 'tracking-widest', 'uppercase', 'text-foreground/50', 'hidden', 'sm:block')}>EQ</h3>
          </div>
          
          {/* Preset Dropdown */}
          <div className="relative flex items-center gap-1.5">
            <div className="relative">
              <select
                value={currentPreset}
                onChange={(e) => {
                  const p = PRESETS[e.target.value as keyof typeof PRESETS];
                  if (p) {
                    for (let i = 0; i < 5; i++) setEqBand(i, p[i]);
                  }
                }}
                className="appearance-none bg-foreground/10 border border-foreground/10 text-foreground/80 text-[9px] font-bold uppercase tracking-wider pl-4 pr-6 py-0 h-6 leading-6 rounded-full outline-none cursor-pointer hover:bg-foreground/15 transition-colors text-center text-center-last"
              >
                <option value="Custom" disabled hidden className="text-center">Custom</option>
                {Object.keys(PRESETS).map(p => (
                  <option key={p} value={p} className="bg-background text-foreground text-xs text-center">{p}</option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-foreground/50 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Quick Reset icon button when gains are modified */}
            {eqGains.some(g => g !== 0) && (
              <button
                onClick={() => {
                  for (let i = 0; i < 5; i++) setEqBand(i, 0);
                }}
                className="w-6 h-6 rounded-full bg-foreground/10 border border-foreground/10 hover:bg-foreground/20 text-foreground/60 hover:text-foreground transition-all cursor-pointer flex items-center justify-center shrink-0"
                title="Reset EQ to Flat (0 dB)"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        
        <div className={cn('flex', 'items-center', 'gap-1.5')}>
          {/* Ambient Toggle */}
          <button 
            onClick={() => updateSettings({ ambientEnabled: settings.ambientEnabled !== false ? false : true })}
            className={cn(
              "text-[9px] px-2.5 h-6 flex items-center gap-1 rounded-full font-bold uppercase transition-colors border",
              settings.ambientEnabled !== false 
                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30' 
                : 'bg-foreground/5 text-foreground/40 border-foreground/10 hover:bg-foreground/10'
            )}
            title={settings.ambientEnabled !== false ? "Disable Ambient Background" : "Enable Ambient Background"}
          >
            <Lightbulb className={cn('w-3', 'h-3')} />
            Ambient
          </button>

          {/* Visual Settings Button */}
          {onOpenVisuals && (
            <button 
              onClick={onOpenVisuals}
              className={cn('text-[9px]', 'px-2.5', 'h-6', 'flex', 'items-center', 'gap-1', 'rounded-full', 'font-bold', 'uppercase', 'transition-colors', 'bg-foreground/10', 'border', 'border-foreground/10', 'text-foreground/80', 'hover:bg-foreground/15')}
              title="Visual Settings"
            >
              <Settings className={cn('w-3', 'h-3')} />
              Visuals
            </button>
          )}
        </div>
      </div>

      <div className={cn('flex-1', 'min-h-0', 'flex', 'items-stretch', 'justify-between', 'px-2', 'gap-2')}>
        {bands.map((band, i) => {
          const gain = eqGains[i] || 0;
          
          return (
            <div key={i} className={cn('flex', 'flex-col', 'items-center', 'flex-1', 'relative')}>
              <div className={cn('text-[10px]', 'font-mono', 'font-bold', 'text-foreground/40', 'mb-2', 'h-4')}>
                {gain > 0 ? `+${gain}` : gain}
              </div>
              
              <div className={cn('flex-1', 'min-h-0', 'relative', 'w-full', 'flex', 'justify-center', 'items-center', 'py-2')}>
                
                {/* 1. VISUALS (drawn beneath the input, so shadows aren't clipped) */}
                <div className={cn('absolute', 'w-6', 'h-[160px]', 'pointer-events-none')}>
                  {/* Track background */}
                  <div className={cn('absolute', 'top-2', 'bottom-2', 'left-1/2', '-translate-x-1/2', 'w-1.5', 'rounded-full', 'bg-foreground/5')} />
                  
                  {/* Fill track */}
                  <div 
                    className={cn('absolute', 'left-1/2', '-translate-x-1/2', 'w-1.5', 'rounded-full', 'bg-foreground', 'transition-all', 'duration-75')}
                    style={{
                      bottom: gain >= 0 ? "80px" : `calc(80px - ${(-gain / 12) * 72}px)`,
                      height: `${(Math.abs(gain) / 12) * 72}px`,
                    }}
                  />
                  
                  {/* Thumb overlay */}
                  <div 
                    className={cn('absolute', 'left-1/2', '-translate-x-1/2', 'w-3.5', 'h-3.5', 'rounded-full', 'bg-white', 'border', 'border-black/10', 'dark:border-white/10', 'shadow-md', 'shadow-black/20', 'transition-all', 'duration-75')}
                    style={{
                      bottom: `calc(80px + ${(gain / 12) * 72}px - 7px)`,
                    }}
                  />
                </div>

                {/* 2. INVISIBLE INPUT (rotated but strictly clipped to fix hitbox overlap) */}
                <div 
                  className={cn('relative', 'w-6', 'h-[160px]', 'z-10')}
                  style={{ clipPath: "inset(0)" }}
                >
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="1"
                    value={gain}
                    onChange={(e) => setEqBand(i, parseFloat(e.target.value))}
                    className={cn('absolute', 'left-1/2', 'top-1/2', 'w-[160px]', 'h-6', 'appearance-none', 'bg-transparent', 'cursor-pointer', 'opacity-0')}
                    style={{
                      transform: "translate(-50%, -50%) rotate(-90deg)",
                    }}
                  />
                </div>
              </div>

              <div className={cn('text-[9px]', 'font-black', 'uppercase', 'tracking-tighter', 'text-foreground/30', 'mt-3', 'text-center')}>
                {band.label}<br/>{band.suffix}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
