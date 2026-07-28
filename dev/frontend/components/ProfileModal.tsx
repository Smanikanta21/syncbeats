"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, LogOut, Edit3, Smartphone, Laptop, X, KeyRound, MonitorSmartphone, Settings, ChevronLeft, History, Clock, Search, Loader2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { devicesApi, roomsApi, historyApi, type Device } from "../lib/api";
import { SettingsPanel } from "./SettingsPanel";
import { ForgotPasswordPanel } from "./ForgotPasswordPanel";
import { cn } from "../lib/utils";

function DeviceGlyph({ userAgent }: { userAgent: string | null }) {
  if (userAgent?.includes("iPhone") || userAgent?.includes("Android")) return <Smartphone className="w-5 h-5 text-foreground/70" />;
  return <Laptop className="w-5 h-5 text-foreground/70" />;
}

function getPlatformLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("macintosh")) return "Mac";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("linux")) return "Linux";
  if (ua.includes("android")) return "Android";
  return "Desktop";
}

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * ProfileModalInner — The actual modal content.
 * Only mounts when isOpen=true (controlled by AnimatePresence in the parent).
 * Reads auth data ONCE on mount, then only re-reads when the user explicitly
 * updates their profile (via updateProfile callback). This prevents context-driven
 * re-renders from RoomDashboard or settings sync loops.
 */
