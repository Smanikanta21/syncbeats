"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { UploadProvider } from "../../context/UploadContext";
import { SyncProvider } from "../../context/SyncContext";
const DynamicIsland = dynamic(() => import("../../components/DynamicIsland").then(m => m.DynamicIsland), { ssr: false });
import { devicesApi, type Device } from "../../lib/api";
import { X, Camera, MessageSquare } from "lucide-react";

import { FeedbackModal } from "../../components/FeedbackModal";
import { cn } from "@/lib/utils";

export default function SessionLayout({ children }: { children: React.ReactNode }) {
  const { user, device, needsDeviceRename, emailVerified, loading, resendVerification, renameDevice, replaceDevice } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isRoom = pathname?.includes("/room/");
  const isProfile = pathname?.includes("/profile");
  const isFullscreen = isRoom || isProfile;
  const [deviceName, setDeviceName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showExistingFlow, setShowExistingFlow] = useState(false);
  const [savedDevices, setSavedDevices] = useState<Device[]>([]);
  const [replacingDeviceId, setReplacingDeviceId] = useState<string | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

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

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      const returnTo = encodeURIComponent(pathname || "/hub");
      router.replace(`/login?returnTo=${returnTo}`);
    }
  }, [user, loading, router, pathname]);

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
        setSavedDevices(devices.filter(d => !d.device_key.startsWith('NATIVE-')));
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

  return (
    <UploadProvider>
    <SyncProvider>
      {user && !loading && !isProfile && <DynamicIsland />}
      {user && !loading && isLocalUnverified && (
        <div className={cn('fixed', 'top-24', 'left-1/2', 'z-60', 'w-[min(92vw,720px)]', '-translate-x-1/2', 'rounded-3xl', 'border', 'border-amber-400/30', 'bg-amber-500/10', 'px-4', 'py-3', 'backdrop-blur-xl')}>
          <div className={cn('flex', 'flex-col', 'gap-2', 'sm:flex-row', 'sm:items-center', 'sm:justify-between')}>
            <p className={cn('text-sm', 'text-amber-100')}>
              Your email is not verified yet. Please verify to secure your account and keep full access.
            </p>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendingVerification}
              className={cn('h-9', 'rounded-lg', 'bg-amber-200', 'px-3', 'text-sm', 'font-semibold', 'text-background', 'hover:bg-amber-100', 'disabled:cursor-not-allowed', 'disabled:opacity-60')}
            >
              {resendingVerification ? "Sending..." : "Resend verification"}
            </button>
          </div>
          {verificationMessage && <p className={cn('mt-2', 'text-xs', 'text-emerald-300')}>{verificationMessage}</p>}
          {verificationError && <p className={cn('mt-2', 'text-xs', 'text-red-300')}>{verificationError}</p>}
        </div>
      )}
      {user && !loading && needsDeviceRename && (
        <div className={cn('fixed', 'inset-0', 'z-60', 'flex', 'items-center', 'justify-center', 'bg-background/70', 'backdrop-blur-xl', 'px-4')}>
          <div className={cn('w-full', 'max-w-md', 'rounded-4xl', 'border', 'border-foreground/10', 'bg-background', 'p-6', 'shadow-[0_30px_120px_rgba(0,0,0,0.7)]')}>
            <div className="mb-4">
              <p className={cn('text-xs', 'font-bold', 'uppercase', 'tracking-[0.3em]', 'text-foreground/50')}>Device setup</p>
              <h2 className={cn('mt-2', 'text-2xl', 'font-black', 'text-foreground')}>Select your device</h2>
              <p className={cn('mt-2', 'text-sm', 'text-foreground/50')}>This login is not registered in our device database yet. Pick the device type or enter a custom name.</p>
            </div>
            {!showExistingFlow ? (
              <form className="space-y-4" onSubmit={handleRename}>
                <div className={cn('grid', 'grid-cols-2', 'gap-2')}>
                  {quickDeviceOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDeviceName(buildSuggestedName(option))}
                      className={cn('h-10', 'rounded-xl', 'border', 'border-foreground/10', 'bg-foreground/5', 'px-3', 'text-sm', 'font-semibold', 'text-foreground', 'transition-colors', 'hover:border-foreground/30', 'hover:bg-foreground/10')}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <input
                  autoFocus
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  className={cn('w-full', 'rounded-2xl', 'border', 'border-foreground/10', 'bg-foreground/5', 'px-4', 'py-3', 'text-foreground', 'outline-none', 'transition-colors', 'placeholder:text-foreground/40', 'focus:border-foreground/30')}
                  placeholder="Abhinay's iPhone"
                />
                <button
                  disabled={saving || !deviceName.trim()}
                  className={cn('h-12', 'w-full', 'rounded-2xl', 'bg-foreground', 'font-bold', 'text-background', 'transition-opacity', 'disabled:cursor-not-allowed', 'disabled:opacity-60')}
                >
                  {saving ? "Saving..." : "Save and continue"}
                </button>
                {replacementCandidates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowExistingFlow(true)}
                    className={cn('h-11', 'w-full', 'rounded-2xl', 'border', 'border-foreground/10', 'bg-foreground/5', 'font-semibold', 'text-foreground', 'transition-colors', 'hover:border-foreground/30', 'hover:bg-foreground/10')}
                  >
                    This device already exists?
                  </button>
                )}
              </form>
            ) : (
              <div className="space-y-4">
                <p className={cn('text-sm', 'text-foreground/60')}>Choose your existing device to replace this newly detected one.</p>
                <div className={cn('max-h-64', 'space-y-2', 'overflow-auto', 'pr-1')}>
                  {replacementCandidates.map((saved) => (
                    <button
                      key={saved.id}
                      type="button"
                      onClick={() => handleReplaceDevice(saved.id)}
                      disabled={!!replacingDeviceId}
                      className={cn('w-full', 'rounded-xl', 'border', 'border-foreground/10', 'bg-foreground/5', 'px-4', 'py-3', 'text-left', 'text-foreground', 'transition-colors', 'hover:border-foreground/30', 'hover:bg-foreground/10', 'disabled:opacity-60')}
                    >
                      <p className="font-semibold">{saved.name}</p>
                      <p className={cn('text-xs', 'text-foreground/50', 'mt-1')}>Last seen {new Date(saved.last_seen_at).toLocaleDateString()}</p>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowExistingFlow(false)}
                  className={cn('h-11', 'w-full', 'rounded-2xl', 'border', 'border-foreground/10', 'bg-foreground/5', 'font-semibold', 'text-foreground', 'transition-colors', 'hover:border-foreground/30', 'hover:bg-foreground/10')}
                >
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={isRoom ? "h-[100dvh] overflow-hidden flex justify-center w-full" : isProfile ? "min-h-screen w-full relative z-10" : "pt-32"}>
        {(!loading && user) ? children : null}
      </div>

      {user && !loading && (
        <>
          <button
            type="button"
            onClick={() => setShowFeedbackModal(true)}
            className={cn('hidden', 'sm:flex', 'fixed', 'bottom-4', 'right-4', 'z-40', 'items-center', 'gap-2', 'rounded-full', 'border', 'border-foreground/10', 'bg-background/80', 'px-3.5', 'py-2', 'text-xs', 'font-bold', 'text-foreground/80', 'backdrop-blur-xl', 'shadow-lg', 'hover:border-foreground/30', 'hover:bg-background', 'hover:text-foreground', 'transition-all', 'active:scale-95')}
          >
            <MessageSquare className={cn('w-3.5', 'h-3.5', 'text-amber-400', 'fill-amber-400')} />
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
