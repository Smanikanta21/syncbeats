"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, LogOut, Edit3, Smartphone, Laptop, X, KeyRound, MonitorSmartphone, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { devicesApi, roomsApi, type Device } from "../../../lib/api";
import { SettingsPanel } from "../../../components/SettingsPanel";

function DeviceGlyph({ userAgent }: { userAgent: string | null }) {
  if (userAgent?.includes("iPhone") || userAgent?.includes("Android")) return <Smartphone className="w-5 h-5 text-foreground/70" />;
  return <Laptop className="w-5 h-5 text-foreground/70" />;
}

function getPlatformLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("android")) return "Android";
  if (ua.includes("mac")) return "Mac";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("linux")) return "Linux";
  return "Browser";
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, device, logout, emailVerified, updateProfile } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [hostedSessionCount, setHostedSessionCount] = useState(0);
  
  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Modals state
  const [activePanel, setActivePanel] = useState<'devices' | 'settings' | null>(null);
  
  useEffect(() => {
    if (window.innerWidth >= 768) {
      setActivePanel('settings');
    }
  }, []);
  
  // Device Renaming state
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState("");
  const [savingDeviceRename, setSavingDeviceRename] = useState(false);

  const displayName = profileName.trim() || user?.name || "—";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const accountId = user ? `#SB-${user.id.slice(0, 4).toUpperCase()}` : "—";
  const memberSince = user ? new Date(user.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—";

  useEffect(() => {
    devicesApi.mine().then(({ devices }) => setDevices(devices)).catch(() => {});
    roomsApi.mine().then(({ rooms }) => setHostedSessionCount(rooms.length)).catch(() => setHostedSessionCount(0));
  }, []);

  useEffect(() => {
    setProfileName(user?.name ?? "");
  }, [user?.name]);

  const handleLogout = () => {
    logout();
    router.push("/login");
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
    <div className="h-full w-full flex flex-col relative px-4 sm:px-6 lg:px-8 overflow-hidden z-0 pt-28 pb-8">
      {/* Subtle Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-full max-w-2xl h-[400px] bg-foreground/5 blur-[150px] rounded-full pointer-events-none -z-10" />

      {/* Main container sets flex-row on md screens to allow side-by-side layout */}
      <main className="w-full max-w-5xl mx-auto flex-1 flex flex-col md:flex-row items-start justify-center gap-6 relative">
        <motion.div
          layout
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.5 }}
          className="w-full max-w-md shrink-0 relative rounded-[2.5rem] bg-background/60 backdrop-blur-2xl border border-foreground/10 shadow-[0_30px_60px_rgba(0,0,0,0.4)] p-8 flex flex-col items-center overflow-hidden z-10"
        >
          {/* Avatar Section */}
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-foreground/10 blur-2xl rounded-full scale-150" />
            <div className="relative w-32 h-32 rounded-full bg-gradient-to-tr from-foreground/10 to-foreground/5 flex items-center justify-center border border-foreground/20 shadow-xl overflow-hidden backdrop-blur-md">
              <span className="text-4xl font-black text-foreground tracking-widest">{initials}</span>
            </div>
          </div>

          {/* Name & Edit Section */}
          <div className="w-full text-center mb-6 relative">
            {!isEditingProfile ? (
              <div className="flex flex-col items-center group cursor-pointer" onClick={() => setIsEditingProfile(true)}>
                <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-2">
                  {displayName}
                  <Edit3 className="w-4 h-4 text-foreground/30 group-hover:text-foreground/70 transition-colors" />
                </h1>
                <p className="text-foreground/50 font-medium text-base mt-1">{user?.email}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 w-full">
                <input
                  autoFocus
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEditProfile()}
                  className="w-full text-center rounded-2xl border border-foreground/20 bg-foreground/5 px-4 py-3 text-2xl font-black tracking-tight text-foreground outline-none transition-colors focus:border-foreground/40 focus:bg-foreground/10"
                  placeholder="Your name"
                />
                <div className="flex items-center gap-2 w-full justify-center">
                  <button onClick={() => { setIsEditingProfile(false); setProfileName(user?.name ?? ""); }} className="flex-1 max-w-[120px] py-2.5 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-foreground font-semibold transition-all">
                    Cancel
                  </button>
                  <button onClick={saveEditProfile} disabled={isSavingProfile} className="flex-1 max-w-[120px] py-2.5 rounded-xl bg-foreground text-background font-bold transition-all hover:scale-[0.98] disabled:opacity-70">
                    {isSavingProfile ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
            
            {/* Status Pills */}
            <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
              {emailVerified ? (
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
          <div className="w-full grid grid-cols-2 gap-3 mb-8">
            <div className="bg-foreground/5 rounded-2xl p-4 flex flex-col items-center justify-center border border-foreground/5">
              <span className="text-2xl font-black text-foreground">{hostedSessionCount}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/50 mt-1">Sessions Hosted</span>
            </div>
            <div className="bg-foreground/5 rounded-2xl p-4 flex flex-col items-center justify-center border border-foreground/5">
              <span className="text-lg font-black text-foreground">{memberSince}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/50 mt-1">Member Since</span>
            </div>
          </div>

          {/* Action List */}
          <div className="w-full flex flex-col gap-2">
            <button
              onClick={() => setActivePanel(activePanel === 'settings' ? null : 'settings')}
              className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all group border ${activePanel === 'settings' ? 'bg-foreground/10 border-foreground/20' : 'bg-foreground/5 border-transparent hover:bg-foreground/10 hover:border-foreground/10'}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-foreground/10 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-foreground/70" />
                </div>
                <div className="text-left">
                  <h4 className="font-bold text-foreground">App Settings</h4>
                  <p className="text-xs text-foreground/50">Audio, Sync & Appearance</p>
                </div>
              </div>
              <Settings className={`w-4 h-4 transition-all duration-300 ${activePanel === 'settings' ? 'text-foreground rotate-90' : 'text-foreground/30 group-hover:text-foreground/70'}`} />
            </button>

            <button
              onClick={() => setActivePanel(activePanel === 'devices' ? null : 'devices')}
              className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all group border ${activePanel === 'devices' ? 'bg-foreground/10 border-foreground/20' : 'bg-foreground/5 border-transparent hover:bg-foreground/10 hover:border-foreground/10'}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-foreground/10 flex items-center justify-center">
                  <MonitorSmartphone className="w-5 h-5 text-foreground/70" />
                </div>
                <div className="text-left">
                  <h4 className="font-bold text-foreground">Manage Devices</h4>
                  <p className="text-xs text-foreground/50">{devices.length} devices linked</p>
                </div>
              </div>
              <Settings className={`w-4 h-4 transition-all duration-300 ${activePanel === 'devices' ? 'text-foreground rotate-90' : 'text-foreground/30 group-hover:text-foreground/70'}`} />
            </button>

            <button
              onClick={() => router.push("/forgot-password" + (user?.email ? "?email=" + encodeURIComponent(user.email) : ""))}
              className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-foreground/5 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-foreground/50 group-hover:text-foreground transition-colors" />
              </div>
              <h4 className="font-bold text-foreground/70 group-hover:text-foreground transition-colors">Change Password</h4>
            </button>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-red-500/10 transition-all group mt-2"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center">
                <LogOut className="w-5 h-5 text-red-400 group-hover:text-red-500 transition-colors" />
              </div>
              <h4 className="font-bold text-red-400 group-hover:text-red-500 transition-colors">Log Out</h4>
            </button>
          </div>
        </motion.div>

        {/* Medium+ Screens: Side Panel */}
        <AnimatePresence mode="popLayout">
          {activePanel === 'devices' && (
            <motion.div
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", bounce: 0, duration: 0.5 }}
              className="hidden md:flex flex-col w-full max-w-md shrink-0 gap-3 relative z-0 h-full max-h-full"
            >
              <div className="flex items-center justify-between px-2 pb-2 shrink-0">
                <h2 className="text-2xl font-black text-foreground">Your Devices</h2>
                <button onClick={() => setActivePanel(null)} className="p-2 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar pb-10">
                {devices.length === 0 ? (
                  <p className="text-foreground/40 text-sm font-medium text-center py-10">No devices saved yet.</p>
                ) : (
                  devices.map((savedDevice, index) => {
                    const isCurrent = device?.id === savedDevice.id;
                    const isOffline = !isCurrent && (new Date().getTime() - new Date(savedDevice.last_seen_at).getTime() > 5 * 60 * 1000);
                    const isEditingThis = editingDeviceId === savedDevice.id;

                    return (
                      <motion.div 
                        key={savedDevice.id} 
                        layout
                        initial={{ opacity: 0, y: -40, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: index * 0.08, type: "spring", bounce: 0.4, duration: 0.6 }}
                        className={`p-5 rounded-3xl border transition-all shadow-lg ${isCurrent ? "bg-foreground/5 border-foreground/20 backdrop-blur-xl" : "bg-background/40 backdrop-blur-md border-foreground/10"}`}
                      >
                        {!isEditingThis ? (
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-12 rounded-2xl bg-background/50 flex items-center justify-center border border-foreground/5 shrink-0">
                                <DeviceGlyph userAgent={savedDevice.user_agent} />
                              </div>
                              <div className="min-w-0 flex flex-col">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-foreground text-base truncate">{savedDevice.name}</h4>
                                  {isCurrent && <span className="px-2 py-0.5 rounded-full bg-foreground/10 text-foreground text-[10px] font-black uppercase tracking-widest shrink-0">Current</span>}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOffline ? 'bg-red-400' : 'bg-green-400 animate-pulse'}`} />
                                  <span className="text-xs text-foreground/50 truncate">{getPlatformLabel(savedDevice.user_agent)} • Last seen {new Date(savedDevice.last_seen_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => openDeviceRename(savedDevice.id, savedDevice.name)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition-colors">
                                <Edit3 className="w-4 h-4" />
                              </button>
                              {!isCurrent && (
                                <button onClick={() => handleDeleteDevice(savedDevice.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-foreground/50 hover:text-red-500 transition-colors">
                                  <LogOut className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <form onSubmit={handleDeviceRename} className="flex flex-col gap-3">
                            <label className="text-xs font-bold uppercase tracking-widest text-foreground/50">Rename Device</label>
                            <input
                              autoFocus
                              value={editingDeviceName}
                              onChange={(e) => setEditingDeviceName(e.target.value)}
                              className="w-full rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm font-semibold text-foreground outline-none transition-colors focus:border-foreground/30"
                              placeholder="Device Name"
                            />
                            <div className="flex items-center gap-2 justify-end mt-1">
                              <button type="button" onClick={() => setEditingDeviceId(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-foreground/70 hover:bg-foreground/5 transition-colors">
                                Cancel
                              </button>
                              <button type="submit" disabled={savingDeviceRename || !editingDeviceName.trim()} className="px-5 py-2 rounded-xl text-sm font-bold bg-foreground text-background transition-transform active:scale-95 disabled:opacity-50">
                                {savingDeviceRename ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </form>
                        )}
                      </motion.div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}

          {activePanel === 'settings' && (
            <motion.div
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", bounce: 0, duration: 0.5 }}
              className="hidden md:flex flex-col w-full max-w-md shrink-0 relative z-0 h-full max-h-[calc(100vh-10rem)]"
            >
              <SettingsPanel onClose={() => setActivePanel(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Screens: Bottom Modal */}
      <AnimatePresence>
        {activePanel === 'devices' && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActivePanel(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.5 }}
              className="w-full bg-background/90 border-t border-foreground/10 rounded-t-[2.5rem] shadow-[0_-20px_50px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col max-h-[85vh] relative z-10"
            >
              <div className="p-6 border-b border-foreground/5 flex items-center justify-between sticky top-0 bg-background/50 backdrop-blur-md z-10">
                <div>
                  <h2 className="text-2xl font-black text-foreground">Devices</h2>
                  <p className="text-xs font-medium text-foreground/50 mt-1">Manage where your account is logged in</p>
                </div>
                <button onClick={() => setActivePanel(null)} className="p-2 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-4" data-lenis-prevent="true">
                {devices.length === 0 ? (
                  <p className="text-foreground/40 text-sm font-medium text-center py-10">No devices saved yet.</p>
                ) : (
                  devices.map((savedDevice) => {
                    const isCurrent = device?.id === savedDevice.id;
                    const isOffline = !isCurrent && (new Date().getTime() - new Date(savedDevice.last_seen_at).getTime() > 5 * 60 * 1000);
                    const isEditingThis = editingDeviceId === savedDevice.id;

                    return (
                      <div key={savedDevice.id} className={`p-4 rounded-2xl border transition-all ${isCurrent ? "bg-foreground/5 border-foreground/20 shadow-sm" : "bg-transparent border-foreground/10"}`}>
                        {!isEditingThis ? (
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-12 rounded-xl bg-background/50 flex items-center justify-center border border-foreground/5 shrink-0">
                                <DeviceGlyph userAgent={savedDevice.user_agent} />
                              </div>
                              <div className="min-w-0 flex flex-col">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-foreground text-base truncate">{savedDevice.name}</h4>
                                  {isCurrent && <span className="px-2 py-0.5 rounded-full bg-foreground/10 text-foreground text-[10px] font-black uppercase tracking-widest shrink-0">Current</span>}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOffline ? 'bg-red-400' : 'bg-green-400 animate-pulse'}`} />
                                  <span className="text-xs text-foreground/50 truncate">{getPlatformLabel(savedDevice.user_agent)} • Last seen {new Date(savedDevice.last_seen_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => openDeviceRename(savedDevice.id, savedDevice.name)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition-colors">
                                <Edit3 className="w-4 h-4" />
                              </button>
                              {!isCurrent && (
                                <button onClick={() => handleDeleteDevice(savedDevice.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-foreground/50 hover:text-red-500 transition-colors">
                                  <LogOut className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <form onSubmit={handleDeviceRename} className="flex flex-col gap-3">
                            <label className="text-xs font-bold uppercase tracking-widest text-foreground/50">Rename Device</label>
                            <input
                              autoFocus
                              value={editingDeviceName}
                              onChange={(e) => setEditingDeviceName(e.target.value)}
                              className="w-full rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm font-semibold text-foreground outline-none transition-colors focus:border-foreground/30"
                              placeholder="Device Name"
                            />
                            <div className="flex items-center gap-2 justify-end mt-1">
                              <button type="button" onClick={() => setEditingDeviceId(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-foreground/70 hover:bg-foreground/5 transition-colors">
                                Cancel
                              </button>
                              <button type="submit" disabled={savingDeviceRename || !editingDeviceName.trim()} className="px-5 py-2 rounded-xl text-sm font-bold bg-foreground text-background transition-transform active:scale-95 disabled:opacity-50">
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
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activePanel === 'settings' && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActivePanel(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.5 }}
              className="w-full bg-background/90 border-t border-foreground/10 rounded-t-[2.5rem] shadow-[0_-20px_50px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col max-h-[85vh] relative z-10 p-4"
            >
              <SettingsPanel onClose={() => setActivePanel(null)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