function ProfileModalInner({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const auth = useAuth();

  // Snapshot auth data into refs at mount — we read from these during render
  // so context changes don't trigger re-renders.
  const userRef = useRef(auth.user);
  const deviceRef = useRef(auth.device);
  const emailVerifiedRef = useRef(auth.emailVerified);
  const logoutRef = useRef(auth.logout);
  const updateProfileRef = useRef(auth.updateProfile);

  // Keep refs current for callbacks, but DON'T put auth values in state
  useEffect(() => {
    userRef.current = auth.user;
    deviceRef.current = auth.device;
    emailVerifiedRef.current = auth.emailVerified;
    logoutRef.current = auth.logout;
    updateProfileRef.current = auth.updateProfile;
  });

  // Local state for displayed user info — populated from ref on mount
  const [userName, setUserName] = useState(auth.user?.name ?? "");
  const [userEmail] = useState(auth.user?.email ?? "");
  const [userId] = useState(auth.user?.id ?? "");
  const [userCreatedAt] = useState(auth.user?.created_at ?? "");
  const [isVerified] = useState(auth.emailVerified);
  const [currentDeviceId] = useState(auth.device?.id ?? "");

  const [devices, setDevices] = useState<Device[]>([]);
  const [hostedSessionCount, setHostedSessionCount] = useState(0);

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(userName);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Modals / Panels state
  const [activePanel, setActivePanel] = useState<'devices' | 'settings' | 'password' | 'history' | null>(null);
  const [isInteractingWithColors, setIsInteractingWithColors] = useState(false);

  // History State
  const [userHistory, setUserHistory] = useState<{ listens: any[]; searches: any[] }>({ listens: [], searches: [] });
  const [historyTab, setHistoryTab] = useState<'listens' | 'searches'>('listens');
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (activePanel === 'history' && userId) {
      setLoadingHistory(true);
      historyApi.getRecent(userId)
        .then((res) => { if (res) setUserHistory(res); })
        .catch(() => {})
        .finally(() => setLoadingHistory(false));
    }
  }, [activePanel, userId]);

  // Device Renaming state
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState("");
  const [savingDeviceRename, setSavingDeviceRename] = useState(false);

  const displayName = profileName.trim() || userName || "—";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const accountId = userId ? `#SB-${userId.slice(0, 8).toUpperCase()}` : "—";
  const memberSince = userCreatedAt ? new Date(userCreatedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—";

  // Fetch devices and sessions on mount
  useEffect(() => {
    devicesApi.mine().then(({ devices }) => setDevices(devices.filter(d => !d.device_key.startsWith('NATIVE-')))).catch(() => {});
    roomsApi.mine().then(({ rooms }) => setHostedSessionCount(rooms.length)).catch(() => setHostedSessionCount(0));
  }, []);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleLogout = useCallback(() => {
    onClose();
    logoutRef.current();
    router.push("/login");
  }, [onClose, router]);

  const saveEditProfile = useCallback(async () => {
    if (!profileName.trim() || profileName.trim() === userRef.current?.name) {
      setIsEditingProfile(false);
      setProfileName(userRef.current?.name ?? "");
      return;
    }
    setIsSavingProfile(true);
    try {
      await updateProfileRef.current(profileName.trim());
      setUserName(profileName.trim());
      setIsEditingProfile(false);
    } catch (err) {
      console.error("Failed to update profile", err);
      setProfileName(userRef.current?.name ?? "");
    } finally {
      setIsSavingProfile(false);
    }
  }, [profileName]);

  const openDeviceRename = (deviceId: string, currentName: string) => {
    setEditingDeviceId(deviceId);
    setEditingDeviceName(currentName);
  };

  const handleDeviceRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeviceId || !editingDeviceName.trim()) return;

    setSavingDeviceRename(true);
    try {
      await devicesApi.rename(editingDeviceId, editingDeviceName.trim());
      setDevices(devices.map(d =>
        d.id === editingDeviceId ? { ...d, name: editingDeviceName.trim() } : d
      ));
      setEditingDeviceId(null);
    } catch (err) {
      console.error("Failed to rename device:", err);
    } finally {
      setSavingDeviceRename(false);
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    try {
      await devicesApi.remove(deviceId);
      setDevices(devices.filter(d => d.id !== deviceId));
    } catch (err) {
      console.error("Failed to delete device", err);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 pt-24 sm:pt-24 pb-6 overflow-y-auto">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className={cn(
          "fixed inset-0 transition-all duration-300",
          isInteractingWithColors
            ? "bg-transparent backdrop-blur-none opacity-0 pointer-events-none"
            : "bg-black/30 dark:bg-black/40 backdrop-blur-md"
        )}
      />

      {/* Modal Content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={cn(
          "relative z-10 w-full max-w-md md:max-w-4xl flex flex-col md:flex-row items-center md:items-start justify-center gap-6 select-none transition-all duration-300",
          isInteractingWithColors ? "opacity-30 scale-[0.99]" : "opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Main Profile Card - hidden on mobile when activePanel is set */}
        <div className={cn(
          "w-full max-w-md shrink-0 relative rounded-[2.5rem] bg-background/95 dark:bg-black/90 backdrop-blur-3xl border border-foreground/15 shadow-[0_30px_90px_rgba(0,0,0,0.6)] p-6 sm:p-8 flex-col items-center overflow-hidden z-10 transition-all duration-300",
          activePanel ? "hidden md:flex" : "flex",
          isInteractingWithColors ? "bg-background/20 dark:bg-black/30 backdrop-blur-none border-transparent shadow-none" : ""
        )}>
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2.5 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition-all active:scale-95 z-20"
            title="Close Profile"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Avatar Section */}
          <div className="relative mb-5 mt-2">
            <div className="absolute inset-0 bg-foreground/10 blur-2xl rounded-full scale-150" />
            <div className="relative w-28 h-28 rounded-full bg-gradient-to-tr from-foreground/10 to-foreground/5 flex items-center justify-center border border-foreground/20 shadow-xl overflow-hidden backdrop-blur-md">
              <span className="text-3xl font-black text-foreground tracking-widest">{initials}</span>
            </div>
          </div>

          {/* Name & Edit Section */}
          <div className="w-full text-center mb-6 relative">
            {!isEditingProfile ? (
              <div className="flex flex-col items-center group cursor-pointer" onClick={() => setIsEditingProfile(true)}>
                <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight flex items-center gap-2">
                  {displayName}
                  <Edit3 className="w-4 h-4 text-foreground/30 group-hover:text-foreground/70 transition-colors" />
                </h1>
                <p className="text-foreground/50 font-medium text-sm mt-1">{userEmail}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 w-full">
                <input
                  autoFocus
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEditProfile()}
                  className="w-full text-center rounded-2xl border border-foreground/20 bg-foreground/5 px-4 py-3 text-xl font-black tracking-tight text-foreground outline-none transition-colors focus:border-foreground/40 focus:bg-foreground/10"
                  placeholder="Your name"
                />
                <div className="flex items-center gap-2 w-full justify-center">
                  <button onClick={() => { setIsEditingProfile(false); setProfileName(userName); }} className="flex-1 max-w-[120px] py-2.5 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-foreground font-semibold text-xs transition-all">
                    Cancel
                  </button>
                  <button onClick={saveEditProfile} disabled={isSavingProfile} className="flex-1 max-w-[120px] py-2.5 rounded-xl bg-foreground text-background font-bold text-xs transition-all hover:scale-[0.98] disabled:opacity-70">
                    {isSavingProfile ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}

            {/* Status Pills */}
            <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
              {isVerified ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">
                  Unverified
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/60">
                ID: {accountId}
              </span>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="w-full grid grid-cols-2 gap-3 mb-6">
            <div className="bg-foreground/5 rounded-2xl p-3.5 flex flex-col items-center justify-center border border-foreground/5">
              <span className="text-xl font-black text-foreground">{hostedSessionCount}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-foreground/50 mt-1">Sessions Hosted</span>
            </div>
            <div className="bg-foreground/5 rounded-2xl p-3.5 flex flex-col items-center justify-center border border-foreground/5">
              <span className="text-sm font-black text-foreground">{memberSince}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-foreground/50 mt-1">Member Since</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="w-full flex flex-col gap-2">
            <button
              onClick={() => setActivePanel(activePanel === 'settings' ? null : 'settings')}
              className={`w-full flex items-center justify-between p-3.5 rounded-2xl transition-all group border ${activePanel === 'settings' ? 'bg-foreground/10 border-foreground/20' : 'bg-foreground/5 border-transparent hover:bg-foreground/10 hover:border-foreground/10'}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center">
                  <Settings className="w-4 h-4 text-foreground/70" />
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-bold text-foreground">App Settings</h4>
                  <p className="text-[11px] text-foreground/50">Audio, Sync & Appearance</p>
                </div>
              </div>
              <Settings className={`w-4 h-4 transition-all duration-300 ${activePanel === 'settings' ? 'text-foreground rotate-90' : 'text-foreground/30 group-hover:text-foreground/70'}`} />
            </button>

            <button
              onClick={() => setActivePanel(activePanel === 'devices' ? null : 'devices')}
              className={`w-full flex items-center justify-between p-3.5 rounded-2xl transition-all group border ${activePanel === 'devices' ? 'bg-foreground/10 border-foreground/20' : 'bg-foreground/5 border-transparent hover:bg-foreground/10 hover:border-foreground/10'}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center">
                  <MonitorSmartphone className="w-4 h-4 text-foreground/70" />
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-bold text-foreground">Manage Devices</h4>
                  <p className="text-[11px] text-foreground/50">{devices.length} devices linked</p>
                </div>
              </div>
              <Settings className={`w-4 h-4 transition-all duration-300 ${activePanel === 'devices' ? 'text-foreground rotate-90' : 'text-foreground/30 group-hover:text-foreground/70'}`} />
            </button>

            <button
              onClick={() => setActivePanel(activePanel === 'password' ? null : 'password')}
              className={`w-full flex items-center justify-between p-3.5 rounded-2xl transition-all group border ${activePanel === 'password' ? 'bg-foreground/10 border-foreground/20' : 'bg-foreground/5 border-transparent hover:bg-foreground/10 hover:border-foreground/10'}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-foreground/70" />
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-bold text-foreground">Change Password</h4>
                  <p className="text-[11px] text-foreground/50">Set or reset password</p>
                </div>
              </div>
              <Settings className={`w-4 h-4 transition-all duration-300 ${activePanel === 'password' ? 'text-foreground rotate-90' : 'text-foreground/30 group-hover:text-foreground/70'}`} />
            </button>

            <button
              onClick={() => setActivePanel(activePanel === 'history' ? null : 'history')}
              className={`w-full flex items-center justify-between p-3.5 rounded-2xl transition-all group border ${activePanel === 'history' ? 'bg-foreground/10 border-foreground/20' : 'bg-foreground/5 border-transparent hover:bg-foreground/10 hover:border-foreground/10'}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-foreground/10 flex items-center justify-center">
                  <History className="w-4 h-4 text-foreground/70" />
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-bold text-foreground">Listening & Search History</h4>
                  <p className="text-[11px] text-foreground/50">View recent activity</p>
                </div>
              </div>
              <Settings className={`w-4 h-4 transition-all duration-300 ${activePanel === 'history' ? 'text-foreground rotate-90' : 'text-foreground/30 group-hover:text-foreground/70'}`} />
            </button>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 p-3.5 rounded-2xl hover:bg-red-500/10 transition-all group mt-1"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center">
                <LogOut className="w-4 h-4 text-red-400 group-hover:text-red-500 transition-colors" />
              </div>
              <h4 className="text-sm font-bold text-red-400 group-hover:text-red-500 transition-colors">Log Out</h4>
            </button>
          </div>
        </div>

        {/* Side / Sub Panels */}
        <AnimatePresence mode="popLayout">
          {activePanel === 'devices' && (
            <motion.div
              layout
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col w-full max-w-md shrink-0 relative rounded-[2.5rem] bg-background/95 dark:bg-black/90 backdrop-blur-3xl border border-foreground/15 shadow-[0_30px_90px_rgba(0,0,0,0.6)] p-6 z-10 max-h-[580px] overflow-hidden"
            >
              {/* Top Bar with Back Button on Mobile */}
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-foreground/10 shrink-0">
                <button
                  onClick={() => setActivePanel(null)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-foreground/10 hover:bg-foreground/20 text-foreground text-xs font-bold transition-all active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to Profile
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
                {devices.length === 0 ? (
                  <p className="text-foreground/40 text-sm font-medium text-center py-8">No devices saved yet.</p>
                ) : (
                  devices.map((savedDevice) => {
                    const isCurrent = currentDeviceId === savedDevice.id;
                    const isOffline = !isCurrent && (new Date().getTime() - new Date(savedDevice.last_seen_at).getTime() > 5 * 60 * 1000);
                    const isEditingThis = editingDeviceId === savedDevice.id;

                    return (
                      <div key={savedDevice.id} className={`p-3.5 rounded-2xl border transition-all ${isCurrent ? "bg-foreground/5 border-foreground/20" : "bg-transparent border-foreground/10"}`}>
                        {!isEditingThis ? (
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-background/50 flex items-center justify-center border border-foreground/5 shrink-0">
                                <DeviceGlyph userAgent={savedDevice.user_agent} />
                              </div>
                              <div className="min-w-0 flex flex-col">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-foreground text-sm truncate">{savedDevice.name}</h4>
                                  {isCurrent && <span className="px-2 py-0.5 rounded-full bg-foreground/10 text-foreground text-[9px] font-black uppercase tracking-widest shrink-0">Current</span>}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOffline ? 'bg-red-400' : 'bg-green-400 animate-pulse'}`} />
                                  <span className="text-[11px] text-foreground/50 truncate">{getPlatformLabel(savedDevice.user_agent)}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => openDeviceRename(savedDevice.id, savedDevice.name)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition-colors">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {!isCurrent && (
                                <button onClick={() => handleDeleteDevice(savedDevice.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-foreground/50 hover:text-red-500 transition-colors">
                                  <LogOut className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <form onSubmit={handleDeviceRename} className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">Rename Device</label>
                            <input
                              autoFocus
                              value={editingDeviceName}
                              onChange={(e) => setEditingDeviceName(e.target.value)}
                              className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none"
                              placeholder="Device Name"
                            />
                            <div className="flex items-center gap-2 justify-end mt-1">
                              <button type="button" onClick={() => setEditingDeviceId(null)} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-foreground/70 hover:bg-foreground/5">
                                Cancel
                              </button>
                              <button type="submit" disabled={savingDeviceRename || !editingDeviceName.trim()} className="px-4 py-1.5 rounded-xl text-xs font-bold bg-foreground text-background">
                                {savingDeviceRename ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}

          {activePanel === 'history' && (
            <motion.div
              layout
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col w-full max-w-md shrink-0 relative rounded-[2.5rem] bg-background/95 dark:bg-black/90 backdrop-blur-3xl border border-foreground/15 shadow-[0_30px_90px_rgba(0,0,0,0.6)] p-6 z-10 max-h-[580px] overflow-hidden"
            >
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-foreground/10 shrink-0">
                <button
                  onClick={() => setActivePanel(null)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-foreground/10 hover:bg-foreground/20 text-foreground text-xs font-bold transition-all active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to Profile
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* History Sub-tabs */}
              <div className="flex items-center gap-2 p-1 rounded-xl bg-foreground/5 mb-3 border border-foreground/10 shrink-0">
                <button
                  onClick={() => setHistoryTab('listens')}
                  className={cn('flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5', historyTab === 'listens' ? 'bg-foreground text-background shadow-md' : 'text-foreground/60 hover:text-foreground')}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Listens ({userHistory.listens.length})
                </button>
                <button
                  onClick={() => setHistoryTab('searches')}
                  className={cn('flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5', historyTab === 'searches' ? 'bg-foreground text-background shadow-md' : 'text-foreground/60 hover:text-foreground')}
                >
                  <Search className="w-3.5 h-3.5" />
                  Searches ({userHistory.searches.length})
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-0">
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-12 text-foreground/40 gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs font-medium">Loading history...</span>
                  </div>
                ) : historyTab === 'listens' ? (
                  userHistory.listens.length === 0 ? (
                    <p className="text-foreground/40 text-xs font-medium text-center py-12">No listen history recorded yet.</p>
                  ) : (
                    userHistory.listens.map((item, idx) => (
                      <div key={`pl-${item.id || idx}`} className="flex items-center gap-3 p-2.5 rounded-2xl bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 transition-all">
                        <img
                          src={item.thumbnail || `https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg`}
                          className="w-12 h-10 object-cover rounded-xl bg-black/40 shrink-0 border border-foreground/10"
                        />
                        <div className="min-w-0 flex-1">
                          <h5 className="text-xs font-bold text-foreground truncate">{item.title}</h5>
                          <p className="text-[10px] text-foreground/50 truncate mt-0.5">{item.artist || 'SyncBeats'}</p>
                        </div>
                        {item.playedAt && (
                          <span className="text-[9px] font-semibold text-foreground/40 shrink-0">
                            {new Date(item.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    ))
                  )
                ) : (
                  userHistory.searches.length === 0 ? (
                    <p className="text-foreground/40 text-xs font-medium text-center py-12">No search history recorded yet.</p>
                  ) : (
                    userHistory.searches.map((item, idx) => (
                      <div key={`ps-${item.id || idx}`} className="flex items-center justify-between p-3 rounded-2xl bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 transition-all">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Search className="w-3.5 h-3.5 text-foreground/50 shrink-0" />
                          <span className="text-xs font-bold text-foreground truncate">{item.query}</span>
                        </div>
                        {item.createdAt && (
                          <span className="text-[9px] font-semibold text-foreground/40 shrink-0 ml-2">
                            {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    ))
                  )
                )}
              </div>
            </motion.div>
          )}

          {activePanel === 'settings' && (
            <motion.div
              layout
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={cn(
                "flex flex-col w-full max-w-2xl md:max-w-3xl shrink-0 relative rounded-[2.5rem] bg-background/95 dark:bg-black/90 backdrop-blur-3xl border border-foreground/15 shadow-[0_30px_90px_rgba(0,0,0,0.6)] p-6 z-10 h-[85vh] md:h-[720px] max-h-[750px] min-h-0 overflow-hidden transition-all duration-300",
                isInteractingWithColors ? "bg-background/30 dark:bg-black/40 backdrop-blur-sm border-foreground/10 shadow-none" : ""
              )}
            >
              <div className="flex md:hidden items-center justify-between pb-3 mb-2 border-b border-foreground/10 shrink-0">
                <button
                  onClick={() => setActivePanel(null)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-foreground/10 hover:bg-foreground/20 text-foreground text-xs font-bold transition-all active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to Profile
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <SettingsPanel
                onClose={() => setActivePanel(null)}
                onInteractionStateChange={setIsInteractingWithColors}
              />
            </motion.div>
          )}

          {activePanel === 'password' && (
            <motion.div
              layout
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex flex-col w-full max-w-md shrink-0 relative rounded-[2.5rem] bg-background/95 dark:bg-black/90 backdrop-blur-3xl border border-foreground/15 shadow-[0_30px_90px_rgba(0,0,0,0.6)] p-6 z-10 max-h-[580px] overflow-hidden"
            >
              <div className="flex md:hidden items-center justify-between pb-3 mb-2 border-b border-foreground/10 shrink-0">
                <button
                  onClick={() => setActivePanel(null)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-foreground/10 hover:bg-foreground/20 text-foreground text-xs font-bold transition-all active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back to Profile
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ForgotPasswordPanel onClose={() => setActivePanel(null)} initialEmail={userEmail} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/**
 * ProfileModal — Outer shell that only handles mount/unmount via AnimatePresence.
 * The heavy inner content only exists when isOpen=true.
 */
export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  return (
    <AnimatePresence>
      {isOpen && <ProfileModalInner key="profile-modal" onClose={onClose} />}
    </AnimatePresence>
  );
}
