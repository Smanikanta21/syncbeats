"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { UploadProvider } from "../../context/UploadContext";
import { DynamicIsland } from "../../components/DynamicIsland";
import { devicesApi, type Device } from "../../lib/api";

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  const { user, device, needsDeviceRename, loading, renameDevice, replaceDevice } = useAuth();
  const router = useRouter();
  const [deviceName, setDeviceName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showExistingFlow, setShowExistingFlow] = useState(false);
  const [savedDevices, setSavedDevices] = useState<Device[]>([]);
  const [replacingDeviceId, setReplacingDeviceId] = useState<string | null>(null);

  const quickDeviceOptions = ["iPhone", "Android", "Mac", "Windows", "Device"];

  const buildSuggestedName = (label: string) => {
    const owner = user?.name?.trim() || "My";
    const suffix = owner === "My" ? "" : "'s";
    return `${owner}${suffix} ${label}`;
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!device) return;
    setDeviceName(device.name || buildSuggestedName("Device"));
  }, [device, user]);

  useEffect(() => {
    if (!needsDeviceRename) {
      setSavedDevices([]);
      setShowExistingFlow(false);
      return;
    }

    devicesApi.mine()
      .then(({ devices }) => {
        setSavedDevices(devices);
      })
      .catch(() => {
        setSavedDevices([]);
      });
  }, [needsDeviceRename]);

  const replacementCandidates = savedDevices.filter((saved) => saved.id !== device?.id);

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceName.trim()) return;

    setSaving(true);
    try {
      await renameDevice(deviceName.trim());
    } finally {
      setSaving(false);
    }
  };

  const handleReplaceDevice = async (targetDeviceId: string) => {
    setReplacingDeviceId(targetDeviceId);
    try {
      await replaceDevice(targetDeviceId);
    } finally {
      setReplacingDeviceId(null);
    }
  };

  // Show nothing while rehydrating token
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
      </div>
    );
  }

  if (!user) return null; // redirect in-flight

  return (
    <UploadProvider>
      <DynamicIsland />
      {needsDeviceRename && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xl px-4">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-950 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-500">Device setup</p>
              <h2 className="mt-2 text-2xl font-black text-zinc-100">Select your device</h2>
              <p className="mt-2 text-sm text-zinc-500">This login is not registered in our device database yet. Pick the device type or enter a custom name.</p>
            </div>
            {!showExistingFlow ? (
              <form className="space-y-4" onSubmit={handleRename}>
                <div className="grid grid-cols-2 gap-2">
                  {quickDeviceOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDeviceName(buildSuggestedName(option))}
                      className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/30 hover:bg-white/10"
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <input
                  autoFocus
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-white/30"
                  placeholder="Abhinay's iPhone"
                />
                <button
                  disabled={saving || !deviceName.trim()}
                  className="h-12 w-full rounded-2xl bg-zinc-100 font-bold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save and continue"}
                </button>
                {replacementCandidates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowExistingFlow(true)}
                    className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 font-semibold text-zinc-200 transition-colors hover:border-white/30 hover:bg-white/10"
                  >
                    This device already exists?
                  </button>
                )}
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">Choose your existing device to replace this newly detected one.</p>
                <div className="max-h-64 space-y-2 overflow-auto pr-1">
                  {replacementCandidates.map((saved) => (
                    <button
                      key={saved.id}
                      type="button"
                      onClick={() => handleReplaceDevice(saved.id)}
                      disabled={!!replacingDeviceId}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-zinc-100 transition-colors hover:border-white/30 hover:bg-white/10 disabled:opacity-60"
                    >
                      <p className="font-semibold">{saved.name}</p>
                      <p className="text-xs text-zinc-500 mt-1">Last seen {new Date(saved.last_seen_at).toLocaleDateString()}</p>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowExistingFlow(false)}
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/5 font-semibold text-zinc-200 transition-colors hover:border-white/30 hover:bg-white/10"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="pt-32">{children}</div>
    </UploadProvider>
  );
}
