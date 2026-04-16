"use client";

import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ToastMessage } from "@/types/admin";

export function ToastStack({ messages }: { messages: ToastMessage[] }) {
  return (
    <div className="fixed right-4 top-4 z-[70] w-full max-w-sm space-y-2">
      <AnimatePresence>
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, x: 24, y: 8 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className="glass-panel rounded-xl px-3 py-2"
          >
            <div className="flex items-center gap-2 text-sm text-zinc-100">
              {message.type === "success" ? (
                <CheckCircle2 className="h-4 w-4" style={{ color: "var(--accent-primary)" }} />
              ) : message.type === "error" ? (
                <AlertTriangle className="h-4 w-4" style={{ color: "var(--accent-tertiary)" }} />
              ) : (
                <Info className="h-4 w-4" style={{ color: "var(--accent-secondary)" }} />
              )}
              <span>{message.title}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
