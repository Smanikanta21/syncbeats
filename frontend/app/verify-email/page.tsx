"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { authApi, setAuthToken } from "../../lib/api";

function VerifyEmailContent() {
  const params = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const initialEmail = useMemo(() => params.get("email") ?? "", [params]);

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email...");
  const [email, setEmail] = useState(initialEmail);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Verification token is missing. Request a fresh link below.");
      return;
    }

    let cancelled = false;
    void authApi.verifyEmail(token)
      .then((result) => {
        if (cancelled) return;
        setAuthToken(result.token);
        setStatus("success");
        setMessage("Email verified successfully. Redirecting to your hub...");

        // Force a navigation that rehydrates auth state from storage immediately.
        window.location.assign("/hub");
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        const rawMessage = (err as Error).message || "Verification failed";
        const normalized = rawMessage.toLowerCase();
        if (normalized.includes("invalid") || normalized.includes("expired")) {
          setMessage("This verification link is invalid or expired. Request a new one below.");
        } else {
          setMessage(rawMessage);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const resendVerification = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || resending) return;

    setResending(true);
    setResendError(null);
    setResendMessage(null);
    try {
      await authApi.resendVerification(trimmedEmail);
      setResendMessage("A fresh verification link has been sent. Check your inbox.");
    } catch (err) {
      setResendError((err as Error).message || "Failed to resend verification email");
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-white/[0.035] blur-[140px]" />
      </div>

      <div className="w-full max-w-lg rounded-[2rem] border border-foreground/10 bg-background/55 p-8 sm:p-10 shadow-[0_30px_90px_rgba(0,0,0,0.5)] backdrop-blur-xl relative">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-foreground/5 border border-foreground/10 flex items-center justify-center">
            {status === "loading" && <Loader2 className="h-5 w-5 text-foreground/80 animate-spin" />}
            {status === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-300" />}
            {status === "error" && <AlertCircle className="h-5 w-5 text-red-300" />}
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Verify Your Email</h1>
            <p className="text-xs uppercase tracking-[0.24em] text-foreground/50 font-semibold">SyncBeats Account Setup</p>
          </div>
        </div>

        <p className={`mt-6 text-sm leading-relaxed ${status === "success" ? "text-emerald-300" : status === "error" ? "text-red-300" : "text-foreground/80"}`}>
          {message}
        </p>

        {status === "loading" && (
          <div className="mt-6 rounded-xl border border-foreground/10 bg-white/[0.02] p-4 text-xs text-foreground/60 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-foreground/80" />
            Please keep this tab open while we confirm your verification token.
          </div>
        )}

        {status === "error" && (
          <div className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-4 sm:p-5">
            <label className="text-xs uppercase tracking-[0.2em] text-foreground/50 font-semibold">Resend Verification Email</label>
            <div className="mt-3 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Mail className="h-4 w-4 text-foreground/50 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@email.com"
                  className="w-full rounded-xl border border-foreground/10 bg-background/80 pl-10 pr-4 py-3 text-foreground outline-none focus:border-white/30"
                />
              </div>
              <button
                type="button"
                onClick={resendVerification}
                disabled={resending || !email.trim()}
                className="h-12 rounded-xl bg-zinc-100 px-4 font-semibold text-background hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {resending ? "Sending..." : "Resend Link"}
              </button>
            </div>

            {resendMessage && <p className="mt-3 text-sm text-emerald-300">{resendMessage}</p>}
            {resendError && <p className="mt-3 text-sm text-red-300">{resendError}</p>}
          </div>
        )}

        <div className="mt-7 flex items-center gap-4 text-sm">
          <Link href="/login" className="text-foreground hover:text-foreground font-medium">Back to login</Link>
          <span className="text-foreground/40">•</span>
          <Link href="/verify-email-sent" className="text-foreground/60 hover:text-foreground">Need another link?</Link>
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center text-foreground/60">Loading...</main>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
