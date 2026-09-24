import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Disc3, ListMusic, AudioLines, Radio, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileTab = "playing" | "queue" | "spatial" | "devices" | "chat";

interface MobileDrawerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: MobileTab;
  onChangeTab: (tab: MobileTab) => void;
}

const TABS = [
  { id: "playing", icon: Disc3, label: "Player" },
  { id: "queue", icon: ListMusic, label: "Queue" },
  { id: "spatial", icon: AudioLines, label: "Spatial" },
  { id: "devices", icon: Radio, label: "Devices" },
  { id: "chat", icon: MessageSquare, label: "Chat" },
];

export function MobileDrawerMenu({ isOpen, onClose, activeTab, onChangeTab }: MobileDrawerMenuProps) {
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
            className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/90 backdrop-blur-3xl border-t border-white/10 rounded-t-[32px] p-6 z-[9999] shadow-2xl flex flex-col gap-4 pb-12"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-black text-white/90 uppercase tracking-widest pl-2">Menu</h2>
              <button 
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-white/70" />
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
                      "flex items-center gap-4 px-4 py-4 rounded-2xl transition-all",
                      isActive 
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]" 
                        : "bg-white/5 text-white/70 hover:bg-white/10 border border-transparent"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-bold text-sm tracking-wide">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
