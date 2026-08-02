import React, { useState } from 'react';
import { Settings as SettingsIcon, Sliders, Volume2, Shield, Moon, Monitor, HardDrive } from 'lucide-react';
import { authStore } from '../store/authStore';
import { DeviceIdentity } from '../store/deviceIdentity';
import { apiClient } from '../services/apiClient';

export const SettingsView: React.FC = () => {
  const user = authStore.user;
  const device = DeviceIdentity.getInstance();
  const [serverUrl, setServerUrl] = useState(apiClient.baseURL);

  return (
    <div className="h-full w-full p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar select-none">
      <div>
        <h1 className="text-2xl font-bold text-white font-display tracking-tight flex items-center gap-2.5">
          <SettingsIcon className="w-6 h-6 text-purple-400" />
          Settings
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure server endpoints, audio preferences, and Windows app features.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Account & Identity */}
        <div className="glass-panel p-5 rounded-2xl border border-white/10 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-white/10 pb-3">
            <Shield className="w-4 h-4 text-purple-400" />
            Account & Identity
          </h3>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Signed in as</span>
            <span className="text-sm font-semibold text-white">{user?.displayName || 'Windows Guest'}</span>
            <span className="text-xs font-mono text-purple-300">{user?.email || 'Guest Account'}</span>
          </div>

          <div className="flex flex-col gap-1 pt-2 border-t border-white/10">
            <span className="text-xs text-slate-400">Windows Device GUID</span>
            <span className="text-xs font-mono text-slate-300 break-all">{device.deviceId}</span>
          </div>

          <button
            onClick={() => authStore.signOut()}
            className="mt-2 w-full py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold border border-red-500/30 transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* Server & Network Settings */}
        <div className="glass-panel p-5 rounded-2xl border border-white/10 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-white/10 pb-3">
            <Monitor className="w-4 h-4 text-purple-400" />
            Server & Sync Engine
          </h3>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-300">Backend Server URL</label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => {
                setServerUrl(e.target.value);
                apiClient.baseURL = e.target.value;
              }}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-white/10 text-xs">
            <span className="text-slate-300">Windows 11 Mica Glass</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px]">
              Enabled
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300">NTP Hardware Timer</span>
            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-[10px]">
              Sub-ms Precision
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
