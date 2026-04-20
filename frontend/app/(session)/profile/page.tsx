"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, LogOut, Edit3, Shield, Activity, Music, Laptop, Smartphone, X, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/AuthContext";
import { devicesApi, roomsApi, type Device } from "../../../lib/api";

function DeviceGlyph({ userAgent }: { userAgent: string | null }) {
  if (userAgent?.includes("iPhone") || userAgent?.includes("Android")) return <Smartphone className="w-4 h-4 text-foreground/70" />;
  return <Laptop className="w-4 h-4 text-foreground/70" />;
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
  const { user, device, logout, emailVerified } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [hostedSessionCount, setHostedSessionCount] = useState(0);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [showDeviceRename, setShowDeviceRename] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState("");
  const [savingDeviceRename, setSavingDeviceRename] = useState(false);

  const displayName = profileName.trim() || user?.name || "—";
  const displayEmail = profileEmail.trim() || user?.email || "—";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const accountId = user ? `#SB-${user.id.slice(0, 4).toUpperCase()}` : "—";
  const memberSince = user ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—";

  useEffect(() => {
    devicesApi.mine()
      .then(({ devices }) => setDevices(devices))
      .catch(() => { });
  }, []);

  useEffect(() => {
    roomsApi.mine()
      .then(({ rooms }) => setHostedSessionCount(rooms.length))
      .catch(() => setHostedSessionCount(0));
  }, []);


  useEffect(() => {
    setProfileName(user?.name ?? "");
    setProfileEmail(user?.email ?? "");
  }, [user?.name, user?.email]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const openEditProfile = () => {
    setProfileName(user?.name ?? "");
    setProfileEmail(user?.email ?? "");
    setIsEditingProfile(true);
  };

  const cancelEditProfile = () => {
    setProfileName(user?.name ?? "");
    setProfileEmail(user?.email ?? "");
    setIsEditingProfile(false);
  };

  const saveEditProfile = () => {
    // TODO: Add API endpoint to update profile (name, email)
    setIsEditingProfile(false);
  };

  const openDeviceRename = (deviceId: string, currentName: string) => {
    setEditingDeviceId(deviceId);
    setEditingDeviceName(currentName);
    setShowDeviceRename(true);
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
      setShowDeviceRename(false);
      setEditingDeviceId(null);
    } catch (err) {
      console.error("Failed to rename device:", err);
    } finally {
      setSavingDeviceRename(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative px-4 sm:px-6 lg:px-8 overflow-hidden z-0 pb-20">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[400px] bg-foreground/5 blur-[150px] rounded-full pointer-events-none -z-10" />

      <main className="w-full max-w-5xl mx-auto flex-1 flex flex-col mt-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(220px,auto)]">

          {/* 1. Main Profile Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="md:col-span-2 md:row-span-2 glass-panel rounded-[2.5rem] border border-foreground/5 bg-background/60 shadow-[0_20px_40px_rgba(0,0,0,0.4)] relative overflow-hidden group flex flex-col p-10"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-foreground/5 blur-[60px] rounded-full pointer-events-none group-hover:bg-foreground/10 transition-colors duration-1000" />

            <div className="flex justify-between items-start w-full relative z-10">
              <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-foreground/20 to-foreground/10 flex items-center justify-center border-4 border-background shadow-lg">
                <span className="text-4xl font-black text-foreground tracking-widest">{initials}</span>
              </div>
              {!isEditingProfile ? (
                <button onClick={openEditProfile} className="h-10 px-6 rounded-full bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground font-semibold flex items-center gap-2 transition-all">
                  <Edit3 className="w-4 h-4" /> Edit Profile
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={cancelEditProfile} className="h-10 px-4 rounded-full bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground font-semibold transition-all">
                    Cancel
                  </button>
                  <button onClick={saveEditProfile} className="h-10 px-5 rounded-full bg-foreground text-background font-semibold transition-all hover:opacity-90">
                    Save
                  </button>
                </div>
              )}
            </div>

            <div className="mt-auto relative z-10">
              {!isEditingProfile ? (
                <>
                  <h1 className="text-5xl font-black text-foreground mb-2 tracking-tight">{displayName}</h1>
                  <div className="mb-6 flex flex-wrap items-center gap-3">
                    <p className="text-foreground/50 font-medium text-xl">{displayEmail}</p>
                    {emailVerified && (
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.22em] text-emerald-300 disabled:cursor-default"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Verified
                      </button>
                    )}
                    {!emailVerified && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/5 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.22em] text-foreground/60">
                        Unverified
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3 mb-6">
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full rounded-2xl border border-foreground/10 bg-foreground/5 px-4 py-3 text-3xl font-black tracking-tight text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-foreground/30"
                    placeholder="Your name"
                  />
                  <input
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className="w-full rounded-2xl border border-foreground/10 bg-foreground/5 px-4 py-3 text-lg font-medium text-foreground/70 outline-none transition-colors placeholder:text-foreground/40 focus:border-foreground/30"
                    placeholder="your@email.com"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-foreground/5 rounded-2xl p-4 border border-foreground/5">
                  <p className="text-xs text-foreground/50 font-bold uppercase tracking-widest mb-1">Member Since</p>
                  <p className="text-foreground/70 font-medium">{memberSince}</p>
                </div>
                <div className="bg-foreground/5 rounded-2xl p-4 border border-foreground/5">
                  <p className="text-xs text-foreground/50 font-bold uppercase tracking-widest mb-1">Account ID</p>
                  <p className="text-foreground/70 font-mono text-sm">{accountId}</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 2. Subscription */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}
            className="md:col-span-1 md:row-span-1 glass-panel rounded-[2.5rem] border border-foreground/5 bg-background/60 shadow-xl flex flex-col p-8 relative overflow-hidden group hover:border-foreground/10 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center"><Shield className="w-5 h-5 text-foreground/70" /></div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-green-400 font-bold tracking-widest uppercase">Active</span>
              </div>
            </div>
            <div className="mt-auto">
              <h3 className="text-2xl font-black text-foreground mb-1">Beta Plan</h3>
              <p className="text-foreground/50 text-sm font-medium">Free during early access</p>
            </div>
          </motion.div>

          {/* 3. Stats */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }}
            className="md:col-span-1 md:row-span-1 glass-panel rounded-[2.5rem] border border-foreground/5 bg-background/60 shadow-xl flex flex-col p-8 relative overflow-hidden group hover:border-foreground/10 transition-colors">
              <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center mb-4"><Activity className="w-5 h-5 text-foreground/70" /></div>
              <div className="mt-auto flex items-end gap-2">
                <h3 className="text-5xl font-black text-foreground leading-none">{hostedSessionCount}</h3>
                <p className="text-foreground/50 text-sm font-medium pb-1 leading-tight">Sessions<br />Hosted</p>
              </div>
            </motion.div>

          {/* 4. Integrations */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
            className="md:col-span-1 md:row-span-1 glass-panel rounded-[2.5rem] border border-foreground/5 bg-background/60 shadow-xl flex flex-col p-8 relative overflow-hidden group hover:border-foreground/10 transition-colors cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center mb-4"><Music className="w-5 h-5 text-foreground/70" /></div>
            <div className="mt-auto">
              <h3 className="text-xl font-bold text-foreground mb-1">Link Spotify</h3>
              <p className="text-foreground/50 text-sm font-medium">Sync your library</p>
            </div>
          </motion.div>

          {/* 5. Log Out */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 }}
            onClick={handleLogout}
            className="md:col-span-1 md:row-span-1 glass-panel rounded-[2.5rem] border border-foreground/5 bg-background/60 shadow-xl flex flex-col p-8 relative overflow-hidden group hover:border-red-500/30 hover:bg-red-500/5 transition-all cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-4 group-hover:bg-red-500/20 transition-colors">
              <LogOut className="w-5 h-5 text-red-500" />
            </div>
            <div className="mt-auto">
              <h3 className="text-xl font-bold text-red-500 mb-1">Log Out</h3>
              <p className="text-foreground/50 text-sm font-medium">Clear session &amp; return to login</p>
            </div>
          </motion.div>

          {/* 6. Change Password */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}
            className="md:col-span-1 md:row-span-1 glass-panel rounded-[2.5rem] border border-foreground/5 bg-background/60 shadow-xl flex flex-col p-8 relative overflow-hidden group hover:border-blue-500/30 hover:bg-blue-500/5 transition-all cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
              <KeyRound className="w-5 h-5 text-blue-500" />
            </div>
            <div className="mt-auto">
              <h3 className="text-xl font-bold text-blue-500 mb-1">Change Password</h3>
              <p className="text-foreground/50 text-sm font-medium">Update your password</p>
            </div>
          </motion.div>

          {/* 6. Devices */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}
            className="md:col-span-3 glass-panel rounded-[2.5rem] border border-foreground/5 bg-background/60 shadow-xl p-12">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-foreground/50">Account Devices</p>
                <h3 className="text-2xl font-black text-foreground mt-1">Your devices</h3>
              </div>
              <div className="text-sm text-foreground/50 font-medium">{devices.length} saved</div>
            </div>
            {devices.length === 0 ? (
              <p className="text-foreground/40 text-sm font-medium">No devices saved yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {devices.map((savedDevice) => {
                  const isCurrent = device?.id === savedDevice.id;
                  return (
                    <div
                      key={savedDevice.id}
                      className={`rounded-3xl border p-4 transition-colors ${isCurrent ? "border-foreground/20 bg-foreground/5" : "border-foreground/5 bg-foreground/5"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-2xl bg-background/40 border border-foreground/5 flex items-center justify-center shrink-0">
                            <DeviceGlyph userAgent={savedDevice.user_agent} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-foreground truncate">{savedDevice.name}</h4>
                              {isCurrent && <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[10px] font-black uppercase tracking-widest">Current</span>}
                            </div>
                            <p className="text-xs text-foreground/50 mt-1 truncate">{getPlatformLabel(savedDevice.user_agent)}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => openDeviceRename(savedDevice.id, savedDevice.name)}
                          className="h-8 w-8 rounded-lg bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 flex items-center justify-center text-foreground/60 hover:text-white transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs text-foreground/50">
                        <span>Last seen {new Date(savedDevice.last_seen_at).toLocaleDateString()}</span>
                        <span>{savedDevice.device_key.slice(0, 8).toUpperCase()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>

        {/* Device Rename Modal */}
        {showDeviceRename && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-xl px-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-[2rem] border border-foreground/10 bg-background p-6 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-foreground/50">Device</p>
                  <h2 className="text-2xl font-black text-foreground mt-1">Rename Device</h2>
                </div>
                <button onClick={() => setShowDeviceRename(false)} className="text-foreground/60 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <form className="space-y-4" onSubmit={handleDeviceRename}>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground/60">Device Name</label>
                  <input
                    autoFocus
                    type="text"
                    value={editingDeviceName}
                    onChange={(e) => setEditingDeviceName(e.target.value)}
                    className="w-full rounded-2xl border border-foreground/10 bg-foreground/5 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-foreground/40 focus:border-foreground/30"
                    placeholder="My Device"
                  />
                </div>
                <button
                  disabled={savingDeviceRename || !editingDeviceName.trim()}
                  className="h-12 w-full rounded-2xl bg-foreground font-bold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingDeviceRename ? "Saving..." : "Save Device Name"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
