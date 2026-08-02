import React, { useState, useEffect } from 'react';
import { authStore, AuthState } from './store/authStore';
import { Titlebar } from './components/Titlebar';
import { FloatingIsland } from './components/FloatingIsland';
import { NowPlayingBar } from './components/NowPlayingBar';
import { HubSplitView } from './views/HubSplitView';
import { SignInView } from './views/SignInView';
import { listen } from '@tauri-apps/api/event';
import { playerEngine } from './services/playerEngine';

export const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>(authStore.state);

  useEffect(() => {
    const unsubAuth = authStore.subscribe(() => {
      setAuthState(authStore.state);
    });

    // Listen for global media key events from Rust Windows SMTC
    let unlistenFn: (() => void) | null = null;
    try {
      listen<string>('windows-media-key', (event) => {
        const action = event.payload;
        if (action === 'play' || action === 'pause' || action === 'toggle') {
          playerEngine.togglePlayPause();
        } else if (action === 'next') {
          playerEngine.next();
        } else if (action === 'prev') {
          playerEngine.prev();
        }
      }).then((unlisten) => {
        unlistenFn = unlisten;
      });
    } catch {}

    return () => {
      unsubAuth();
      if (unlistenFn) unlistenFn();
    };
  }, []);

  if (authState === 'loading') {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (authState === 'signedOut') {
    return (
      <div className="h-screen w-screen flex flex-col bg-black overflow-hidden select-none">
        <Titlebar />
        <div className="flex-1 overflow-hidden">
          <SignInView />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-black overflow-hidden select-none relative">
      {/* Frameless Windows Titlebar */}
      <Titlebar />

      {/* Floating Dynamic Island Widget overlay */}
      <FloatingIsland />

      {/* Main Split Navigation & Content View */}
      <div className="flex-1 overflow-hidden relative z-10">
        <HubSplitView />
      </div>

      {/* Persistent Bottom Now Playing Bar */}
      <NowPlayingBar />
    </div>
  );
};
