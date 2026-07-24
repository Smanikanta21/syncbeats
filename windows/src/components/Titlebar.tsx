import React, { useEffect, useState } from 'react';
import { Minus, Square, X, Music, Radio } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

export const Titlebar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    try {
      invoke('apply_mica_effect').catch(() => {});
    } catch {}
  }, []);

  const handleMinimize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch {}
  };

  const handleMaximize = async () => {
    try {
      const appWindow = getCurrentWindow();
      if (await appWindow.isMaximized()) {
        await appWindow.unmaximize();
        setIsMaximized(false);
      } else {
        await appWindow.maximize();
        setIsMaximized(true);
      }
    } catch {}
  };

  const handleClose = async () => {
    try {
      const appWindow = getCurrentWindow();
      // Hide to system tray instead of exiting immediately
      await appWindow.hide();
    } catch {}
  };

  return (
    <div
      data-tauri-drag-region
      className="h-10 w-full bg-black/40 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-4 select-none z-50 shrink-0"
    >
      <div className="flex items-center gap-2.5 pointer-events-none">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <Music className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold tracking-wide text-slate-200 font-display">
          SyncBeats
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
          Windows
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={handleMinimize}
          className="w-8 h-7 rounded hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-7 rounded hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          title="Maximize"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-7 rounded hover:bg-red-500/80 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          title="Close to Tray"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
