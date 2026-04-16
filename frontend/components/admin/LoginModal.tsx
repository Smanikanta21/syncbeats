"use client";

import { motion } from "framer-motion";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";

interface LoginModalProps {
  open: boolean;
  onSubmit: (email: string, password: string) => Promise<void>;
}

export function LoginModal({ open, onSubmit }: LoginModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <motion.form
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        onSubmit={submit}
        className="glass-panel w-full max-w-md rounded-2xl p-6 sm:p-8"
      >
        <div className="mb-6 flex items-center gap-3">
          <div
            className="rounded-xl border border-white/15 bg-white/10 p-2"
            style={{ color: "var(--accent-secondary)" }}
          >
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Admin Access</h2>
            <p className="text-sm text-zinc-300">Syncbeats internal control center</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wider text-zinc-300">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="admin@syncbeats.app"
              required
              className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-white/30"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wider text-zinc-300">Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Enter admin password"
              required
              className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-white/30"
            />
          </label>

          {error ? (
            <div
              className="rounded-xl px-3 py-2 text-sm"
              style={{
                border: "1px solid color-mix(in srgb, var(--accent-tertiary) 40%, transparent)",
                background: "color-mix(in srgb, var(--accent-tertiary) 14%, transparent)",
                color: "color-mix(in srgb, var(--accent-tertiary) 72%, white)",
              }}
            >
              {error}
            </div>
          ) : null}

          <button
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            style={{
              background: "linear-gradient(120deg, var(--accent-secondary), var(--accent-primary))",
            }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {submitting ? "Authenticating..." : "Unlock Dashboard"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}
