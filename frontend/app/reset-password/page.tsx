"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authApi } from "../../lib/api";

function ResetPasswordContent() {
  const params = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError("Missing reset token");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
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
        <h1 className="text-2xl font-bold text-zinc-100">Reset Password</h1>
        <p className="mt-2 text-sm text-zinc-400">Set a new password for your account.</p>

        {done ? (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            Password updated successfully.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-zinc-100 outline-none focus:border-white/30"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-zinc-100 px-4 py-3 font-semibold text-black disabled:opacity-60"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-zinc-400">
          <Link href="/login" className="text-zinc-200 hover:text-white">Back to login</Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center text-zinc-400">Loading...</main>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
