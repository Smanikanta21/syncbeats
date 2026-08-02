import React, { useState } from 'react';
import { FolderOpen, Music, Play, Plus, HardDrive, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { playerEngine, PlayableTrack } from '../services/playerEngine';

export interface LocalTrack {
  file_path: string;
  title: string;
  artist: string;
  album: string;
  duration_seconds: number;
  cover_art_base64?: string;
}

export const SongsView: React.FC = () => {
  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([]);
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const handlePickFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Music Directory',
      });
      if (selected && typeof selected === 'string') {
        setFolderPath(selected);
        scanFolder(selected);
      }
    } catch {
      // Demo mock folder if running without native dialog backend
      const mockTracks: LocalTrack[] = [
        {
          file_path: 'C:\\Music\\Synthwave_Dream.mp3',
          title: 'Synthwave Dream',
          artist: 'Neon Cyber',
          album: 'Future Horizon',
          duration_seconds: 215,
        },
        {
          file_path: 'C:\\Music\\Sub_Bass_Sync.flac',
          title: 'Sub Bass Sync',
          artist: 'Beats Division',
          album: 'Sonic Echo',
          duration_seconds: 184,
        },
      ];
      setLocalTracks(mockTracks);
      setFolderPath('C:\\Music');
    }
  };

  const scanFolder = async (path: string) => {
    setScanning(true);
    try {
      const tracks = await invoke<LocalTrack[]>('scan_local_folder', { folderPath: path });
      setLocalTracks(tracks);
    } catch (err) {
      console.error('Failed to scan folder:', err);
    } finally {
      setScanning(false);
    }
  };

  const playLocalTrack = (track: LocalTrack, index: number) => {
    const queueTracks: PlayableTrack[] = localTracks.map((t) => ({
      id: t.file_path,
      title: t.title,
      artist: t.artist,
      artworkURL: t.cover_art_base64,
      duration: t.duration_seconds,
      isLocal: true,
    }));
    playerEngine.playQueue(queueTracks, index);
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="h-full w-full p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar select-none">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-display tracking-tight flex items-center gap-2.5">
            <HardDrive className="w-6 h-6 text-purple-400" />
            Local Songs & Library
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Scan and stream high-quality local MP3/FLAC files directly to your room participants.
          </p>
        </div>

        <button
          onClick={handlePickFolder}
          disabled={scanning}
          className="px-4 py-2.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-purple-900/20"
        >
          {scanning ? (
            <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
          ) : (
            <FolderOpen className="w-4 h-4 text-purple-400" />
          )}
          <span>{folderPath ? 'Change Folder' : 'Scan Music Directory'}</span>
        </button>
      </div>

      {folderPath && (
        <div className="text-xs font-mono text-slate-400 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 w-fit">
          Folder: {folderPath}
        </div>
      )}

      {localTracks.length === 0 ? (
        <div className="glass-panel p-12 rounded-3xl flex flex-col items-center justify-center text-center gap-3 border border-white/10 my-auto">
          <div className="w-16 h-16 rounded-2xl bg-purple-900/30 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-2">
            <Music className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-white">No Local Tracks Loaded</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            Select a folder on your Windows PC to index audio files with native Rust ID3 tag extraction.
          </p>
          <button
            onClick={handlePickFolder}
            className="mt-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-semibold shadow-lg shadow-purple-500/25 flex items-center gap-2"
          >
            <FolderOpen className="w-4 h-4" />
            <span>Select Folder</span>
          </button>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 font-semibold bg-white/5">
                <th className="py-3 px-4 w-10">#</th>
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Artist</th>
                <th className="py-3 px-4">Album</th>
                <th className="py-3 px-4 text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {localTracks.map((track, i) => (
                <tr
                  key={track.file_path}
                  onClick={() => playLocalTrack(track, i)}
                  className="border-b border-white/5 hover:bg-purple-500/10 cursor-pointer transition-colors group text-slate-200"
                >
                  <td className="py-3 px-4 text-slate-400 group-hover:text-purple-400 font-mono">
                    <Play className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity fill-current" />
                    <span className="group-hover:hidden">{i + 1}</span>
                  </td>
                  <td className="py-3 px-4 font-medium text-white flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-900/40 border border-purple-500/30 flex items-center justify-center overflow-hidden shrink-0">
                      {track.cover_art_base64 ? (
                        <img src={track.cover_art_base64} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Music className="w-4 h-4 text-purple-400" />
                      )}
                    </div>
                    <span>{track.title}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-300">{track.artist}</td>
                  <td className="py-3 px-4 text-slate-400">{track.album}</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-400">
                    {formatDuration(track.duration_seconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
