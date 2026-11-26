"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAmbientMode } from '../../hooks/useAmbientMode';
import type { AmbientMode } from '../../lib/ambientPreferences';

const MODES: { value: AmbientMode; label: string; description: string }[] = [
  { value: 'off', label: 'Off', description: 'A plain background throughout the site.' },
  { value: 'normal', label: 'Normal', description: 'Your palette, with gentle movement that follows the music.' },
  { value: 'auto', label: 'Auto', description: 'Gentle motion using colors from the current album cover.' },
  // Retain the stored key so existing device choices keep working.
  { value: 'immersive', label: 'Aggressive', description: 'Stronger liquid waves and ripples that react to the music. Uses more power.' },
];

export function AmbientModeControl({ compact = false, expanded = false }: { compact?: boolean; expanded?: boolean }) {
  const { mode, setMode, immersiveIntensity, setImmersiveIntensity } = useAmbientMode();
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    if (confirming) dialogRef.current?.showModal();
  }, [confirming]);
  const chooseMode = (next: AmbientMode) => {
    if (next === 'immersive' && mode !== 'immersive') setConfirming(true);
    else setMode(next);
  };

  return (
    <div data-ambient-mode-control className={compact ? 'w-full' : 'mb-5 rounded-2xl border border-foreground/10 p-4'}>
      {expanded ? (
        <fieldset>
          <legend className="text-sm font-semibold text-foreground">Ambient background</legend>
          <p className="mt-1 mb-4 text-xs leading-relaxed text-foreground/60">Choose backgrounds across the site. Your choice saves automatically on this device.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MODES.map(option => (
              <label key={option.value} className="relative cursor-pointer">
                <input type="radio" name={`${id}-mode`} value={option.value} checked={mode === option.value}
                  onChange={() => chooseMode(option.value)} className="peer sr-only" />
                <span className={`flex h-full min-h-24 gap-3 rounded-xl border p-3.5 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground ${mode === option.value ? 'border-foreground/50 bg-foreground/5' : 'border-foreground/15 hover:bg-foreground/3'}`}>
                  <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${mode === option.value ? 'border-foreground' : 'border-foreground/30'}`}>
                    {mode === option.value && <span className="h-2 w-2 rounded-full bg-foreground" />}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-foreground/60">{option.description}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : compact ? (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Ambient background</legend>
          <span aria-hidden="true" className="text-xs font-medium text-foreground/60">Background</span>
          <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-foreground/10 bg-foreground/5 p-1">
            {MODES.map(option => (
              <label key={option.value} className="cursor-pointer">
                <input type="radio" name={`${id}-mode`} value={option.value} checked={mode === option.value}
                  onChange={() => chooseMode(option.value)} className="peer sr-only" />
                <span className={`block min-h-8 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foreground ${mode === option.value ? 'bg-foreground text-background' : 'text-foreground/65 hover:bg-foreground/10 hover:text-foreground'}`}>
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
      <label className="flex flex-wrap items-center gap-2 text-xs text-foreground/70">
        {!compact && <span className="font-semibold">Background on this device</span>}
        <select
          aria-label="Background on this device"
          value={mode}
          onChange={event => chooseMode(event.target.value as AmbientMode)}
          className="min-h-11 md:min-h-8 max-w-full rounded-full border border-foreground/15 bg-background px-3 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <option value="off">Background off</option>
          <option value="normal">Normal</option>
          <option value="auto">Auto · album colors</option>
          <option value="immersive">Aggressive · high power</option>
        </select>
      </label>
      )}
      {mode === 'immersive' && <label htmlFor={`${id}-intensity`} className={`mt-3 flex items-center gap-3 text-xs text-foreground/70 ${compact ? 'max-w-60' : ''}`}>
        <span className="shrink-0">Intensity</span>
        <input id={`${id}-intensity`} type="range" min={20} max={100} step={5} value={immersiveIntensity}
          onChange={event => setImmersiveIntensity(Number(event.target.value))}
          aria-label="Aggressive intensity" aria-valuetext={`${immersiveIntensity}%`}
          className="h-6 min-w-0 flex-1 cursor-pointer accent-foreground" />
        <output htmlFor={`${id}-intensity`} className="w-8 shrink-0 tabular-nums">{immersiveIntensity}%</output>
      </label>}
      {!compact && !expanded && <p className="mt-2 text-xs leading-relaxed text-foreground/60">Normal uses your palette and reacts gently to the music. Auto follows the album cover using the same lighter effect. Aggressive turns the music into stronger liquid waves and ripples. It uses more power. These choices stay on this device.</p>}
      {confirming && createPortal(
        <dialog
          ref={dialogRef}
          aria-labelledby={id + '-title'} aria-describedby={id + '-description'}
          onClose={() => setConfirming(false)}
          onKeyDown={event => event.stopPropagation()}
          onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
          className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl border border-foreground/15 bg-background p-0 text-foreground shadow-xl backdrop:bg-black/60"
        >
          <div className="p-5">
            <h2 id={id + '-title'} className="text-lg font-semibold">Enable Aggressive background?</h2>
            <p id={id + '-description'} className="mt-3 text-sm leading-relaxed text-foreground/70">This richer effect uses more graphics power and battery. For longer sessions, keep this device connected to power.</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button autoFocus type="button" onClick={() => dialogRef.current?.close()} className="min-h-11 rounded-xl border border-foreground/15 px-3 text-sm">Keep current mode</button>
              <button type="button" onClick={() => { setMode('immersive', true); dialogRef.current?.close(); }} className="min-h-11 rounded-xl bg-foreground px-3 text-sm text-background">Enable Aggressive</button>
            </div>
          </div>
        </dialog>, document.body
      )}
    </div>
  );
}
