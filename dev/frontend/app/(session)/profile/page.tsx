"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, LogOut, Edit3, Smartphone, Laptop, KeyRound, MonitorSmartphone, Settings, ArrowLeft, Shield, Copy, Check, Download, Trash2, AlertTriangle, Loader2, ChevronRight, Link2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { useConnection } from "../../../context/ConnectionContext";
import { devicesApi, roomsApi, youtubeApi, type Device } from "../../../lib/api";
import { SettingsPanel } from "../../../components/settings";
import { ForgotPasswordPanel } from "../../../components/ForgotPasswordPanel";
import { ThemeToggle } from "../../../components/ThemeToggle";
import { useLoadingTasks } from "../../../context/LoadingContext";
import { MarqueeText } from "../../../components/MarqueeText";
import { cn } from "../../../lib/utils";

type TabId = 'settings' | 'devices' | 'integrations' | 'security' | 'data';

const TABS: { id: TabId; label: string; icon: typeof Settings }[] = [
  { id: 'settings',     label: 'Settings & audio', icon: Settings },
  { id: 'devices',      label: 'Devices',          icon: MonitorSmartphone },
  { id: 'integrations', label: 'Integrations',     icon: Link2 },
  { id: 'security',     label: 'Security',         icon: KeyRound },
  { id: 'data',         label: 'Data & privacy',   icon: Shield },
];

