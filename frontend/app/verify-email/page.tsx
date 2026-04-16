"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authApi } from "../../lib/api";

function VerifyEmailContent() {
  const params = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Verification token is missing");
      return;
    }

    let cancelled = false;
    void authApi.verifyEmail(token)
      .then(() => {
        if (cancelled) return;
        setStatus("success");
        setMessage("Email verified successfully");
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setMessage((err as Error).message || "Verification failed");
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-black/40 p-8">
        <h1 className="text-2xl font-bold text-zinc-100">Verify Email</h1>
        <p className={`mt-4 text-sm ${status === "success" ? "text-emerald-300" : status === "error" ? "text-red-400" : "text-zinc-300"}`}>
          {message}
        </p>

        <p className="mt-6 text-sm text-zinc-400">
          <Link href="/login" className="text-zinc-200 hover:text-white">Back to login</Link>
        </p>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center text-zinc-400">Loading...</main>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
