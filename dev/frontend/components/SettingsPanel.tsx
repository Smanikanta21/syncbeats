import { useState } from "react";
import { X, Sliders, Palette, Zap, Save, RefreshCw } from "lucide-react";
import { useSettings } from "../hooks/useSettings";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, updateSettings } = useSettings();
  
  const handleResetColors = () => {
    updateSettings({
      ambientColors: { bassHue: 0, midHue: 180, highHue: 270 },
      ambientBrightness: 100,
      ambientContrast: 100,
    });
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between px-2 pb-2 shrink-0">
        <h2 className="text-2xl font-black text-foreground">App Settings</h2>
        <button onClick={onClose} className="p-2 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar pb-10 mt-4" data-lenis-prevent="true">
        
        {/* Gradient Editor */}
        <section className="p-5 rounded-3xl bg-foreground/5 border border-foreground/10 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-foreground/70" />
            <h3 className="text-lg font-bold text-foreground">Gradient Editor</h3>
          </div>
          <p className="text-xs text-foreground/60 mb-4">
            Customize the ambient background glow that pulses to the beat of the music.
          </p>

          <div className="flex flex-wrap gap-2 mb-6">
            <button 
              onClick={() => updateSettings({ ambientColors: { bassHue: 0, midHue: 180, highHue: 270 }, ambientBrightness: 100, ambientContrast: 100 })}
              className="px-3 py-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-xs font-bold text-foreground/70 transition"
            >
              Default
            </button>
            <button 
              onClick={() => updateSettings({ ambientColors: { bassHue: 300, midHue: 180, highHue: 240 }, ambientBrightness: 120, ambientContrast: 140 })}
              className="px-3 py-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-xs font-bold text-foreground/70 transition"
            >
              Cyberpunk
            </button>
            <button 
              onClick={() => updateSettings({ ambientColors: { bassHue: 0, midHue: 30, highHue: 320 }, ambientBrightness: 110, ambientContrast: 110 })}
              className="px-3 py-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-xs font-bold text-foreground/70 transition"
            >
              Sunset
            </button>
            <button 
              onClick={() => updateSettings({ ambientColors: { bassHue: 160, midHue: 210, highHue: 240 }, ambientBrightness: 90, ambientContrast: 120 })}
              className="px-3 py-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-xs font-bold text-foreground/70 transition"
            >
              Deep Ocean
            </button>
            <button 
              onClick={() => updateSettings({ ambientColors: { bassHue: 90, midHue: 140, highHue: 170 }, ambientBrightness: 100, ambientContrast: 100 })}
              className="px-3 py-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-xs font-bold text-foreground/70 transition"
            >
              Forest
            </button>
          </div>

          <div 
            className="w-full h-8 rounded-full mb-6 shadow-inner"
            style={{
              background: `linear-gradient(to right, hsl(${settings.ambientColors.bassHue}, 80%, 50%), hsl(${settings.ambientColors.midHue}, 80%, 50%), hsl(${settings.ambientColors.highHue}, 80%, 50%))`
            }}
          />

          <div className="space-y-5">
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-bold uppercase tracking-widest text-foreground/50">Bass (Lows)</label>
                <span className="text-xs font-medium" style={{ color: `hsl(${settings.ambientColors.bassHue}, 80%, 50%)` }}>{settings.ambientColors.bassHue}°</span>
              </div>
              <input 
                type="range" min="0" max="360" value={settings.ambientColors.bassHue} 
                onChange={(e) => updateSettings({ ambientColors: { ...settings.ambientColors, bassHue: Number(e.target.value) } })}
                className="w-full"
                style={{ accentColor: `hsl(${settings.ambientColors.bassHue}, 80%, 50%)` }}
              />
            </div>
            
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-bold uppercase tracking-widest text-foreground/50">Mids</label>
                <span className="text-xs font-medium" style={{ color: `hsl(${settings.ambientColors.midHue}, 80%, 50%)` }}>{settings.ambientColors.midHue}°</span>
              </div>
              <input 
                type="range" min="0" max="360" value={settings.ambientColors.midHue} 
                onChange={(e) => updateSettings({ ambientColors: { ...settings.ambientColors, midHue: Number(e.target.value) } })}
                className="w-full"
                style={{ accentColor: `hsl(${settings.ambientColors.midHue}, 80%, 50%)` }}
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-bold uppercase tracking-widest text-foreground/50">Treble (Highs)</label>
                <span className="text-xs font-medium" style={{ color: `hsl(${settings.ambientColors.highHue}, 80%, 50%)` }}>{settings.ambientColors.highHue}°</span>
              </div>
              <input 
                type="range" min="0" max="360" value={settings.ambientColors.highHue} 
                onChange={(e) => updateSettings({ ambientColors: { ...settings.ambientColors, highHue: Number(e.target.value) } })}
                className="w-full"
                style={{ accentColor: `hsl(${settings.ambientColors.highHue}, 80%, 50%)` }}
              />
            </div>
            
            <div className="pt-4 border-t border-foreground/5">
              <div className="flex justify-between mb-1">
                <label className="text-xs font-bold uppercase tracking-widest text-foreground/50">Brightness</label>
                <span className="text-xs font-medium">{settings.ambientBrightness}%</span>
              </div>
              <input 
                type="range" min="10" max="200" value={settings.ambientBrightness} 
                onChange={(e) => updateSettings({ ambientBrightness: Number(e.target.value) })}
                className="w-full accent-white"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-bold uppercase tracking-widest text-foreground/50">Contrast</label>
                <span className="text-xs font-medium">{settings.ambientContrast}%</span>
              </div>
              <input 
                type="range" min="10" max="200" value={settings.ambientContrast} 
                onChange={(e) => updateSettings({ ambientContrast: Number(e.target.value) })}
                className="w-full accent-white"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button onClick={handleResetColors} className="flex-1 py-2 rounded-xl bg-foreground/10 text-foreground text-sm font-bold flex items-center justify-center gap-2 hover:bg-foreground/20 transition">
              <RefreshCw className="w-4 h-4" /> Reset Default Visuals
            </button>
          </div>
        </section>

        {/* Sync Settings */}
        <section className="p-5 rounded-3xl bg-foreground/5 border border-foreground/10 shadow-lg">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-foreground/70" />
            <h3 className="text-lg font-bold text-foreground">Synchronization</h3>
          </div>
          
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-bold uppercase tracking-widest text-foreground/50">Audio Latency Offset (ms)</label>
                <span className="text-xs font-medium">{settings.audioLatencyOffsetMs} ms</span>
              </div>
              <input 
                type="range" min="-500" max="500" step="10" 
                value={settings.audioLatencyOffsetMs} 
                onChange={(e) => updateSettings({ audioLatencyOffsetMs: Number(e.target.value) })}
                className="w-full accent-white"
              />
              <p className="text-[10px] text-foreground/40 mt-1">
                Adjust this if your Bluetooth headphones or speakers are out of sync. Negative values play audio earlier.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-foreground/50 block mb-2">Sync Aggressiveness</label>
              <div className="flex gap-2">
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
              <p className="text-[10px] text-foreground/40 mt-2">
                High Accuracy pings the server more frequently to keep playback perfectly aligned. Battery Saver relaxes the sync interval.
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
