"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "../../context/AuthContext";

function VerifyEmailSentContent() {
  const params = useSearchParams();
  const email = useMemo(() => params.get("email") ?? "", [params]);
  const resentParam = useMemo(() => params.get("resent") === "true", [params]);
  const { resendVerification } = useAuth();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(resentParam ? "We noticed your email wasn't verified, so we just sent a new verification link to your inbox." : null);
  const [error, setError] = useState<string | null>(null);

  const handleResend = async () => {
    if (!email || loading) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await resendVerification(email);
      setMessage("Verification email sent again. Please check your inbox.");
    } catch (err) {
      setError((err as Error).message || "Failed to resend verification email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-black/40 p-8">
        <h1 className="text-2xl font-bold text-zinc-100">Check your email</h1>
        <p className="mt-3 text-sm text-zinc-300">
          We sent a verification link to {email ? <span className="text-zinc-100">{email}</span> : "your email"}. Verify your address to finish setting up your account.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleResend}
            disabled={!email || loading}
            className="h-11 rounded-xl bg-zinc-200 px-4 font-semibold text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Resending..." : "Resend verification email"}
          </button>
          <Link href="/login" className="text-sm text-zinc-200 hover:text-white">
            Back to login
          </Link>
        </div>

        {message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </div>
    </main>
  );
}

export default function VerifyEmailSentPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center text-zinc-400">Loading...</main>}>
      <VerifyEmailSentContent />
    </Suspense>
  );
}
