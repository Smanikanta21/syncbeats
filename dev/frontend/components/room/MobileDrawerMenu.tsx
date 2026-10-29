import { motion, AnimatePresence } from "framer-motion";
import { X, Disc3, ListMusic, AudioLines, Radio, MessageSquare, Copy, QrCode, ScanLine, UserRound, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "../ThemeToggle";

export type MobileTab = "playing" | "queue" | "spatial" | "devices" | "chat";

interface MobileDrawerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: MobileTab;
  onChangeTab: (tab: MobileTab) => void;
  onShowQR: () => void;
  onScanQR: () => void;
  onCopyLink: () => void;
  onProfile: () => void;
  onLogout: () => void;
  onGoToHub?: () => void;
}

const TABS = [
  { id: "playing", icon: Disc3, label: "Player" },
  { id: "queue", icon: ListMusic, label: "Queue" },
  { id: "spatial", icon: AudioLines, label: "Spatial · Beta" },
  { id: "devices", icon: Radio, label: "Devices" },
  { id: "chat", icon: MessageSquare, label: "Chat" },
];

export function MobileDrawerMenu({ isOpen, onClose, activeTab, onChangeTab, onShowQR, onScanQR, onCopyLink, onProfile, onLogout, onGoToHub }: MobileDrawerMenuProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[9990]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 max-h-[88dvh] overflow-y-auto bg-background/95 backdrop-blur-3xl border-t border-foreground/10 rounded-t-[2rem] p-5 sm:p-6 z-[9999] shadow-2xl flex flex-col gap-4 pb-[max(2rem,env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="pl-1">
                <p className="micro-label">Your listening room</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">Room menu</h2>
              </div>
              <button 
                onClick={onClose}
                aria-label="Close room menu"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-foreground/10 bg-foreground/5 text-foreground/70 transition-colors hover:bg-foreground/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      onChangeTab(tab.id as MobileTab);
                      onClose();
                    }}
                    className={cn(
                      "flex min-h-12 items-center gap-4 rounded-2xl border px-4 py-3 transition-all",
                      isActive
                        ? "border-foreground/15 bg-foreground text-background"
                        : "border-foreground/[0.07] bg-foreground/[0.035] text-foreground/70 hover:bg-foreground/[0.07]"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm font-semibold">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-foreground/[0.08] pt-4">
              <p className="micro-label mb-3">Invite and account</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Show room QR", Icon: QrCode, action: onShowQR },
                  { label: "Scan a code", Icon: ScanLine, action: onScanQR },
                  { label: "Copy invite link", Icon: Copy, action: onCopyLink },
                  ...(onGoToHub ? [{ label: "My rooms", Icon: Radio, action: onGoToHub }] : []),
                  { label: "Profile", Icon: UserRound, action: onProfile },
                  { label: "Sign out", Icon: LogOut, action: onLogout },
                ].map(({ label, Icon, action }) => (
                  <button key={label} type="button" onClick={() => { onClose(); action(); }} className="flex min-h-11 items-center gap-2 rounded-xl border border-foreground/[0.08] px-3 text-left text-xs font-semibold text-foreground/65 transition-colors hover:bg-foreground/[0.05]">
                    <Icon className="h-4 w-4" />{label}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-foreground/55">
                Appearance
                <ThemeToggle size="sm" />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
