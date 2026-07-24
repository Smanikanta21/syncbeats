"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export interface ToastItem {
  id: string;
  message: string;
  type?: "info" | "error" | "success";
}

const ToastContext = createContext<{
  showToast: (message: string, type?: "info" | "error" | "success") => void;
}>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = (message: string, type: "info" | "error" | "success" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    const handleToastEvent = (e: any) => {
      if (e.detail?.message) {
        showToast(e.detail.message, e.detail.type || "info");
      }
    };
    window.addEventListener("toast", handleToastEvent);
    return () => window.removeEventListener("toast", handleToastEvent);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-20 right-4 sm:right-6 z-[10000] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-background/90 dark:bg-black/90 backdrop-blur-2xl border border-foreground/10 shadow-2xl"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {toast.type === "error" ? (
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                ) : toast.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <Info className="w-4 h-4 text-blue-500 shrink-0" />
                )}
                <span className="text-xs font-medium text-foreground truncate">
                  {toast.message}
                </span>
              </div>
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="p-1 rounded-full text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
