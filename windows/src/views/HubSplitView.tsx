import React, { useState } from 'react';
import {
  Radio,
  Plus,
  LogIn,
  Search as SearchIcon,
  HardDrive,
  ListMusic,
  Laptop,
  Settings as SettingsIcon,
  UserCheck,
  Zap,
  Music,
} from 'lucide-react';
import { roomSocket } from '../services/roomSocket';
import { apiClient } from '../services/apiClient';
import { SongsView } from './SongsView';
import { PlaylistDetailView } from './PlaylistDetailView';
import { SearchView } from './SearchView';
import { DevicesView } from './DevicesView';
import { SettingsView } from './SettingsView';

export type TabType = 'queue' | 'search' | 'local' | 'devices' | 'settings';

export const HubSplitView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('queue');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [roomNameInput, setRoomNameInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const room = await apiClient.createRoom(roomNameInput || 'Windows Party');
      roomSocket.joinRoom(room.id || room.code);
    } catch {
      // Demo fallback room code generator
      const mockCode = Math.floor(100000 + Math.random() * 900000).toString();
      roomSocket.joinRoom(mockCode);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCodeInput.trim()) return;
    setJoining(true);
    roomSocket.joinRoom(roomCodeInput.trim());
    setJoining(false);
  };

  return (
    <div className="h-full w-full flex overflow-hidden select-none">
      {/* Sidebar Navigation matching HubSplitView.swift */}
      <div className="w-64 glass-panel border-r border-white/10 p-4 flex flex-col justify-between shrink-0 z-20">
        <div className="flex flex-col gap-6">
          {/* Room Hub Banner / Join box */}
          <div className="glass-panel p-4 rounded-2xl border border-purple-500/30 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-300 font-display flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                {roomSocket.isInRoom ? `Room ${roomSocket.roomId}` : 'Room Hub'}
              </span>
              {roomSocket.isInRoom && (
                <button
                  onClick={() => roomSocket.leaveRoom()}
                  className="text-[10px] text-red-400 hover:text-red-300 underline"
                >
                  Leave
                </button>
              )}
            </div>

            {!roomSocket.isInRoom ? (
              <div className="flex flex-col gap-2">
                <form onSubmit={handleJoinRoom} className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="6-digit code"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all shrink-0"
                  >
                    Join
                  </button>
                </form>

                <form onSubmit={handleCreateRoom}>
                  <button
                    type="submit"
                    className="w-full py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-purple-400" />
                    <span>Create Room</span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Connected & Synced
                </span>
                <span className="text-slate-400 text-[11px]">
                  {roomSocket.participants.length} Participant(s)
                </span>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1">
            <button
              onClick={() => setActiveTab('queue')}
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 transition-all ${
                activeTab === 'queue'
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-950/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <ListMusic className="w-4 h-4" />
              <span>Room Queue</span>
            </button>

            <button
              onClick={() => setActiveTab('search')}
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 transition-all ${
                activeTab === 'search'
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-950/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <SearchIcon className="w-4 h-4" />
              <span>Search Catalog</span>
            </button>

            <button
              onClick={() => setActiveTab('local')}
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 transition-all ${
                activeTab === 'local'
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-950/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              <span>Local Music Library</span>
            </button>

            <button
              onClick={() => setActiveTab('devices')}
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 transition-all ${
                activeTab === 'devices'
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-950/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Laptop className="w-4 h-4" />
              <span>Devices</span>
            </button>
          </nav>
        </div>

        {/* Bottom Settings Button */}
        <button
          onClick={() => setActiveTab('settings')}
          className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 transition-all ${
            activeTab === 'settings'
              ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 h-full overflow-hidden bg-black/40">
        {activeTab === 'queue' && <PlaylistDetailView />}
        {activeTab === 'search' && <SearchView />}
        {activeTab === 'local' && <SongsView />}
        {activeTab === 'devices' && <DevicesView />}
        {activeTab === 'settings' && <SettingsView />}
      </div>
    </div>
  );
};
