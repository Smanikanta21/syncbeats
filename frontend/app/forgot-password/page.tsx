"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { authApi } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authApi.forgotPassword(email.trim());
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-black/40 p-8">
        <h1 className="text-2xl font-bold text-zinc-100">Forgot Password</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Enter your account email and we will send a reset link.
        </p>

        {done ? (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            If an account exists for this email, a reset link was sent.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@email.com"
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-zinc-100 outline-none focus:border-white/30"
            />
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-zinc-100 px-4 py-3 font-semibold text-black disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-zinc-400">
          <Link href="/login" className="text-zinc-200 hover:text-white">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
