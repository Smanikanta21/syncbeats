import { FormEvent, useState, useEffect } from "react";
import { X, KeyRound, RefreshCw, CheckCircle2 } from "lucide-react";
import { authApi } from "../lib/api";
import { cn } from "../lib/utils";

interface ForgotPasswordPanelProps {
  onClose: () => void;
  initialEmail: string;
}

export function ForgotPasswordPanel({ onClose, initialEmail }: ForgotPasswordPanelProps) {
  const [email, setEmail] = useState(initialEmail);
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
    setEmail(initialEmail);
  }, [initialEmail]);

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
    setError(null);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(devOtp);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = devOtp;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback fallback: set copied state so user experience is smooth
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className={cn('flex', 'flex-col', 'h-full', 'w-full')}>
      <div className={cn('flex', 'items-center', 'justify-between', 'px-2', 'pb-2', 'shrink-0')}>
        <h2 className={cn('text-2xl', 'font-black', 'text-foreground')}>Change Password</h2>
        <button onClick={onClose} className={cn('p-2', 'rounded-full', 'bg-foreground/5', 'hover:bg-foreground/10', 'text-foreground/50', 'hover:text-foreground', 'transition-colors')}>
          <X className={cn('w-5', 'h-5')} />
        </button>
      </div>

      <div className={cn('flex-1', 'overflow-y-auto', 'space-y-6', 'pr-2', 'custom-scrollbar', 'pb-10', 'mt-4')} data-lenis-prevent="true">
        <section className={cn('p-5', 'rounded-3xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'shadow-lg')}>
          <div className={cn('flex', 'items-center', 'gap-2', 'mb-4')}>
            <KeyRound className={cn('w-5', 'h-5', 'text-foreground/70')} />
            <h3 className={cn('text-lg', 'font-bold', 'text-foreground')}>Set a Password</h3>
          </div>
          <p className={cn('text-xs', 'text-foreground/60', 'mb-6')}>
            {!otpSent
              ? "Verify your account email address to set or update your password."
              : "Enter the verification code sent to your email to unlock password creation."}
          </p>

          {done ? (
            <div className={cn('rounded-xl', 'border', 'border-emerald-500/20', 'bg-emerald-500/10', 'p-4', 'text-xs', 'font-semibold', 'text-emerald-400', 'flex', 'flex-col', 'gap-2', 'items-center', 'text-center')}>
              <CheckCircle2 className={cn('w-8', 'h-8', 'text-emerald-400')} />
              <span>Password updated successfully!</span>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className={cn('text-[10px]', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/45', 'block', 'mb-1.5')}>Email Address</label>
                <input
                  type="email"
                  required
                  disabled={otpSent || !!initialEmail}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@email.com"
                  className={cn('w-full', 'bg-foreground/5', 'border', 'border-foreground/10', 'rounded-xl', 'px-4', 'py-3', 'text-sm', 'text-foreground', 'outline-none', 'focus:border-foreground/30', 'transition-all', 'placeholder:text-foreground/30', 'disabled:opacity-60')}
                />
              </div>

              {otpSent && (
                <>
                  {devOtp && (
                    <div className={cn('rounded-xl', 'border', 'border-emerald-500/20', 'bg-emerald-500/10', 'px-4', 'py-3', 'text-xs', 'text-emerald-400', 'flex', 'items-center', 'justify-between', 'gap-2', 'flex-wrap')}>
                      <span className={cn('font-semibold', 'tracking-[0.1em]')}>DEV OTP: {devOtp}</span>
                      <button 
                        type="button" 
                        onClick={copyDevOtp} 
                        className={cn('rounded-lg', 'border', 'border-emerald-400/30', 'px-3', 'py-1.5', 'text-[10px]', 'font-bold', 'uppercase', 'text-emerald-300', 'hover:bg-emerald-500/20', 'transition', 'shrink-0')}
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  )}

                  <div>
                    <label className={cn('text-[10px]', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/45', 'block', 'mb-1.5')}>Verification Code</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="tel"
                        required
                        maxLength={6}
                        value={otp}
                        onChange={(event) => {
                          setOtp(event.target.value.replace(/\D/g, ""));
                          setOtpError(null);
                          setOtpVerified(false);
                        }}
                        placeholder="Enter 6-digit OTP"
                        className={cn(
                          "flex-1 bg-foreground/5 border rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-foreground/30 transition-all placeholder:text-foreground/30 w-full min-w-0",
                          otpError ? "border-red-500/50" : "border-foreground/10"
                        )}
                      />
                      <button
                        type="button"
                        onClick={verifyOtp}
                        disabled={verifyingOtp || otp.trim().length !== 6}
                        className={cn('rounded-xl', 'border', 'border-foreground/15', 'px-4', 'py-3', 'text-xs', 'font-bold', 'text-foreground', 'hover:bg-foreground/10', 'transition', 'disabled:opacity-50', 'w-full', 'sm:w-auto', 'shrink-0', 'flex', 'items-center', 'justify-center')}
                      >
                        {verifyingOtp ? "Checking..." : otpVerified ? "Verified" : "Verify Code"}
                      </button>
                    </div>
                    {otpError && <p className={cn('text-xs', 'text-red-400', 'mt-1')}>{otpError}</p>}
                  </div>

                  <div>
                    <label className={cn('text-[10px]', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/45', 'block', 'mb-1.5')}>New Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      disabled={!otpVerified}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="New password (min 8 characters)"
                      className={cn('w-full', 'bg-foreground/5', 'border', 'border-foreground/10', 'rounded-xl', 'px-4', 'py-3', 'text-sm', 'text-foreground', 'outline-none', 'focus:border-foreground/30', 'transition-all', 'placeholder:text-foreground/30', 'disabled:opacity-50')}
                    />
                  </div>

                  <div>
                    <label className={cn('text-[10px]', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/45', 'block', 'mb-1.5')}>Confirm Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      disabled={!otpVerified}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Confirm new password"
                      className={cn('w-full', 'bg-foreground/5', 'border', 'border-foreground/10', 'rounded-xl', 'px-4', 'py-3', 'text-sm', 'text-foreground', 'outline-none', 'focus:border-foreground/30', 'transition-all', 'placeholder:text-foreground/30', 'disabled:opacity-50')}
                    />
                  </div>
                </>
              )}

              {message && <p className={cn('text-xs', 'text-green-400')}>{message}</p>}
              {error && <p className={cn('text-xs', 'text-red-400')}>{error}</p>}

              <button
                type="submit"
                disabled={loading || (otpSent && !otpVerified)}
                className={cn('w-full', 'rounded-xl', 'bg-foreground', 'px-4', 'py-3', 'text-sm', 'font-bold', 'text-background', 'hover:opacity-95', 'transition', 'disabled:opacity-50')}
              >
                {loading ? "Processing..." : otpSent ? "Change Password" : "Send Verification OTP"}
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
                  className={cn('w-full', 'rounded-xl', 'border', 'border-foreground/10', 'px-4', 'py-3', 'text-sm', 'font-semibold', 'text-foreground', 'hover:bg-foreground/5', 'transition', 'disabled:opacity-50')}
                >
                  Resend OTP
                </button>
              )}
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
