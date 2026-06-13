"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import { authApi } from "../../lib/api";

function ResetPasswordContent() {
  const params = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      setError("Missing reset token");
      return;
    }

    if (password !== confirmPassword) {
      setError("New password and confirm password must match");
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
    <main className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full bg-white/[0.03] blur-[140px]" />
      </div>

      <div className="w-full max-w-lg rounded-[2rem] border border-foreground/10 bg-background/55 p-8 sm:p-10 shadow-[0_30px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl relative">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-foreground/5 border border-foreground/10 flex items-center justify-center">
            <KeyRound className="h-5 w-5 text-foreground/80" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Reset Password</h1>
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50 font-semibold">Secure Recovery</p>
          </div>
        </div>

        <p className="mt-5 text-sm text-foreground/80 leading-relaxed">
          Set a new password for your account. Use at least 8 characters.
        </p>

        {done ? (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Password updated successfully.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] text-foreground/50 font-semibold">New Password</label>
              <div className="relative">
                <Lock className="h-4 w-4 text-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-xl border border-foreground/10 bg-background/80 pl-10 pr-11 py-3 text-foreground outline-none focus:border-white/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] text-foreground/50 font-semibold">Confirm Password</label>
              <div className="relative">
                <Lock className="h-4 w-4 text-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full rounded-xl border border-foreground/10 bg-background/80 pl-10 pr-11 py-3 text-foreground outline-none focus:border-white/30"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/50 hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-zinc-100 px-4 py-3 font-semibold text-background hover:scale-[1.02] disabled:opacity-60"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>
        )}

        <div className="mt-6 text-sm text-foreground/60 flex items-center gap-4">
          <Link href="/login" className="text-foreground hover:text-foreground">Back to login</Link>
          <span className="text-foreground/40">•</span>
          <Link href="/forgot-password" className="text-foreground/60 hover:text-foreground">Need a new reset link?</Link>
        </div>
      </div>
    </main>
  );
}

import { LoadingScreen } from "../../components/LoadingScreen";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Loading Reset Password..." />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
