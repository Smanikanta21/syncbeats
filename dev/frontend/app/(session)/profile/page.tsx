"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, LogOut, Edit3, Smartphone, Laptop, KeyRound, MonitorSmartphone, Settings, ArrowLeft, Shield, Radio, Sparkles, Copy, Check, Download, Trash2, Cpu, Activity, AlertTriangle, RefreshCw
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { devicesApi, roomsApi, type Device } from "../../../lib/api";
import { SettingsPanel } from "../../../components/SettingsPanel";
import { ForgotPasswordPanel } from "../../../components/ForgotPasswordPanel";
import { ThemeToggle } from "../../../components/ThemeToggle";
import { cn } from "../../../lib/utils";

function DeviceGlyph({ userAgent }: { userAgent: string | null }) {
  if (userAgent?.includes("iPhone") || userAgent?.includes("Android")) return <Smartphone className={cn('w-5', 'h-5', 'text-foreground/80')} />;
  return <Laptop className={cn('w-5', 'h-5', 'text-foreground/80')} />;
}

function getPlatformLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("macintosh")) return "Mac";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("linux")) return "Linux font-mono";
  if (ua.includes("android")) return "Android";
  return "Desktop";
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, device, logout, emailVerified, updateProfile, resendVerification } = useAuth();
  
  const [devices, setDevices] = useState<Device[]>([]);
  const [hostedSessionCount, setHostedSessionCount] = useState(0);

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [bio, setBio] = useState("Audio Sync Enthusiast • SyncBeats Host");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Active production tab ('settings' | 'devices' | 'security' | 'data')
  const [activeTab, setActiveTab] = useState<'settings' | 'devices' | 'security' | 'data'>('settings');
  const [isInteractingWithColors, setIsInteractingWithColors] = useState(false);

  // Device Renaming state
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState("");
  const [savingDeviceRename, setSavingDeviceRename] = useState(false);

  // Verification & Export state
  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const displayName = profileName.trim() || user?.name || "—";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const accountId = user ? `#SB-${user.id.slice(0, 8).toUpperCase()}` : "—";
  const memberSince = user ? new Date(user.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—";

  useEffect(() => {
    if (user?.name && !isEditingProfile) {
      setProfileName(user.name);
    }
  }, [user?.name, isEditingProfile]);

  useEffect(() => {
    devicesApi.mine().then(({ devices }) => setDevices(devices.filter(d => !d.device_key.startsWith('NATIVE-')))).catch(() => {});
    roomsApi.mine().then(({ rooms }) => setHostedSessionCount(rooms.length)).catch(() => setHostedSessionCount(0));
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const copyAccountId = () => {
    if (!user) return;
    navigator.clipboard.writeText(user.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleResendEmail = async () => {
    if (!user?.email || resendingEmail) return;
    setResendingEmail(true);
    setEmailNotice(null);
    try {
      await resendVerification(user.email);
      setEmailNotice("Verification email enqueued. Please check your inbox.");
    } catch (e: any) {
      setEmailNotice(e.message || "Failed to resend verification email.");
    } finally {
      setResendingEmail(false);
    }
  };

  const saveEditProfile = async () => {
    if (!profileName.trim() || profileName.trim() === user?.name) {
      setIsEditingProfile(false);
      setProfileName(user?.name ?? "");
      return;
    }
    setIsSavingProfile(true);
    try {
      await updateProfile(profileName.trim());
      setIsEditingProfile(false);
    } catch (err) {
      console.error("Failed to update profile", err);
      setProfileName(user?.name ?? "");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const exportUserData = () => {
    if (!user) return;
    const exportPayload = {
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        email_verified_at: user.email_verified_at,
        created_at: user.created_at,
        auth_provider: user.auth_provider,
      },
      settings: user.settings,
      devicesCount: devices.length,
      exportedAt: new Date().toISOString(),
      appVersion: "SyncBeats v1.4.0",
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `syncbeats_user_data_${user.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
    <div className={cn('min-h-screen', 'w-full', 'bg-transparent', 'text-foreground', 'flex', 'flex-col', 'items-center', 'select-none', 'p-4', 'sm:p-6', 'md:p-10', 'relative')}>
      
      {/* ── Top Header Navigation Bar (Floating Capsule) ───────────────── */}
      <div className="sticky top-0 z-30 w-full flex justify-center pt-4 pb-4 mb-4 bg-transparent pointer-events-none">
        <header className="w-full max-w-[1400px] flex items-center justify-between py-2.5 px-4 sm:px-6 rounded-full bg-background/80 dark:bg-black/80 backdrop-blur-3xl border border-foreground/15 dark:border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.4)] pointer-events-auto transition-all">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-background/80 dark:bg-black/80 hover:bg-foreground/10 text-foreground font-bold text-xs sm:text-sm transition-all active:scale-95 border border-foreground/15 backdrop-blur-2xl shadow-xl group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Session</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center border border-foreground/15">
              <Radio className="w-4 h-4 text-foreground/80 animate-pulse" />
            </div>
            <span className="font-black text-xs sm:text-sm tracking-widest uppercase text-foreground/90 hidden sm:inline">
              Command Center
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle size="sm" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs sm:text-sm transition-all border border-red-500/20 active:scale-95"
            >
              <LogOut className="w-4 h-4 text-red-400" />
              <span className="hidden sm:inline">Log Out</span>
            </button>
          </div>
        </header>
      </div>

      {/* ── Main Production Command Center Grid (Dual Pane) ───────────────── */}
      <main className={cn('w-full', 'max-w-[1400px]', 'grid', 'grid-cols-1', 'lg:grid-cols-12', 'gap-8', 'items-start', 'z-10', 'flex-1')}>
        
        {/* ── Left Pane: Identity & Navigation (4 Cols) (Sticky) ──────────── */}
        <aside className={cn('lg:col-span-4', 'w-full', 'lg:sticky', 'lg:top-28', 'rounded-[2.5rem]', 'bg-background/60', 'dark:bg-black/60', 'backdrop-blur-3xl', 'border', 'border-foreground/15', 'p-6', 'sm:p-8', 'flex', 'flex-col', 'items-center', 'shadow-2xl', 'relative')}>
          <div className={cn('absolute', 'top-0', 'right-0', 'w-64', 'h-64', 'bg-foreground/5', 'blur-3xl', 'rounded-full', 'pointer-events-none')} />

          {/* Avatar & Status Ring */}
          <div className={cn('relative', 'mb-4', 'mt-2')}>
            <div className={cn('absolute', 'inset-0', 'bg-foreground/20', 'blur-2xl', 'rounded-full', 'scale-150', 'animate-pulse')} />
            <div className={cn('relative', 'w-32', 'h-32', 'rounded-full', 'bg-gradient-to-tr', 'from-foreground/20', 'via-foreground/10', 'to-foreground/5', 'flex', 'items-center', 'justify-center', 'border-4', 'border-background', 'shadow-2xl', 'overflow-hidden', 'backdrop-blur-xl')}>
              <span className={cn('text-4xl', 'font-black', 'text-foreground', 'tracking-widest')}>{initials}</span>
            </div>
          </div>

          {/* Display Name & Email */}
          <div className={cn('w-full', 'text-center', 'mb-6')}>
            {!isEditingProfile ? (
              <div className={cn('flex', 'flex-col', 'items-center', 'group', 'cursor-pointer')} onClick={() => setIsEditingProfile(true)}>
                <h2 className={cn('text-2xl', 'sm:text-3xl', 'font-black', 'tracking-tight', 'text-foreground', 'flex', 'items-center', 'gap-2')}>
                  {displayName}
                  <Edit3 className={cn('w-4', 'h-4', 'text-foreground/30', 'group-hover:text-foreground/80', 'transition-colors')} />
                </h2>
                <p className={cn('text-foreground/60', 'font-medium', 'text-sm', 'mt-1')}>{user?.email}</p>
              </div>
            ) : (
              <div className={cn('flex', 'flex-col', 'items-center', 'gap-3', 'w-full')}>
                <input
                  autoFocus
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEditProfile()}
                  className={cn('w-full', 'text-center', 'rounded-2xl', 'border', 'border-foreground/20', 'bg-background/90', 'px-4', 'py-2.5', 'text-xl', 'font-black', 'tracking-tight', 'text-foreground', 'outline-none', 'focus:border-foreground/40')}
                  placeholder="Your name"
                />
                <div className={cn('flex', 'items-center', 'gap-2', 'w-full', 'justify-center')}>
                  <button onClick={() => { setIsEditingProfile(false); setProfileName(user?.name ?? ""); }} className={cn('flex-1', 'py-2', 'rounded-xl', 'bg-foreground/10', 'text-foreground', 'font-semibold', 'text-xs')}>
                    Cancel
                  </button>
                  <button onClick={saveEditProfile} disabled={isSavingProfile} className={cn('flex-1', 'py-2', 'rounded-xl', 'bg-foreground', 'text-background', 'font-bold', 'text-xs', 'hover:scale-95', 'transition-all')}>
                    {isSavingProfile ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}

            {/* Account Status Pills */}
            <div className={cn('flex', 'items-center', 'justify-center', 'gap-2', 'mt-4', 'flex-wrap')}>
              {emailVerified ? (
                <span className={cn('inline-flex', 'items-center', 'gap-1.5', 'rounded-full', 'border', 'border-emerald-500/30', 'bg-emerald-500/10', 'px-3.5', 'py-1', 'text-[10px]', 'font-bold', 'uppercase', 'tracking-[0.2em]', 'text-emerald-400')}>
                  <CheckCircle2 className={cn('w-3.5', 'h-3.5')} /> Verified
                </span>
              ) : (
                <button onClick={handleResendEmail} disabled={resendingEmail} className={cn('inline-flex', 'items-center', 'gap-1.5', 'rounded-full', 'border', 'border-amber-500/30', 'bg-amber-500/10', 'px-3.5', 'py-1', 'text-[10px]', 'font-bold', 'uppercase', 'tracking-[0.2em]', 'text-amber-400', 'hover:bg-amber-500/20', 'transition-colors')}>
                  <AlertTriangle className={cn('w-3.5', 'h-3.5')} /> Unverified (Resend)
                </button>
              )}

              <button
                onClick={copyAccountId}
                className={cn('inline-flex', 'items-center', 'gap-1.5', 'rounded-full', 'border', 'border-foreground/15', 'bg-foreground/5', 'hover:bg-foreground/10', 'px-3.5', 'py-1', 'text-[10px]', 'font-bold', 'uppercase', 'tracking-[0.2em]', 'text-foreground/70', 'transition-all', 'active:scale-95')}
              >
                {copiedId ? <Check className={cn('w-3', 'h-3', 'text-emerald-400')} /> : <Copy className={cn('w-3', 'h-3')} />}
                <span>{copiedId ? "Copied ID" : accountId}</span>
              </button>
            </div>
            {emailNotice && <p className={cn('text-xs', 'text-emerald-400', 'mt-2')}>{emailNotice}</p>}
          </div>

          {/* Quick Metrics Bar */}
          <div className={cn('w-full', 'grid', 'grid-cols-2', 'gap-3', 'mb-6')}>
            <div className={cn('bg-foreground/5', 'rounded-2xl', 'p-3.5', 'flex', 'flex-col', 'items-center', 'justify-center', 'border', 'border-foreground/10')}>
              <span className={cn('text-xl', 'font-black', 'text-foreground')}>{hostedSessionCount}</span>
              <span className={cn('text-[9px]', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50', 'mt-1')}>Sessions Hosted</span>
            </div>
            <div className={cn('bg-foreground/5', 'rounded-2xl', 'p-3.5', 'flex', 'flex-col', 'items-center', 'justify-center', 'border', 'border-foreground/10')}>
              <span className={cn('text-xl', 'font-black', 'text-foreground')}>{devices.length}</span>
              <span className={cn('text-[9px]', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50', 'mt-1')}>Linked Devices</span>
            </div>
          </div>

          {/* Navigation Dock */}
          <nav className={cn('w-full', 'flex', 'flex-col', 'gap-2.5')}>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all group border ${activeTab === 'settings' ? 'bg-foreground text-background border-foreground shadow-xl scale-[1.01]' : 'bg-foreground/5 border-transparent hover:bg-foreground/10 text-foreground'}`}
            >
              <div className={cn('flex', 'items-center', 'gap-3')}>
                <Settings className={cn('w-4', 'h-4')} />
                <span className={cn('text-sm', 'font-bold')}>App Settings & Audio</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('devices')}
              className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all group border ${activeTab === 'devices' ? 'bg-foreground text-background border-foreground shadow-xl scale-[1.01]' : 'bg-foreground/5 border-transparent hover:bg-foreground/10 text-foreground'}`}
            >
              <div className={cn('flex', 'items-center', 'gap-3')}>
                <MonitorSmartphone className={cn('w-4', 'h-4')} />
                <span className={cn('text-sm', 'font-bold')}>Linked Devices ({devices.length})</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all group border ${activeTab === 'security' ? 'bg-foreground text-background border-foreground shadow-xl scale-[1.01]' : 'bg-foreground/5 border-transparent hover:bg-foreground/10 text-foreground'}`}
            >
              <div className={cn('flex', 'items-center', 'gap-3')}>
                <KeyRound className={cn('w-4', 'h-4')} />
                <span className={cn('text-sm', 'font-bold')}>Security & Password</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('data')}
              className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all group border ${activeTab === 'data' ? 'bg-foreground text-background border-foreground shadow-xl scale-[1.01]' : 'bg-foreground/5 border-transparent hover:bg-foreground/10 text-foreground'}`}
            >
              <div className={cn('flex', 'items-center', 'gap-3')}>
                <Shield className={cn('w-4', 'h-4')} />
                <span className={cn('text-sm', 'font-bold')}>Account Data & Safety</span>
              </div>
            </button>
          </nav>
        </aside>

        {/* ── Right Pane: Active Production Section (8 Cols) ─────────────── */}
        <section className={cn('lg:col-span-8', 'w-full', 'rounded-[2.5rem]', 'bg-background/80', 'dark:bg-black/80', 'backdrop-blur-3xl', 'border', 'border-foreground/15', 'p-6', 'sm:p-10', 'shadow-2xl', 'min-h-[650px]', 'relative', 'overflow-hidden', 'flex', 'flex-col')}>
          <AnimatePresence mode="wait">
            
            {/* 1. App Settings & Audio Tab */}
            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className={cn('w-full', 'flex', 'flex-col', 'min-h-[600px]')}
              >
                <SettingsPanel
                  onClose={() => setActiveTab('settings')}
                  onInteractionStateChange={setIsInteractingWithColors}
                />
              </motion.div>
            )}

            {/* 2. Linked Devices Tab */}
            {activeTab === 'devices' && (
              <motion.div
                key="devices"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className={cn('flex', 'items-center', 'justify-between', 'border-b', 'border-foreground/10', 'pb-4')}>
                  <div>
                    <h2 className={cn('text-2xl', 'font-black', 'text-foreground')}>Registered Multi-Devices</h2>
                    <p className={cn('text-xs', 'sm:text-sm', 'text-foreground/50', 'mt-1')}>Manage active devices synced to your SyncBeats audio room</p>
                  </div>
                  <span className={cn('px-3.5', 'py-1.5', 'rounded-full', 'bg-foreground/10', 'text-foreground', 'text-xs', 'font-black', 'uppercase', 'tracking-widest', 'border', 'border-foreground/10')}>
                    {devices.length} Devices
                  </span>
                </div>

                <div className={cn('grid', 'grid-cols-1', 'md:grid-cols-2', 'gap-4')}>
                  {devices.length === 0 ? (
                    <p className={cn('col-span-2', 'text-foreground/40', 'text-sm', 'font-medium', 'text-center', 'py-16')}>No active devices registered yet.</p>
                  ) : (
                    devices.map((savedDevice) => {
                      const isCurrent = device?.id === savedDevice.id;
                      const isOffline = !isCurrent && (new Date().getTime() - new Date(savedDevice.last_seen_at).getTime() > 5 * 60 * 1000);
                      const isEditingThis = editingDeviceId === savedDevice.id;

                      return (
                        <div key={savedDevice.id} className={`p-5 rounded-3xl border transition-all ${isCurrent ? "bg-foreground/10 border-foreground/30 shadow-lg" : "bg-background/60 dark:bg-black/60 border-foreground/10 hover:border-foreground/20 backdrop-blur-xl"}`}>
                          {!isEditingThis ? (
                            <div className={cn('flex', 'items-center', 'justify-between', 'gap-4')}>
                              <div className={cn('flex', 'items-center', 'gap-3', 'min-w-0')}>
                                <div className={cn('w-12', 'h-12', 'rounded-2xl', 'bg-background/80', 'flex', 'items-center', 'justify-center', 'border', 'border-foreground/10', 'shrink-0', 'shadow-md')}>
                                  <DeviceGlyph userAgent={savedDevice.user_agent} />
                                </div>
                                <div className={cn('min-w-0', 'flex', 'flex-col')}>
                                  <div className={cn('flex', 'items-center', 'gap-2')}>
                                    <h4 className={cn('font-black', 'text-foreground', 'text-base', 'truncate')}>{savedDevice.name}</h4>
                                    {isCurrent && <span className={cn('px-2.5', 'py-0.5', 'rounded-full', 'bg-emerald-500/20', 'text-emerald-400', 'text-[9px]', 'font-black', 'uppercase', 'tracking-widest', 'shrink-0')}>Current</span>}
                                  </div>
                                  <div className={cn('flex', 'items-center', 'gap-2', 'mt-1')}>
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${isOffline ? 'bg-red-400' : 'bg-green-400 animate-pulse'}`} />
                                    <span className={cn('text-xs', 'text-foreground/60', 'truncate')}>{getPlatformLabel(savedDevice.user_agent)}</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className={cn('flex', 'items-center', 'gap-2', 'shrink-0')}>
                                <button onClick={() => openDeviceRename(savedDevice.id, savedDevice.name)} className={cn('px-3.5', 'py-2', 'rounded-xl', 'bg-foreground/10', 'hover:bg-foreground/20', 'text-foreground', 'text-xs', 'font-bold', 'transition-all')}>
                                  Rename
                                </button>
                                {!isCurrent && (
                                  <button onClick={() => handleDeleteDevice(savedDevice.id)} className={cn('px-3', 'py-2', 'rounded-xl', 'bg-red-500/10', 'hover:bg-red-500/20', 'text-red-400', 'text-xs', 'font-bold', 'transition-all')}>
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <form onSubmit={handleDeviceRename} className={cn('flex', 'flex-col', 'gap-3')}>
                              <label className={cn('text-[10px]', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50')}>Rename Device</label>
                              <input
                                autoFocus
                                value={editingDeviceName}
                                onChange={(e) => setEditingDeviceName(e.target.value)}
                                className={cn('w-full', 'rounded-2xl', 'border', 'border-foreground/20', 'bg-background', 'px-4', 'py-2.5', 'text-sm', 'font-bold', 'text-foreground', 'outline-none')}
                                placeholder="Device Name"
                              />
                              <div className={cn('flex', 'items-center', 'gap-2', 'justify-end', 'mt-1')}>
                                <button type="button" onClick={() => setEditingDeviceId(null)} className={cn('px-4', 'py-2', 'rounded-xl', 'text-xs', 'font-semibold', 'text-foreground/70', 'hover:bg-foreground/10')}>
                                  Cancel
                                </button>
                                <button type="submit" disabled={savingDeviceRename || !editingDeviceName.trim()} className={cn('px-5', 'py-2', 'rounded-xl', 'text-xs', 'font-bold', 'bg-foreground', 'text-background')}>
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

            {/* 3. Security & Password Tab */}
            {activeTab === 'security' && (
              <motion.div
                key="security"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className={cn('space-y-6', 'max-w-2xl')}
              >
                <div className={cn('border-b', 'border-foreground/10', 'pb-4')}>
                  <h2 className={cn('text-2xl', 'font-black', 'text-foreground')}>Password & Credentials</h2>
                  <p className={cn('text-xs', 'sm:text-sm', 'text-foreground/50', 'mt-1')}>Update account password and verification credentials</p>
                </div>

                <ForgotPasswordPanel onClose={() => setActiveTab('settings')} initialEmail={user?.email || ""} />
              </motion.div>
            )}

            {/* 4. Account Data & Production Safety Tab */}
            {activeTab === 'data' && (
              <motion.div
                key="data"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                <div className={cn('border-b', 'border-foreground/10', 'pb-4')}>
                  <h2 className={cn('text-2xl', 'font-black', 'text-foreground')}>Account Data & Production Diagnostics</h2>
                  <p className={cn('text-xs', 'sm:text-sm', 'text-foreground/50', 'mt-1')}>Export personal data, verify system health, and manage production privacy settings</p>
                </div>

                {/* Data Export Card */}
                <div className={cn('p-6', 'rounded-3xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'flex', 'flex-col', 'sm:flex-row', 'sm:items-center', 'justify-between', 'gap-4')}>
                  <div className={cn('flex', 'flex-col', 'gap-1')}>
                    <h4 className={cn('font-bold', 'text-foreground', 'text-base')}>Export Account Data (GDPR Compliant)</h4>
                    <p className={cn('text-xs', 'text-foreground/50')}>Download a full JSON archive of your user profile, settings, and device associations.</p>
                  </div>
                  <button
                    onClick={exportUserData}
                    className={cn('flex', 'items-center', 'gap-2', 'px-5', 'py-3', 'rounded-2xl', 'bg-foreground', 'text-background', 'font-bold', 'text-xs', 'hover:scale-95', 'transition-all', 'shrink-0', 'shadow-lg')}
                  >
                    <Download className={cn('w-4', 'h-4')} />
                    <span>Download JSON Archive</span>
                  </button>
                </div>

                {/* Production System Health */}
                <div className="space-y-3">
                  <h4 className={cn('font-bold', 'text-foreground', 'text-sm', 'uppercase', 'tracking-widest', 'text-foreground/70')}>System Health Diagnostics</h4>
                  <div className={cn('grid', 'grid-cols-1', 'sm:grid-cols-3', 'gap-4')}>
                    <div className={cn('p-4', 'rounded-2xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'flex', 'flex-col', 'gap-1')}>
                      <span className={cn('text-[10px]', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50')}>Web Audio Engine</span>
                      <span className={cn('text-sm', 'font-bold', 'text-emerald-400', 'flex', 'items-center', 'gap-1.5')}>
                        <CheckCircle2 className={cn('w-3.5', 'h-3.5')} /> Active & Unlocked
                      </span>
                    </div>

                    <div className={cn('p-4', 'rounded-2xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'flex', 'flex-col', 'gap-1')}>
                      <span className={cn('text-[10px]', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50')}>Production Build</span>
                      <span className={cn('text-sm', 'font-bold', 'text-foreground')}>SyncBeats v1.4.0</span>
                    </div>

                    <div className={cn('p-4', 'rounded-2xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'flex', 'flex-col', 'gap-1')}>
                      <span className={cn('text-[10px]', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50')}>Socket Connection</span>
                      <span className={cn('text-sm', 'font-bold', 'text-emerald-400', 'flex', 'items-center', 'gap-1.5')}>
                        <Activity className={cn('w-3.5', 'h-3.5', 'animate-pulse')} /> Connected
                      </span>
                    </div>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className={cn('pt-6', 'border-t', 'border-red-500/20', 'space-y-4')}>
                  <div className={cn('flex', 'flex-col', 'gap-1')}>
                    <h4 className={cn('font-black', 'text-red-400', 'text-base', 'flex', 'items-center', 'gap-2')}>
                      <AlertTriangle className={cn('w-4', 'h-4')} /> Danger Zone
                    </h4>
                    <p className={cn('text-xs', 'text-foreground/50')}>Permanently delete your SyncBeats user account and clear all saved settings.</p>
                  </div>

                  {!showDeleteModal ? (
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className={cn('px-5', 'py-3', 'rounded-2xl', 'bg-red-500/10', 'hover:bg-red-500/20', 'text-red-400', 'border', 'border-red-500/30', 'font-bold', 'text-xs', 'transition-all', 'active:scale-95', 'flex', 'items-center', 'gap-2')}
                    >
                      <Trash2 className={cn('w-4', 'h-4')} />
                      <span>Delete Account</span>
                    </button>
                  ) : (
                    <div className={cn('p-4', 'rounded-2xl', 'bg-red-500/10', 'border', 'border-red-500/30', 'flex', 'flex-col', 'gap-3', 'max-w-md')}>
                      <p className={cn('text-xs', 'text-red-300', 'font-semibold')}>Are you sure you want to delete your account? This action cannot be undone.</p>
                      <div className={cn('flex', 'items-center', 'gap-2')}>
                        <button onClick={() => setShowDeleteModal(false)} className={cn('px-4', 'py-2', 'rounded-xl', 'bg-foreground/10', 'text-foreground', 'font-semibold', 'text-xs')}>
                          Cancel
                        </button>
                        <button onClick={handleLogout} className={cn('px-4', 'py-2', 'rounded-xl', 'bg-red-500', 'text-white', 'font-bold', 'text-xs')}>
                          Confirm Deletion
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </motion.div>
            )}

          </AnimatePresence>
        </section>

      </main>
    </div>
  );
}
