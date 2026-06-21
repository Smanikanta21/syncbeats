"use client";

import { FormEvent, useState, useEffect } from "react";
import Link from "next/link";
import { authApi } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const initialEmail = params.get("email");
    const autoSent = params.get("autoSent");
    const initialDevOtp = params.get("devOtp");
    
    if (initialEmail) setEmail(initialEmail);
    if (initialDevOtp) setDevOtp(initialDevOtp);
    if (autoSent === "true") {
      setOtpSent(true);
      setMessage("You previously logged in with Google. An OTP has been sent to your email so you can set a password.");
    }
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const trimmedEmail = email.trim();
      if (!otpSent) {
        const result = await authApi.forgotPassword(trimmedEmail);
        setOtpSent(true);
        setOtpVerified(false);
        setOtpError(null);
        setDevOtp(result.devOtp ?? null);
        setMessage("OTP sent to your email. Verify it to unlock password fields.");
      } else {
        if (!otpVerified) {
          throw new Error("Verify OTP first before changing password");
        }
        if (password !== confirmPassword) {
          throw new Error("New password and confirm password must match");
        }
        await authApi.resetPasswordWithOtp(trimmedEmail, otp.trim(), password);
        setDone(true);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpSent) return;
    setVerifyingOtp(true);
    setOtpError(null);
    setError(null);
    try {
      await authApi.verifyResetOtp(email.trim(), otp.trim());
      setOtpVerified(true);
      setMessage("OTP verified. You can now set your new password.");
    } catch (err) {
      setOtpVerified(false);
      setOtpError((err as Error).message || "Invalid OTP");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const copyDevOtp = async () => {
    if (!devOtp) return;
    try {
      await navigator.clipboard.writeText(devOtp);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setError("Could not copy OTP");
    }
  };

  const isAutoSetup = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("autoSent") === "true";

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-foreground/10 bg-background/40 p-8">
        <h1 className="text-2xl font-bold text-foreground">
          {isAutoSetup ? "Setup Local Password" : "Forgot Password"}
        </h1>
        <p className="mt-2 text-sm text-foreground/60">
          {isAutoSetup 
            ? "Since you used Google before, please verify your email and set a local password."
            : !otpSent
              ? "Enter your account email and we will send an OTP."
              : "Enter the OTP from email and set your new password."}
        </p>

        {done ? (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            Password updated successfully. You can now log in with your new password.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <input
              type="email"
              required
              disabled={otpSent}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@email.com"
              className="w-full rounded-xl border border-foreground/10 bg-background/80 px-4 py-3 text-foreground outline-none focus:border-foreground/30 disabled:opacity-60"
            />

            {otpSent && (
              <>
                {devOtp && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500 flex items-center justify-between gap-3">
                    <span className="font-semibold tracking-[0.2em]">OTP: {devOtp}</span>
                    <button type="button" onClick={copyDevOtp} className="rounded-lg border border-emerald-400/30 px-2 py-1 text-xs text-emerald-200 hover:border-emerald-200/60">
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(event) => {
                      setOtp(event.target.value.replace(/\D/g, ""));
                      setOtpError(null);
                      setOtpVerified(false);
                    }}
                    placeholder="Enter 6-digit OTP"
                    className={`flex-1 rounded-xl border bg-background/80 px-4 py-3 text-foreground outline-none focus:border-foreground/30 ${otpError ? "border-red-500/70" : "border-foreground/10"}`}
                  />
                  <button
                    type="button"
                    onClick={verifyOtp}
                    disabled={verifyingOtp || otp.trim().length !== 6}
                    className="rounded-xl border border-foreground/15 px-4 py-3 text-sm font-semibold text-foreground hover:border-foreground/40 disabled:opacity-60"
                  >
                    {verifyingOtp ? "Checking..." : otpVerified ? "Verified" : "Verify"}
                  </button>
                </div>
                {otpError && <p className="text-sm text-red-400">{otpError}</p>}
                <input
                  type="password"
                  required
                  minLength={8}
                  disabled={!otpVerified}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="New password (min 8 characters)"
                  className={`w-full rounded-xl border border-foreground/10 bg-background/80 px-4 py-3 text-foreground outline-none focus:border-foreground/30 ${!otpVerified ? "cursor-not-allowed opacity-60" : ""}`}
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  disabled={!otpVerified}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm new password"
                  className={`w-full rounded-xl border border-foreground/10 bg-background/80 px-4 py-3 text-foreground outline-none focus:border-foreground/30 ${!otpVerified ? "cursor-not-allowed opacity-60" : ""}`}
                />
              </>
            )}

            {message && <p className="text-sm text-green-500 dark:text-green-400">{message}</p>}
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || (otpSent && !otpVerified)}
              className="w-full rounded-xl bg-foreground px-4 py-3 font-semibold text-background disabled:opacity-60"
            >
              {loading ? "Processing..." : otpSent ? "Change Password" : "Send OTP"}
            </button>

            {otpSent && (
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  setMessage(null);
                  try {
                    const result = await authApi.forgotPassword(email.trim());
                    setDevOtp(result.devOtp ?? null);
                    setOtpVerified(false);
                    setOtpError(null);
                    setMessage("A new OTP has been sent to your email.");
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full rounded-xl border border-foreground/10 px-4 py-3 font-semibold text-foreground hover:border-foreground/30 disabled:opacity-60"
              >
                Resend OTP
              </button>
            )}
          </form>
        )}

        <p className="mt-6 text-sm text-foreground/60">
          <Link href="/login" className="text-foreground hover:text-foreground">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
