"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { CircularJoinRing } from "./CircularJoinRing";

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JoinRoomModal({ isOpen, onClose }: JoinRoomModalProps) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("modal:toggle", { detail: { isOpen } }));
    }
    return () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("modal:toggle", { detail: { isOpen: false } }));
      }
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-auto overflow-hidden">
          {/* Heavy Frosted Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-2xl backdrop-saturate-150"
          />

          {/* Fixed Top-Right Close Button */}
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={onClose}
            className="fixed top-5 right-5 sm:top-8 sm:right-8 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center transition-all cursor-pointer z-[10000] shadow-2xl backdrop-blur-md active:scale-95"
            aria-label="Close Join Modal"
          >
            <X className="w-5 h-5 text-white" />
          </motion.button>

          {/* Modal Centered Container */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.35, duration: 0.4 }}
            className="relative z-10 flex flex-col items-center justify-center w-full max-w-lg"
          >
            {/* Reusable Signature Circular Join Ring */}
            <CircularJoinRing onSuccess={onClose} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
