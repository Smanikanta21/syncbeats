"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { UploadProvider } from "../../context/UploadContext";
import { SyncProvider } from "../../context/SyncContext";
const DynamicIsland = dynamic(() => import("../../components/dynamic-island").then(m => m.DynamicIsland), { ssr: false });
import { devicesApi, type Device } from "../../lib/api";
import { MessageSquare } from "lucide-react";

import { FeedbackModal } from "../../components/FeedbackModal";
import { cn } from "@/lib/utils";
import { useLoadingTasks } from "../../context/LoadingContext";

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  const { user, device, needsDeviceRename, emailVerified, loading, serverError, resendVerification, renameDevice, replaceDevice } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isRoom = pathname?.startsWith("/room/") && pathname !== "/room/default";
  const isProfile = pathname?.includes("/profile");
  const isHub = pathname === "/hub";
  const [deviceName, setDeviceName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showExistingFlow, setShowExistingFlow] = useState(false);
  const [savedDevices, setSavedDevices] = useState<Device[]>([]);
  const [replacingDeviceId, setReplacingDeviceId] = useState<string | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [fetchingDevices, setFetchingDevices] = useState(false);
  const { setLoadingTask } = useLoadingTasks();

  useEffect(() => {
    const task = loading
      ? { title: "Restoring your session", detail: "Checking your sign-in and room access.", priority: 5 }
      : fetchingDevices
        ? { title: "Preparing this device", detail: "Loading your trusted devices and audio settings.", priority: 5 }
        : null;
    setLoadingTask("session", task);
    return () => setLoadingTask("session", null);
  }, [loading, fetchingDevices, setLoadingTask]);

  // Auto-prompt feedback modal once per session after 5 mins in room
  useEffect(() => {
    if (!isRoom) return;
    const key = "sb_feedback_prompted";
    if (sessionStorage.getItem(key)) return;

    const timer = setTimeout(() => {
      setShowFeedbackModal(true);
      sessionStorage.setItem(key, "1");
    }, 5 * 60 * 1000); // 5 mins

    return () => clearTimeout(timer);
  }, [isRoom]);

  // Global event listener to open feedback modal from any component
  useEffect(() => {
    const handleOpen = () => setShowFeedbackModal(true);
    window.addEventListener("syncbeats-open-feedback", handleOpen);
    return () => window.removeEventListener("syncbeats-open-feedback", handleOpen);
  }, []);

  const quickDeviceOptions = ["iPhone", "Android", "Mac", "Windows", "Device"];

  const buildSuggestedName = (label: string) => {
    const owner = user?.name?.trim() || "My";
    const suffix = owner === "My" ? "" : "'s";
    return `${owner}${suffix} ${label}`;
  };

  // Redirect to login if not authenticated and server is reachable
  useEffect(() => {
    if (!loading && !user && !serverError) {
      const returnTo = encodeURIComponent(pathname || "/room/default");
      router.replace(`/login?returnTo=${returnTo}`);
    }
  }, [user, loading, serverError, router, pathname]);

  useEffect(() => {
    if (!device) return;
    setDeviceName(device.name || buildSuggestedName("Device"));
  }, [device, user]);

  useEffect(() => {
    if (!needsDeviceRename) {
      setSavedDevices([]);
      setShowExistingFlow(false);
      setFetchingDevices(false);
      return;
    }

    setFetchingDevices(true);
    devicesApi.mine()
      .then(({ devices }) => {
        setSavedDevices(devices.filter(d => !d.device_key.startsWith('NATIVE-')));
      })
      .catch(() => {
        setSavedDevices([]);
      })
      .finally(() => {
        setFetchingDevices(false);
      });
  }, [needsDeviceRename]);

  const replacementCandidates = savedDevices.filter((saved) => saved.id !== device?.id);

  useEffect(() => {
    if (replacementCandidates.length > 0 && !showExistingFlow) {
      setShowExistingFlow(true);
    }
  }, [replacementCandidates.length]);

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = deviceName.trim();
    if (!trimmed) return;
    
    // Check if the name already exists
    if (savedDevices.some(d => d.name.toLowerCase() === trimmed.toLowerCase() && d.id !== device?.id)) {
      setNameError("This device name is already in use. Please choose another name or select it from existing devices.");
      return;
    }

    setNameError(null);
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

  const isLocalUnverified = user?.auth_provider === "LOCAL" && !emailVerified;

  const handleResendVerification = async () => {
    if (!user?.email || resendingVerification) return;

    setResendingVerification(true);
    setVerificationError(null);
    setVerificationMessage(null);
    try {
      await resendVerification(user.email);
      setVerificationMessage("Verification email sent. Please check your inbox.");
    } catch (err) {
      setVerificationError((err as Error).message || "Failed to resend verification email");
    } finally {
      setResendingVerification(false);
    }
  };

  // Instead of a full-screen blocking loader, we just render the layout shell
  // and delay the children rendering until the user is available.

  // Kept below every hook on purpose. This used to return early, above the three
  // device/verification effects — so the render that first saw `serverError`
  // mounted fewer hooks than the previous one and React threw
  // "rendered fewer hooks than expected" instead of showing this screen.
  if (serverError) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center bg-background px-6 text-center text-foreground">
        <p className="micro-label mb-3">Offline</p>
        <h1 className="mb-3 font-display text-display font-semibold">Cannot connect to server</h1>
        <p className="mb-8 max-w-md text-lead text-foreground/55 text-pretty">
          The SyncBeats server is currently unreachable. Please check your connection or wait a moment for the server to wake up.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-foreground px-6 py-3 font-semibold text-background shadow-lg transition-all hover:opacity-90 active:scale-95"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <UploadProvider>
    <SyncProvider>
      {user && !loading && !isProfile && !isHub && <DynamicIsland />}
      {user && !loading && isLocalUnverified && (
        <div className="fixed top-24 left-1/2 z-60 w-[min(92vw,720px)] -translate-x-1/2 rounded-3xl border border-warn-400/30 bg-warn-500/10 px-4 py-3 backdrop-blur-xl">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-warn-700 dark:text-warn-100">
              Your email is not verified yet. Please verify to secure your account and keep full access.
            </p>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendingVerification}
              className="h-9 rounded-lg bg-warn-200 px-3 text-sm font-semibold text-background hover:bg-warn-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resendingVerification ? "Sending..." : "Resend verification"}
            </button>
          </div>
          {verificationMessage && <p className="mt-2 text-xs text-ok-700 dark:text-ok-300">{verificationMessage}</p>}
          {verificationError && <p className="mt-2 text-xs text-bad-700 dark:text-bad-300">{verificationError}</p>}
        </div>
      )}
      {user && !loading && !fetchingDevices && needsDeviceRename && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-background/70 backdrop-blur-xl px-4">
          <div className="w-full max-w-md rounded-4xl border border-foreground/10 bg-background p-6 shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
            <div className="mb-4">
              <p className="micro-label">Device setup</p>
              <h2 className="mt-2 text-2xl font-black text-foreground">Select your device</h2>
              <p className="mt-2 text-sm text-foreground/50">This login is not registered in our device database yet. Pick the device type or enter a custom name.</p>
            </div>
            {!showExistingFlow ? (
              <form className="space-y-4" onSubmit={handleRename}>
                <div className="grid grid-cols-2 gap-2">
                  {quickDeviceOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDeviceName(buildSuggestedName(option))}
                      className="h-10 rounded-xl border border-foreground/10 bg-foreground/5 px-3 text-sm font-semibold text-foreground transition-colors hover:border-foreground/30 hover:bg-foreground/10"
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <input
                  autoFocus
                  value={deviceName}
                  onChange={(e) => { setDeviceName(e.target.value); setNameError(null); }}
                  className={cn('w-full', 'rounded-2xl', 'border', nameError ? 'border-bad-500/50 focus:border-bad-500' : 'border-foreground/10 focus:border-foreground/30', 'bg-foreground/5', 'px-4', 'py-3', 'text-foreground', 'outline-none', 'transition-colors', 'placeholder:text-foreground/40')}
                  placeholder="Abhinay's iPhone"
                />
                {nameError && (
                  <p className="text-bad-700 dark:text-bad-400 text-xs font-semibold px-1">{nameError}</p>
                )}
                <button
                  disabled={saving || !deviceName.trim()}
                  className="h-12 w-full rounded-2xl bg-foreground font-bold text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save and continue"}
                </button>
                {replacementCandidates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowExistingFlow(true)}
                    className="h-11 w-full rounded-2xl border border-foreground/10 bg-foreground/5 font-semibold text-foreground transition-colors hover:border-foreground/30 hover:bg-foreground/10"
                  >
                    This device already exists?
                  </button>
                )}
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-foreground/60">Choose your existing device to replace this newly detected one.</p>
                <div className="max-h-64 space-y-2 overflow-auto pr-1">
                  {replacementCandidates.map((saved) => (
                    <button
                      key={saved.id}
                      type="button"
                      onClick={() => handleReplaceDevice(saved.id)}
                      disabled={!!replacingDeviceId}
                      className="w-full rounded-xl border border-foreground/10 bg-foreground/5 px-4 py-3 text-left text-foreground transition-colors hover:border-foreground/30 hover:bg-foreground/10 disabled:opacity-60"
                    >
                      <p className="font-semibold">{saved.name}</p>
                      <p className="text-xs text-foreground/50 mt-1">Last seen {new Date(saved.last_seen_at).toLocaleDateString()}</p>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowExistingFlow(false)}
                  className="h-11 w-full rounded-2xl border border-foreground/10 bg-foreground/5 font-semibold text-foreground transition-colors hover:border-foreground/30 hover:bg-foreground/10"
                >
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={isRoom ? "h-dvh overflow-hidden flex justify-center w-full" : isProfile ? "min-h-screen w-full relative z-10" : isHub ? "min-h-dvh w-full relative z-10" : "pt-[calc(max(6.5rem,env(safe-area-inset-top,0px)+5rem))] pb-12"}>
        {(!loading && user) ? children : null}
      </div>

      {user && !loading && (
        <>
          <button
            type="button"
            onClick={() => setShowFeedbackModal(true)}
            className="hidden sm:flex fixed bottom-4 right-4 z-40 items-center gap-2 rounded-full border border-foreground/10 bg-background/80 px-3.5 py-2 text-xs font-bold text-foreground/80 backdrop-blur-xl shadow-lg hover:border-foreground/30 hover:bg-background hover:text-foreground transition-all active:scale-95"
          >
            <MessageSquare className="w-3.5 h-3.5 text-[var(--accent-color)] fill-[var(--accent-color)]" />
            <span>Rate Us</span>
          </button>

          <FeedbackModal
            isOpen={showFeedbackModal}
            onClose={() => setShowFeedbackModal(false)}
          />
        </>
      )}
    </SyncProvider>
    </UploadProvider>
  );
}
