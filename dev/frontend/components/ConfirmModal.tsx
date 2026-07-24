"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDanger = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 15 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-md bg-background/90 dark:bg-black/90 backdrop-blur-2xl border border-foreground/10 rounded-3xl p-6 shadow-2xl overflow-hidden"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${isDanger ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-foreground/10 text-foreground'}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-foreground tracking-tight">{title}</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-full text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-foreground/70 leading-relaxed mb-6">
              {message}
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-foreground/5 hover:bg-foreground/10 text-foreground transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`px-5 py-2 text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 ${
                  isDanger
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-foreground text-background hover:opacity-90"
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