function DeviceGlyph({ userAgent }: { userAgent: string | null }) {
  if (userAgent?.includes("iPhone") || userAgent?.includes("Android")) return <Smartphone className="w-5 h-5 text-foreground/80" />;
  return <Laptop className="w-5 h-5 text-foreground/80" />;
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

export default function ProfilePage() {
  const router = useRouter();
  const { user, device, logout, emailVerified, updateProfile, resendVerification } = useAuth();
  const { isOnline, isServerReachable, isSocketConnected } = useConnection();

  const [devices, setDevices] = useState<Device[]>([]);
  const [hostedSessionCount, setHostedSessionCount] = useState(0);
  const [isFetchingStats, setIsFetchingStats] = useState(true);
  const { setLoadingTask } = useLoadingTasks();

  useEffect(() => {
    const task = (!user || isFetchingStats)
      ? { title: "Opening your profile", detail: "Loading your account, devices, and listening settings.", priority: 4 }
      : null;
    setLoadingTask("profile", task);
    return () => setLoadingTask("profile", null);
  }, [user, isFetchingStats, setLoadingTask]);

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<TabId>('settings');

  // Interaction state for settings panel color picker

  // Integrations state
  const [youtubeConnected, setYoutubeConnected] = useState<boolean | null>(null);

  // Device Renaming state
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState("");
  const [savingDeviceRename, setSavingDeviceRename] = useState(false);

  // Verification & Export state
  const [resendingEmail, setResendingEmail] = useState(false);
  // `ok` carries whether the notice is a success or a failure. It used to be a
  // bare string rendered in green unconditionally, so a failed resend reported
  // its error message in the success colour.
  const [emailNotice, setEmailNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const displayName = profileName.trim() || user?.name || "—";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const accountId = user ? `#SB-${user.id.slice(0, 8).toUpperCase()}` : "—";
  // Stable per-account hue: same user, same colour, every visit.
  const identityHue = user ? [...user.id].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360 : 220;
  // There's no delete-account endpoint on the server, so the danger zone mails
  // the request instead of claiming to delete. Replace with an API call when one exists.
  const deleteRequestHref = `mailto:support@syncbeats.in?subject=${encodeURIComponent("Account deletion request")}&body=${encodeURIComponent(
    `Please delete my SyncBeats account and everything attached to it.\n\nEmail: ${user?.email ?? ""}\nAccount: ${accountId}`
  )}`;

  useEffect(() => {
    if (user?.name && !isEditingProfile) {
      setProfileName(user.name);
    }
  }, [user?.name, isEditingProfile]);

  useEffect(() => {
    if (user?.id) {
      setIsFetchingStats(true);
      Promise.all([
        devicesApi.mine().then(({ devices }) => setDevices(devices.filter(d => !d.device_key.startsWith('NATIVE-')))).catch(() => {}),
        roomsApi.mine().then(({ rooms }) => setHostedSessionCount(rooms.length)).catch(() => setHostedSessionCount(0)),
        youtubeApi.getStatus().then(res => setYoutubeConnected(res.connected)).catch(() => {})
      ]).finally(() => {
        setIsFetchingStats(false);
      });
    } else {
      setIsFetchingStats(false);
    }
  }, [user?.id]);

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
      setEmailNotice({ text: "Verification email sent. Check your inbox.", ok: true });
    } catch (e: any) {
      setEmailNotice({ text: e.message || "Couldn't resend the verification email.", ok: false });
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

  const handleBackToSession = useCallback(async () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    try {
      const res = await roomsApi.default();
      if (res?.roomId) {
        router.push(`/room/${res.roomId}`);
        return;
      }
    } catch {}
    router.push('/room/default');
  }, [router]);

  if (!user || isFetchingStats) return null;

  return (
    <div className="min-h-screen w-full bg-transparent text-foreground select-none px-4 pb-12 sm:px-6 md:px-10 relative">

      {/* ── Top header — fixed hairline bar with safe-area support ────── */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background/85 dark:bg-black/85 backdrop-blur-2xl border-b border-foreground/10 pt-[env(safe-area-inset-top,0px)]">
        <header className="mx-auto w-full max-w-350 flex items-center justify-between px-4 sm:px-6 h-14 sm:h-16">
          <button
            onClick={handleBackToSession}
            className="flex items-center gap-2 py-2 px-3 sm:px-3.5 -ml-1 sm:ml-0 rounded-full bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground font-semibold text-xs sm:text-sm transition-all active:scale-95 group shadow-xs"
            aria-label="Back to session"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back<span className="hidden sm:inline"> to session</span></span>
          </button>

          <span className="micro-label hidden sm:inline">
            Your account
          </span>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle size="sm" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 sm:gap-2 rounded-full px-3 py-1.5 sm:px-3.5 text-xs sm:text-sm font-semibold text-bad-700 transition-colors hover:bg-bad-500/10 dark:text-bad-400 active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </header>
      </div>

      {/* ── Dual pane: identity + navigation on the left, active section right ── */}
      <main className="w-full max-w-350 mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 z-10 pt-[calc(env(safe-area-inset-top,0px)+4.25rem)] sm:pt-24">

        {/* ── Left Pane: Identity & Navigation (4 Cols) (Sticky) ──────────── */}
        <aside className="lg:col-span-4 w-full lg:sticky lg:top-24 self-start z-30 rounded-3xl bg-surface/70 backdrop-blur-2xl border border-foreground/10 p-6 sm:p-8 flex flex-col items-center relative overflow-hidden">
          {/* Identity tint derived from the account id — personal to each user,
              and now the only hue on this page. */}
          <div
            className="absolute -top-20 -right-16 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-20"
            style={{ background: `hsl(${identityHue} 70% 55%)` }}
          />

          {/* Avatar */}
          <div className="relative mb-4 mt-2">
            <div
              className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full p-[2px] shadow-xl"
              style={{ background: `linear-gradient(140deg, hsl(${identityHue} 85% 62%), hsl(${(identityHue + 48) % 360} 80% 48%))` }}
            >
              <div className="w-full h-full rounded-full bg-background dark:bg-black flex items-center justify-center">
                <span className="text-3xl sm:text-4xl font-semibold text-foreground tracking-wide">{initials}</span>
              </div>
            </div>
          </div>

          {/* Display Name & Email */}
          <div className="w-full text-center mb-5">
            {!isEditingProfile ? (
              <button type="button" className="flex flex-col items-center w-full group" onClick={() => setIsEditingProfile(true)}>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                  {displayName}
                  <Edit3 className="w-4 h-4 text-foreground/30 group-hover:text-foreground/80 transition-colors" />
                </h2>
                <p className="text-foreground/60 font-medium text-sm mt-1 break-all">{user?.email}</p>
              </button>
            ) : (
              <div className="flex flex-col items-center gap-3 w-full">
                <input
                  autoFocus
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEditProfile()}
                  className="w-full text-center rounded-2xl border border-foreground/20 bg-background/90 px-4 py-2.5 text-xl font-semibold tracking-tight text-foreground outline-none focus:border-foreground/40"
                  placeholder="Your name"
                />
                <div className="flex items-center gap-2 w-full justify-center">
                  <button onClick={() => { setIsEditingProfile(false); setProfileName(user?.name ?? ""); }} className="flex-1 py-2 rounded-xl bg-foreground/10 text-foreground font-semibold text-xs">
                    Cancel
                  </button>
                  <button onClick={saveEditProfile} disabled={isSavingProfile} className="flex-1 py-2 rounded-xl bg-foreground text-background font-bold text-xs hover:scale-95 transition-all">
                    {isSavingProfile ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}

            {/* Account Status Pills */}
            <div className="flex items-center justify-center gap-2 mt-3.5 flex-wrap">
              {emailVerified ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-ok-500/30 bg-ok-500/10 px-3.5 py-1 text-[11px] font-semibold text-ok-700 dark:text-ok-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                </span>
              ) : (
                <button onClick={handleResendEmail} disabled={resendingEmail} className="inline-flex items-center gap-1.5 rounded-full border border-warn-500/30 bg-warn-500/10 px-3.5 py-1 text-[11px] font-semibold text-warn-700 dark:text-warn-400 hover:bg-warn-500/20 transition-colors">
                  <AlertTriangle className="w-3.5 h-3.5" /> Unverified (Resend)
                </button>
              )}

              <button
                onClick={copyAccountId}
                className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-foreground/5 hover:bg-foreground/10 px-3.5 py-1 text-[11px] font-semibold text-foreground/70 transition-all active:scale-95"
              >
                {copiedId ? <Check className="w-3 h-3 text-ok-700 dark:text-ok-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedId ? "Copied ID" : accountId}</span>
              </button>
            </div>
            {emailNotice && (
              <p
                role="status"
                className={cn(
                  'text-xs', 'mt-2',
                  emailNotice.ok
                    ? 'text-ok-600 dark:text-ok-400'
                    : 'text-bad-600 dark:text-bad-400',
                )}
              >
                {emailNotice.text}
              </p>
            )}
          </div>

          {/* Two numbers worth showing. hostedSessionCount was already being
              fetched here and never rendered. */}
          <div className="w-full grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-2xl border border-foreground/10 bg-foreground/5 px-3 py-3.5 text-center">
              <span className="block tabular text-2xl font-semibold text-foreground leading-none">{devices.length}</span>
              <span className="block text-[11px] font-semibold text-foreground/50 mt-1.5">Devices</span>
            </div>
            <div className="rounded-2xl border border-foreground/10 bg-foreground/5 px-3 py-3.5 text-center">
              <span className="block tabular text-2xl font-semibold text-foreground leading-none">{hostedSessionCount}</span>
              <span className="block text-[11px] font-semibold text-foreground/50 mt-1.5">Rooms Hosted</span>
            </div>
          </div>

          {/* Navigation Dock */}
          <nav className="w-full flex flex-col gap-1.5">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-colors group',
                    isActive ? 'text-foreground' : 'text-foreground/60 hover:text-foreground hover:bg-foreground/5'
                  )}
                >
                  {/* One indicator that slides between tabs, rather than a bar
                      that blinks out here and in over there. */}
                  {isActive && (
                    <motion.span
                      layoutId="profile-tab"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-2xl bg-foreground/10 border border-foreground/20"
                    />
                  )}
                  <Icon className={cn('relative w-4 h-4 shrink-0', isActive ? 'text-foreground' : 'text-foreground/50')} />
                  <span className={cn('relative text-sm truncate', isActive ? 'font-bold' : 'font-semibold')}>{tab.label}</span>
                  <ChevronRight
                    className={cn(
                      'relative w-4 h-4 shrink-0 ml-auto transition-transform',
                      isActive ? 'text-foreground/70' : 'text-foreground/25 group-hover:translate-x-0.5'
                    )}
                  />
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── Right Pane: Active Production Section (8 Cols) ────────────── */}
        <section className="glass-panel lg:col-span-8 w-full rounded-[1.75rem] border border-foreground/10 p-4 sm:p-8 md:p-9 min-h-162.5 relative overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">

            {/* 1. App Settings & Audio Tab */}
            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="w-full flex flex-col min-h-150"
              >
                <SettingsPanel
                  isEmbedded={true}
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
                <div className="flex items-center justify-between border-b border-foreground/10 pb-4">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">Devices</h2>
                    <p className="text-xs sm:text-sm text-foreground/50 mt-1">Everything signed in to your account. Each one can play in sync.</p>
                  </div>
                  <span className="px-3.5 py-1.5 rounded-full bg-foreground/10 text-foreground tabular text-xs font-semibold border border-foreground/10 shrink-0">
                    {devices.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {devices.length === 0 ? (
                    <p className="col-span-2 text-foreground/40 text-sm font-medium text-center py-16">Nothing registered yet. Sign in on a phone or laptop and it&apos;ll appear here.</p>
                  ) : (
                    devices.map((savedDevice) => {
                      const isCurrent = device?.id === savedDevice.id;
                      const isOffline = !isCurrent && (new Date().getTime() - new Date(savedDevice.last_seen_at).getTime() > 5 * 60 * 1000);
                      const isEditingThis = editingDeviceId === savedDevice.id;

                      return (
                        <div key={savedDevice.id} className={cn(
                          'p-4 sm:p-5 rounded-2xl sm:rounded-3xl border transition-colors',
                          isCurrent
                            ? 'bg-foreground/10 border-foreground/25'
                            : 'bg-foreground/3 border-foreground/10 hover:border-foreground/25'
                        )}>
                          {!isEditingThis ? (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="w-10 h-10 rounded-2xl bg-foreground/5 flex items-center justify-center shrink-0 text-foreground/80">
                                  <DeviceGlyph userAgent={savedDevice.user_agent} />
                                </div>
                                <div className="min-w-0 flex-1 flex flex-col justify-center">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="min-w-0 flex-1">
                                      <MarqueeText className="font-bold text-foreground text-base tracking-tight">
                                        {savedDevice.name}
                                      </MarqueeText>
                                    </div>
                                    {isCurrent && (
                                      <span className="px-2.5 py-0.5 rounded-full bg-ok-500/20 text-ok-700 dark:text-ok-400 text-[10px] font-semibold shrink-0">
                                        This one
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${isOffline ? 'bg-foreground/25' : 'bg-ok-400 animate-pulse'}`} />
                                    <span className="text-xs text-foreground/50 truncate">
                                      {getPlatformLabel(savedDevice.user_agent)} · {isOffline ? 'Offline' : 'Online'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 pt-2.5 sm:pt-0 border-t border-foreground/5 sm:border-0 justify-end">
                                <button
                                  onClick={() => openDeviceRename(savedDevice.id, savedDevice.name)}
                                  className="px-3.5 py-1.5 sm:py-2 rounded-xl bg-foreground/10 hover:bg-foreground/20 text-foreground text-xs font-bold transition-colors active:scale-95"
                                >
                                  Rename
                                </button>
                                {!isCurrent && (
                                  <button
                                    onClick={() => handleDeleteDevice(savedDevice.id)}
                                    className="px-3.5 py-1.5 sm:py-2 rounded-xl bg-bad-500/10 hover:bg-bad-500/20 text-bad-700 dark:text-bad-400 text-xs font-bold transition-colors active:scale-95"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <form onSubmit={handleDeviceRename} className="flex flex-col gap-3">
                              <label className="text-[11px] font-semibold text-foreground/50">Rename Device</label>
                              <input
                                autoFocus
                                value={editingDeviceName}
                                onChange={(e) => setEditingDeviceName(e.target.value)}
                                className="w-full rounded-2xl border border-foreground/20 bg-background px-4 py-2.5 text-sm font-bold text-foreground outline-none"
                                placeholder="Device Name"
                              />
                              <div className="flex items-center gap-2 justify-end mt-1">
                                <button type="button" onClick={() => setEditingDeviceId(null)} className="px-4 py-2 rounded-xl text-xs font-semibold text-foreground/70 hover:bg-foreground/10">
                                  Cancel
                                </button>
                                <button type="submit" disabled={savingDeviceRename || !editingDeviceName.trim()} className="px-5 py-2 rounded-xl text-xs font-bold bg-foreground text-background">
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

            {/* 3. Integrations Tab */}
            {activeTab === 'integrations' && (
              <motion.div
                key="integrations"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6 max-w-2xl"
              >
                <div className="border-b border-foreground/10 pb-4">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">Integrations</h2>
                  <p className="text-xs sm:text-sm text-foreground/50 mt-1">Connect an external account to import playlists into your queue.</p>
                </div>

                <div className="space-y-4">
                  {/* YouTube Integration */}
                  <div className="p-5 rounded-3xl border border-foreground/10 bg-foreground/3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-[#FF0000]/10 flex items-center justify-center shrink-0">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="#FF0000"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-foreground">YouTube</h3>
                        <p className="text-xs text-foreground/50 mt-0.5">Import playlists directly from your YouTube library</p>
                      </div>
                    </div>
                    {youtubeConnected === null ? (
                      <Loader2 className="w-5 h-5 animate-spin text-foreground/50" />
                    ) : youtubeConnected ? (
                      <button
                        onClick={async () => {
                          await youtubeApi.disconnect();
                          setYoutubeConnected(false);
                        }}
                        className="px-4 py-2 rounded-xl bg-foreground/5 hover:bg-bad-500/10 text-foreground/70 hover:text-bad-700 dark:text-bad-400 text-xs font-bold transition-all"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <a
                        href={youtubeApi.getConnectUrl()}
                        className="px-4 py-2 rounded-xl bg-[#FF0000] hover:bg-[#ff3333] text-white text-xs font-bold transition-all"
                      >
                        Connect Account
                      </a>
                    )}
                  </div>

                  {/* Spotify Integration */}
                  <div className="p-5 rounded-3xl border border-foreground/10 bg-foreground/3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-[#1DB954]/10 flex items-center justify-center shrink-0">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.24 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15.001 10.681 18.72 12.96c.42.18.6.78.24 1.08zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" /></svg>
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-foreground">Spotify</h3>
                        <p className="text-xs text-foreground/50 mt-0.5">Connect to search and enqueue tracks from Spotify</p>
                      </div>
                    </div>
                    <button
                      disabled
                      className="px-4 py-2 rounded-xl bg-foreground/5 text-foreground/40 text-xs font-bold cursor-not-allowed"
                    >
                      Coming Soon
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 4. Security & Password Tab */}
            {activeTab === 'security' && (
              <motion.div
                key="security"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6 max-w-2xl"
              >
                <div className="border-b border-foreground/10 pb-4">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">Security</h2>
                  <p className="text-xs sm:text-sm text-foreground/50 mt-1">Change the password you use to sign in.</p>
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
                <div className="border-b border-foreground/10 pb-4">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">Data & privacy</h2>
                  <p className="text-xs sm:text-sm text-foreground/50 mt-1">Take a copy of your data, check your connection, or close your account.</p>
                </div>

                {/* Data Export Card */}
                <div className="p-6 rounded-3xl bg-foreground/5 border border-foreground/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <h4 className="font-bold text-foreground text-base">Export your data</h4>
                    <p className="text-xs text-foreground/50">A JSON file with your profile, settings, and device list.</p>
                  </div>
                  <button
                    onClick={exportUserData}
                    className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-foreground text-background font-bold text-xs hover:scale-95 transition-all shrink-0 shadow-lg"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download JSON</span>
                  </button>
                </div>

                {/* Connection — read from ConnectionContext, so these reflect
                    what's actually happening rather than hardcoded "Connected". */}
                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-foreground/50">Connection</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { label: 'Network', ok: isOnline, good: 'Online', bad: 'Offline' },
                      { label: 'Server', ok: isServerReachable, good: 'Reachable', bad: 'Unreachable' },
                      { label: 'Realtime', ok: isSocketConnected, good: 'Connected', bad: 'Disconnected' },
                    ].map(({ label, ok, good, bad }) => (
                      <div key={label} className="p-4 rounded-2xl bg-foreground/5 border border-foreground/10 flex flex-col gap-1">
                        <span className="text-[11px] font-semibold text-foreground/50">{label}</span>
                        <span className={cn('text-sm', 'font-bold', 'flex', 'items-center', 'gap-1.5', ok ? 'text-ok-700 dark:text-ok-400' : 'text-bad-700 dark:text-bad-400')}>
                          {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                          {ok ? good : bad}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-foreground/35">SyncBeats v1.4.0</p>
                </div>

                {/* Danger Zone */}
                <div className="pt-6 border-t border-bad-500/20 space-y-4">
                  <div className="flex flex-col gap-1">
                    <h4 className="font-semibold text-bad-700 dark:text-bad-400 text-base flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Danger zone
                    </h4>
                    <p className="text-xs text-foreground/50">Request permanent deletion of your account, rooms, uploads and listening history.</p>
                  </div>

                  {!showDeleteModal ? (
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="px-5 py-3 rounded-2xl bg-bad-500/10 hover:bg-bad-500/20 text-bad-700 dark:text-bad-400 border border-bad-500/30 font-bold text-xs transition-all active:scale-95 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Account</span>
                    </button>
                  ) : (
                    <div className="p-4 rounded-2xl bg-bad-500/10 border border-bad-500/30 flex flex-col gap-3 max-w-md">
                      <p className="text-xs text-bad-700 dark:text-bad-300 font-semibold">Deletion is handled by hand for now. This opens a pre-filled email to support — we wipe the account and everything attached to it, and it can&apos;t be undone.</p>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 rounded-xl bg-foreground/10 text-foreground font-semibold text-xs">
                          Cancel
                        </button>
                        <a href={deleteRequestHref} className="px-4 py-2 rounded-xl bg-bad-500 text-white font-bold text-xs">
                          Email the request
                        </a>
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
