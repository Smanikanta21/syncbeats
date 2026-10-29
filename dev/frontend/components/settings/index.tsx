"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Sliders, Palette, Zap, Save, RefreshCw, Check, Sun, Radio, Sparkles, Plus, Trash2, Loader2, PanelLeft, PanelRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettings, GradientNode, DEFAULT_SETTINGS, type AppSettings } from "../../hooks/useSettings";
import { useAuth } from "../../context/AuthContext";
import { cn } from "../../lib/utils";
import { RoomPreview } from "./RoomPreview";
import { DEFAULT_NODE_POSITIONS, AUDIO_BAND_NAMES, GRADIENT_PRESETS, getVisiblePresets } from "./presets";

interface SettingsPanelProps {
  onClose?: () => void;
  onlyVisuals?: boolean;
  onInteractionStateChange?: (interacting: boolean) => void;
  isEmbedded?: boolean;
}

function hexToHue(hex: string): number {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  if (max !== min) {
    const d = max - min;
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return Math.round(h * 360);
}

export function SettingsPanel({
  onClose,
  onlyVisuals = false,
  onInteractionStateChange,
  isEmbedded = false,
}: SettingsPanelProps) {
  const { settings, updateSettings: rawUpdateSettings } = useSettings();
  const { user, updateSettings: saveDbSettings } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [hasUserEdited, setHasUserEdited] = useState(false);

  const baselineSettingsRef = useRef<string>(JSON.stringify(settings));

  const isDev = process.env.NEXT_PUBLIC_ENV !== "production" && (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENV === "development");
  const liquidMotion = settings.liquidMotion ?? true;
  const showSpatialCanvas = isDev || !liquidMotion;

  // If user hasn't edited anything yet, update baseline whenever settings sync from DB/auth
  useEffect(() => {
    if (!hasUserEdited) {
      baselineSettingsRef.current = JSON.stringify(settings);
    }
  }, [settings, hasUserEdited]);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setHasUserEdited(true);
    rawUpdateSettings(updates);
  }, [rawUpdateSettings]);

  const isDirty = hasUserEdited && JSON.stringify(settings) !== baselineSettingsRef.current;

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
      baselineSettingsRef.current = JSON.stringify(settings);
      setHasUserEdited(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      console.error("Failed to save settings to cloud", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreDefaults = () => {
    updateSettings(DEFAULT_SETTINGS);
  };

  return (
    <div className="flex flex-col h-full w-full min-h-0 relative">
      {/* ── App Settings Header Bar with Floating Dialogue Box ── */}
      <div className="shrink-0 w-full pb-3 mb-4 border-b border-foreground/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sliders className="w-5 h-5 text-foreground/80 shrink-0" />
          <h2 className="text-lg sm:text-2xl font-black text-foreground truncate">{onlyVisuals ? 'Room Visuals' : 'App Settings'}</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* ── Conditional Unsaved Changes Floating Dialogue Capsule ── */}
          <AnimatePresence>
            {isDirty && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -8 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-foreground/10 dark:bg-white/10 backdrop-blur-3xl border border-foreground/20 dark:border-white/20 shadow-2xl shrink-0"
              >
                <span className="hidden md:inline-block text-[10px] font-semibold text-warn-600 dark:text-warn-400 animate-pulse mr-1">
                  Unsaved Changes
                </span>

                {/* Default Settings Button */}
                <button
                  onClick={handleRestoreDefaults}
                  className="px-2.5 py-1.5 rounded-xl bg-foreground/10 hover:bg-foreground/20 text-foreground font-bold text-xs transition-all active:scale-95 border border-foreground/15 flex items-center gap-1.5 shrink-0"
                  title="Reset to default system settings"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-foreground/70" />
                  <span className="hidden sm:inline">Default Settings</span>
                </button>

                {/* Save Changes Button */}
                <button
                  onClick={handleSaveToCloud}
                  disabled={isSaving}
                  className="px-3 py-1.5 rounded-xl text-white font-black text-xs transition-all active:scale-95 border border-(--accent-border) flex items-center gap-1.5 shadow-lg shrink-0 hover:opacity-90"
                  style={{
                    background: "var(--accent-gradient)",
                    boxShadow: "0 8px 24px var(--accent-glow)",
                  }}
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : saveSuccess ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{isSaving ? "Saving..." : saveSuccess ? "Saved!" : "Save Changes"}</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 sm:p-2.5 rounded-full bg-foreground/10 hover:bg-foreground/20 active:bg-foreground/30 text-foreground transition-all cursor-pointer shrink-0 border border-foreground/10 shadow-xs"
              title="Close"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div
        className={cn(
          'space-y-6',
          isEmbedded
            ? 'w-full'
            : 'flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar pb-10 overscroll-contain'
        )}
        {...(!isEmbedded && { 'data-lenis-prevent': 'true' })}
      >

        {/* Gradient & Lighting Theme Editor */}
        <section className={cn(
          onlyVisuals
            ? 'pb-2'
            : 'p-5 rounded-3xl bg-foreground/5 border border-foreground/10 shadow-lg'
        )}>
          <div className="flex items-center justify-between mb-2">
            {/* In the room modal the panel title already says "Room Visuals" — don't repeat it. */}
            {!onlyVisuals && (
              <div className="flex items-center gap-2">
                <Palette className="w-4 sm:w-5 h-4 sm:h-5 text-foreground/70" />
                <h3 className="text-base sm:text-lg font-bold text-foreground">Theme & Gradient Editor</h3>
              </div>
            )}
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-foreground/10 text-foreground/70 border border-foreground/10">
              {settings.gradientSettings?.presetName || "Custom Theme"}
            </span>
          </div>

          <p className="text-xs text-foreground/60 mb-4">
            Select a pro palette preset or customize gradient color stops to dynamically style your room's ambient lighting and visualizer background.
          </p>

          {/* Interactive Demo Room Canvas with Draggable 2D Light Nodes (Development or Static Node Mode Only) */}
          {showSpatialCanvas && (
            <div className="mb-5">
              <div className="text-[10px] font-semibold text-foreground/40 mb-1.5 flex items-center justify-between">
                <span>Interactive Demo Room Screen (Spatial Lighting)</span>
                <span className="text-[9px] text-foreground/50 font-bold ">Drag Nodes to Reposition</span>
              </div>
              <RoomPreview
                onInteractionStateChange={onInteractionStateChange}
                onUpdateSettings={updateSettings}
              />
            </div>
          )}

          {/* Live Gradient Preview Bar */}
          <div className="mb-5">
            <div className="text-[10px] font-semibold text-foreground/40 mb-1.5 flex items-center justify-between">
              <span>Live Gradient Preview</span>
              <span className="font-mono text-foreground/50">
                {(settings.gradientSettings?.nodes || []).length} Color Stops
              </span>
            </div>
            <div 
              className="w-full h-14 rounded-2xl border border-foreground/15 shadow-inner transition-all duration-500 relative overflow-hidden"
              style={{
                background: `linear-gradient(90deg, ${[...(settings.gradientSettings?.nodes || [
                  { id: "1", color: "#8b5cf6", position: 0 },
                  { id: "2", color: "#ec4899", position: 50 },
                  { id: "3", color: "#3b82f6", position: 100 }
                ])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(n => `${n.color} ${n.position ?? 0}%`).join(', ')})`
              }}
            />
          </div>

          {/* Ambient Lighting Intensity & Contrast Controls */}
          <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-foreground/3 border border-foreground/10">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-[var(--accent-color)]" /> Ambient Light Brightness
                </span>
                <span className="font-mono text-[10px] text-foreground/50">{settings.ambientBrightness || 100}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="200"
                value={settings.ambientBrightness || 100}
                onChange={(e) => updateSettings({ ambientBrightness: Number(e.target.value) })}
                style={{
                  background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${((settings.ambientBrightness || 100) - 20) / 1.8}%, rgba(255, 255, 255, 0.15) ${((settings.ambientBrightness || 100) - 20) / 1.8}%, rgba(255, 255, 255, 0.15) 100%)`
                }}
                className="w-full h-1.5 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent-color)] [&::-webkit-slider-thumb]:shadow-[0_0_10px_var(--accent-glow)]"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-purple-400" /> Color Contrast & Saturation
                </span>
                <span className="font-mono text-[10px] text-foreground/50">{settings.ambientContrast || 100}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                value={settings.ambientContrast || 100}
                onChange={(e) => updateSettings({ ambientContrast: Number(e.target.value) })}
                style={{
                  background: `linear-gradient(to right, #a855f7 0%, #a855f7 ${((settings.ambientContrast || 100) - 50) / 1.5}%, rgba(255, 255, 255, 0.15) ${((settings.ambientContrast || 100) - 50) / 1.5}%, rgba(255, 255, 255, 0.15) 100%)`
                }}
                className="w-full h-1.5 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(168,85,247,0.9)]"
              />
            </div>
          </div>

          {/* Audio Visualizer Debug Overlay (HUD) Toggle Switch (Dev Only) */}
          {process.env.NEXT_PUBLIC_ENV !== "production" && process.env.NODE_ENV === "development" && (
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-foreground/3 border border-foreground/10 mb-5">
              <div className="space-y-0.5 pr-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-bold text-foreground">Audio Visualizer Debug HUD Overlay (Dev)</span>
                </div>
                <p className="text-[10px] text-foreground/50">
                  Live 6-band FFT energies, beat thresholds & onsets. (Hotkey: <kbd className="px-1 py-0.5 rounded bg-foreground/10 font-mono text-[9px] text-foreground/80">Shift + D</kbd>)
                </p>
              </div>
              <button
                type="button"
                onClick={() => updateSettings({ showDebugAudio: !settings.showDebugAudio })}
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors duration-200 border border-foreground/10 cursor-pointer p-0.5 shrink-0",
                  settings.showDebugAudio ? "bg-cyan-500 border-cyan-400" : "bg-foreground/10"
                )}
              >
                <div
                  className={cn(
                    "w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-md",
                    settings.showDebugAudio ? "translate-x-6" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          )}

          {/* Auto Liquid Motion Drift Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-foreground/3 border border-foreground/10 mb-5">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--accent-color)]" />
                <span className="text-xs font-bold text-foreground">Auto Liquid Motion Drift</span>
              </div>
              <span className="text-[10px] text-foreground/50 mt-0.5 max-w-70">
                Nodes smoothly glide and flow across the room like liquid lava in sync with the track's beat.
              </span>
            </div>
            <button
              type="button"
              onClick={() => updateSettings({ liquidMotion: !(settings.liquidMotion ?? true) })}
              className={cn(
                "relative w-12 h-6 rounded-full transition-colors duration-200 border border-foreground/10 cursor-pointer p-0.5 shrink-0",
                (settings.liquidMotion ?? true) ? "bg-warn-500 border-warn-400" : "bg-foreground/10"
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-md",
                  (settings.liquidMotion ?? true) ? "translate-x-6" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* Quick Color Count Presets Switcher */}
          <div className="mb-5 p-3.5 rounded-2xl bg-foreground/3 border border-foreground/10">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-semibold text-foreground/50 block">
                Select Theme Palette Size
              </label>
              <span className="text-[9px] font-bold text-foreground/40 ">
                2 to 6 Colors
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {[
                { count: 2, label: "2 Colors" },
                { count: 3, label: "3 Colors" },
                { count: 4, label: "4 Colors" },
                { count: 5, label: "5 Colors" },
                { count: 6, label: "6 Colors" },
              ].map(({ count, label }) => {
                const currentCount = (settings.gradientSettings?.nodes || []).length;
                const isActive = currentCount === count;
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => {
                      const existingNodes = settings.gradientSettings?.nodes || [];

                      const targetPreset = GRADIENT_PRESETS[count]?.[0];
                      if (targetPreset) {
                        const updatedNodes = targetPreset.nodes.map((n, idx) => ({
                          ...n,
                          x: existingNodes[idx]?.x ?? DEFAULT_NODE_POSITIONS[count]?.[idx]?.x ?? (20 + idx * 25),
                          y: existingNodes[idx]?.y ?? DEFAULT_NODE_POSITIONS[count]?.[idx]?.y ?? (35 + (idx % 2) * 30),
                        }));
                        updateSettings({
                          activeLightCount: count,
                          gradientSettings: { presetName: targetPreset.name, nodes: updatedNodes },
                        });
                      }
                    }}
                    className={cn(
                      'py-2 px-3 rounded-xl text-center transition-all border font-bold text-xs',
                      isActive
                        ? 'bg-foreground text-background border-foreground shadow-md scale-[1.02]'
                        : 'bg-foreground/3 text-foreground/70 border-foreground/10 hover:bg-foreground/10'
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Tailored Presets Grid */}
          <div className="mb-6 space-y-2">
            <label className="text-[10px] font-semibold text-foreground/40 block">
              {(settings.gradientSettings?.nodes || []).length}-Color Presets
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(() => {
                const currentCount = (settings.gradientSettings?.nodes || []).length;

                const activePresets = getVisiblePresets(currentCount);

                return activePresets.map((preset) => {
                  const isActive = settings.gradientSettings?.presetName === preset.name;
                  const gradientStr = `linear-gradient(90deg, ${[...preset.nodes].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(n => `${n.color} ${n.position ?? 0}%`).join(', ')})`;

                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        const existingNodes = settings.gradientSettings?.nodes || [];
                        const updatedNodes = preset.nodes.map((n, idx) => ({
                          ...n,
                          x: existingNodes[idx]?.x ?? DEFAULT_NODE_POSITIONS[preset.nodes.length]?.[idx]?.x ?? (20 + idx * 25),
                          y: existingNodes[idx]?.y ?? DEFAULT_NODE_POSITIONS[preset.nodes.length]?.[idx]?.y ?? (35 + (idx % 2) * 30),
                        }));
                        updateSettings({
                          gradientSettings: { presetName: preset.name, nodes: updatedNodes },
                        });
                      }}
                      className={cn(
                        'p-2.5 rounded-2xl border transition-all flex flex-col gap-2 text-left relative overflow-hidden group',
                        isActive ? 'bg-foreground/10 border-foreground shadow-md scale-[1.02]' : 'bg-foreground/5 border-foreground/10 hover:border-foreground/20'
                      )}
                    >
                      <div className="w-full h-5 rounded-lg border border-foreground/10 shadow-sm" style={{ background: gradientStr }} />
                      <span className="text-xs font-bold text-foreground truncate">{preset.name}</span>
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          {/* Color Picker, Rainbow Spectrum & Position Editor */}
          <div className="space-y-4 mb-5">
            <label className="text-[10px] font-semibold text-foreground/40 block">Custom Frequency Band Colors, Spectrum & Spatial Positions</label>
            <div className="space-y-3">
              {(settings.gradientSettings?.nodes || [
                { id: "1", color: "#8b5cf6", position: 0 },
                { id: "2", color: "#ec4899", position: 50 },
                { id: "3", color: "#3b82f6", position: 100 }
              ]).map((node, idx, arr) => {
                const currentHue = hexToHue(node.color);
                const bandNames = AUDIO_BAND_NAMES[arr.length] || AUDIO_BAND_NAMES[3];
                const bandName = bandNames[idx] || `Band ${idx + 1}`;
                return (
                  <div key={node.id} className="p-3.5 rounded-2xl bg-foreground/3 border border-foreground/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="relative w-7 h-7 rounded-xl shadow-sm border border-foreground/20 cursor-pointer overflow-hidden shrink-0" style={{ background: node.color }}>
                          <input
                            type="color"
                            value={node.color}
                            onChange={(e) => {
                              const updated = (settings.gradientSettings?.nodes || []).map((n) =>
                                n.id === node.id ? { ...n, color: e.target.value } : n
                              );
                              updateSettings({
                                gradientSettings: { presetName: "Custom", nodes: updated },
                              });
                            }}
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                          />
                        </label>
                        <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                          {bandName}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {(settings.gradientSettings?.nodes || []).length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (settings.gradientSettings?.nodes || []).filter((n) => n.id !== node.id);
                              updateSettings({
                                gradientSettings: { presetName: "Custom", nodes: updated },
                              });
                            }}
                            className="p-1 rounded-lg text-foreground/40 hover:text-bad-700 dark:text-bad-400 hover:bg-bad-500/10 transition-colors"
                            title={`Delete ${bandName} Color`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Rainbow Color Spectrum Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[9px] text-foreground/40 font-bold ">
                        <span>Color Spectrum (Hue)</span>
                        <span className="font-mono">{currentHue}°</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={currentHue}
                        onChange={(e) => {
                          const newHue = Number(e.target.value);
                          const s = 85 / 100, l = 60 / 100;
                          const k = (n: number) => (n + newHue / 30) % 12;
                          const a = s * Math.min(l, 1 - l);
                          const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
                          const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
                          const hexColor = `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;

                          const updated = (settings.gradientSettings?.nodes || []).map((n) =>
                            n.id === node.id ? { ...n, color: hexColor } : n
                          );
                          updateSettings({
                            gradientSettings: { presetName: "Custom", nodes: updated },
                          });
                        }}
                        className="w-full h-2.5 rounded-lg cursor-pointer appearance-none bg-transparent"
                        style={{
                          background: `linear-gradient(to right, #ef4444, #f97316, #eab308, #10b981, #06b6d4, #3b82f6, #a855f7, #ec4899, #ef4444)`
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {(settings.gradientSettings?.nodes || []).length < 6 && (
                <button
                  type="button"
                  onClick={() => {
                    const currentNodes = settings.gradientSettings?.nodes || [];
                    const newNode: GradientNode = {
                      id: `node-${Date.now()}`,
                      color: "#ec4899",
                      position: 50,
                    };
                    updateSettings({
                      gradientSettings: {
                        presetName: "Custom",
                        nodes: [...currentNodes, newNode].sort((a, b) => a.position - b.position),
                      },
                    });
                  }}
                  className="w-full py-2.5 rounded-2xl border border-dashed border-foreground/20 text-xs font-bold text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-all flex items-center justify-center gap-1.5 mt-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Frequency Color
                </button>
              )}
            </div>
          </div>
          <div className="mt-6">
            <button 
              onClick={() => updateSettings({
                gradientSettings: {
                  presetName: "Cyber Neon",
                  nodes: [
                    { id: "node-1", color: "#8b5cf6", position: 0 },
                    { id: "node-2", color: "#ec4899", position: 50 },
                    { id: "node-3", color: "#3b82f6", position: 100 },
                  ],
                },
                ambientColors: { subHue: 320, bassHue: 0, lowMidHue: 40, midHue: 120, upperMidHue: 200, highHue: 280 },
                ambientBrightness: 100,
                ambientContrast: 100
              })}
              className="w-full py-2.5 rounded-xl bg-foreground/5 text-foreground/70 text-sm font-bold flex items-center justify-center gap-2 hover:bg-foreground/10 transition border border-foreground/10"
            >
              <RefreshCw className="w-4 h-4" /> Reset Default Theme
            </button>
          </div>
        </section>

        {!onlyVisuals && (
          /* Sync Settings */
          <section className="p-5 rounded-3xl bg-foreground/5 border border-foreground/10 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-foreground/70" />
              <h3 className="text-lg font-bold text-foreground">Synchronization</h3>
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-xs font-bold text-foreground/50">Audio Latency Offset (ms)</label>
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
                <label className="text-xs font-bold text-foreground/50 block mb-2">Sync Aggressiveness</label>
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
        )}

        {!onlyVisuals && (
          <>
            {/* Screen Awake Feature */}
            <section className="p-5 rounded-3xl bg-foreground/5 border border-foreground/10 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sun className="w-5 h-5 text-warn-800 dark:text-warn-400" />
                  <h3 className="text-lg font-bold text-foreground">Screen & Display</h3>
                </div>
                {settings.keepScreenAwake && (
                  <span className="px-2.5 py-0.5 rounded-full bg-warn-500/15 border border-warn-500/30 text-warn-600 dark:text-warn-400 text-[9px] font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-warn-400 animate-pulse" />
                    Awake Active
                  </span>
                )}
              </div>
              <p className="text-xs text-foreground/60 mb-4">
                Keep your device screen awake during room listening sessions to prevent browser audio throttling and tab sleep.
              </p>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-foreground/3 border border-foreground/5">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">Keep Screen Awake</span>
                  <span className="text-[10px] text-foreground/40">Uses Web Screen Wake Lock API</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateSettings({ keepScreenAwake: !settings.keepScreenAwake })}
                  className={cn(
                    "relative w-12 h-6 rounded-full transition-colors duration-200 border border-foreground/10 cursor-pointer p-0.5",
                    settings.keepScreenAwake ? "bg-warn-500 border-warn-400" : "bg-foreground/10"
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

              {/* Room Sidebar Position */}
              <div className="mt-4 pt-4 border-t border-foreground/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">Room Sidebar Position</span>
                    <span className="text-[10px] text-foreground/40">Choose where the room sidebar is docked on desktop</span>
                  </div>
                  <span className="text-[10px] font-semibold text-foreground/50">
                    {settings.sidebarPosition === "right" ? "Right" : "Left (Default)"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => updateSettings({ sidebarPosition: "left" })}
                    className={cn(
                      "py-2 px-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 cursor-pointer",
                      (settings.sidebarPosition ?? "left") === "left"
                        ? "bg-foreground text-background border-foreground shadow-sm"
                        : "bg-foreground/5 text-foreground/70 border-foreground/10 hover:bg-foreground/10"
                    )}
                  >
                    <PanelLeft className="w-3.5 h-3.5" />
                    <span>Left (Default)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ sidebarPosition: "right" })}
                    className={cn(
                      "py-2 px-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 cursor-pointer",
                      settings.sidebarPosition === "right"
                        ? "bg-foreground text-background border-foreground shadow-sm"
                        : "bg-foreground/5 text-foreground/70 border-foreground/10 hover:bg-foreground/10"
                    )}
                  >
                    <PanelRight className="w-3.5 h-3.5" />
                    <span>Right</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Dynamic Island Customizer Section */}
            <section className="p-5 rounded-3xl bg-foreground/5 border border-foreground/10 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <Radio className="w-5 h-5 text-purple-400" />
                <h3 className="text-lg font-bold text-foreground">Dynamic Island Customizer</h3>
              </div>
              <p className="text-xs text-foreground/60 mb-4">
                Customize the glow theme, artwork display, and auto-shrink behavior of your Dynamic Island player.
              </p>

              <div className="space-y-4">
                {/* Glow Accent Theme */}
                <div>
                  <label className="text-[10px] font-semibold text-foreground/40 block mb-2">Glow Accent Theme</label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {[
                      { id: "violet", label: "Violet", color: "bg-purple-500" },
                      { id: "cyan", label: "Cyan", color: "bg-cyan-500" },
                      { id: "emerald", label: "Emerald", color: "bg-[#10b981]" },
                      { id: "amber", label: "Amber", color: "bg-[#f59e0b]" },
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
                            : 'bg-foreground/3 text-foreground/70 border-foreground/5 hover:bg-foreground/10'
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
                  <label className="text-[10px] font-semibold text-foreground/40 block mb-2">Auto-Shrink Delay</label>
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
                            : 'bg-foreground/3 text-foreground/70 border-foreground/5 hover:bg-foreground/10'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Show Album Art Toggle */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-foreground/3 border border-foreground/5">
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
