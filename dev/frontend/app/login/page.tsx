"use client";

import { useState, FormEvent, useEffect, useCallback, ReactNode, InputHTMLAttributes } from "react";
import { motion, AnimatePresence, MotionConfig, useReducedMotion, Variants } from "framer-motion";
import { Mail, User, Lock, ArrowRight, ArrowLeft, AlertCircle, Eye, EyeOff, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { roomsApi } from "../../lib/api";
import { cn } from "@/lib/utils";

import { LoginAvatar } from "../../components/auth/LoginAvatar";
import { AccentEngine } from "../../components/landing/AccentEngine";
import { startAccentVars } from "../../lib/accent";

/**
 * The panel composes as one piece. This used to stagger each field in with a
 * downward y offset, which read as a wave falling down the form on every load
 * and every mode switch — the fields now cross-fade together instead.
 */
const container: Variants = {
  hidden: {},
  show: {},
};

const item: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
};

/**
 * Let the avatar's thumbs up land before the route changes. Module-level so its
 * identity is stable — the Google path calls it from inside a useEffect.
 */
const CELEBRATE_MS = 950;
const celebrate = (setHappy: (v: boolean) => void) =>
  new Promise<void>((resolve) => {
    setHappy(true);
    setTimeout(resolve, CELEBRATE_MS);
  });

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const router  = useRouter();
  const { user, loading: authLoading, login, register, googleLogin } = useAuth();
  const reduced = useReducedMotion();

  // The accent properties drive the focus rings and the mode-switch underline, so
  // the page drifts through the same palette the landing does instead of sitting
  // on the static emerald fallback.
  useEffect(() => startAccentVars(!!reduced), [reduced]);

  // If user is already authenticated, force route directly to active room or hub
  useEffect(() => {
    if (!authLoading && user) {
      roomsApi.default()
        .then((res) => {
          if (res?.roomId) router.replace(`/room/${res.roomId}`);
          else router.replace("/room/default");
        })
        .catch(() => router.replace("/room/default"));
    }
  }, [user, authLoading, router]);

  // Form state
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [shakeNonce, setShakeNonce] = useState(0);
  const [shakeTargets, setShakeTargets] = useState<string[]>([]);
  // Drives the avatar's thumbs up. Held for CELEBRATE_MS before navigating —
  // without the pause the route change unmounts it mid-spring.
  const [happy, setHappy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    if (params.get('mode') === 'register') {
      setIsLogin(false);
    }

    const cameFromGoogle = document.referrer.includes("accounts.google.");
    const hasGoogleOAuthParams =
      params.has("state") || params.has("code") || params.has("scope") || params.has("authuser") || params.has("prompt");

    if (params.get('kicked') === 'true') {
      setError("You were logged out because this device was replaced in another session.");
    }

    if (!cameFromGoogle && !hasGoogleOAuthParams) return;

    setLoading(true);
    const timeoutId = window.setTimeout(() => {
      setLoading(false);
    }, 6000);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setShakeTargets([]);
  };

  const triggerShake = (targets: string[]) => {
    setShakeTargets(targets);
    setShakeNonce((value) => value + 1);
    setTimeout(() => setShakeTargets([]), 420);
  };

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (typeof window !== "undefined" && (window as any).google?.accounts?.id) {
      (window as any).google.accounts.id.cancel();
    }

    try {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get('returnTo') || '/room/default';

      if (isLogin) {
        const token = await login(email, password);
        await celebrate(setHappy);
        if (returnTo.startsWith('syncbeats://') || returnTo.startsWith('http://localhost:')) {
          window.location.href = `${returnTo}?token=${token}`;
        } else {
          router.push(returnTo);
        }
      } else {
        if (password !== confirmPassword) {
          triggerShake(["signup-password", "signup-confirm-password"]);
          throw new Error("Password and confirm password must match");
        }
        await register(name, email, password);
        router.push(`/verify-email-sent?email=${encodeURIComponent(email)}`);
      }
    } catch (err) {
      const message = (err as Error).message;

      if (message.includes("GOOGLE_AUTH_SETUP_PASSWORD")) {
        const match = message.match(/\[DEV_OTP:(.+?)\]/);
        const devOtp = match ? match[1] : null;
        router.push(`/forgot-password?email=${encodeURIComponent(email)}&autoSent=true${devOtp ? `&devOtp=${devOtp}` : ''}`);
        return;
      }

      if (message.includes("UNVERIFIED_EMAIL")) {
        router.push(`/verify-email-sent?email=${encodeURIComponent(email)}&resent=true`);
        return;
      }

      setError(message);

      const normalized = message.toLowerCase();
      if (isLogin) {
        if (normalized.includes("not found") || normalized.includes("register")) {
          triggerShake(["login-email"]);
        } else if (normalized.includes("password")) {
          triggerShake(["login-password"]);
        } else {
          triggerShake(["login-email", "login-password"]);
        }
      } else {
        if (normalized.includes("already exists") || normalized.includes("email")) {
          triggerShake(["signup-email"]);
        } else if (normalized.includes("name")) {
          triggerShake(["signup-name"]);
        } else if (normalized.includes("password")) {
          triggerShake(["signup-password", "signup-confirm-password"]);
        } else {
          triggerShake(["signup-name", "signup-email", "signup-password", "signup-confirm-password"]);
        }
      }
      setLoading(false);
    }
  };

  const switchMode = (toLogin: boolean) => {
    setIsLogin(toLogin);
    resetForm();
  };

  // Handle Google OAuth 2.0 Popup & Redirect Flow
  const handleGoogleOAuth = useCallback(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError("Google Client ID is not configured.");
      return;
    }

    let redirectUri = window.location.origin;
    if (redirectUri.includes("www.syncbeats.in")) {
      redirectUri = redirectUri.replace("www.syncbeats.in", "syncbeats.in");
    } else if (redirectUri.includes("www.syncbeats.app")) {
      redirectUri = redirectUri.replace("www.syncbeats.app", "syncbeats.app");
    }
    const nonce = Math.random().toString(36).substring(2);

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce: nonce,
      prompt: 'select_account'
    }).toString();

    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      googleAuthUrl,
      'google_oauth_popup',
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      window.location.href = googleAuthUrl;
    }
  }, []);

  // Listen for id_token from Google OAuth popup window or hash redirect
  useEffect(() => {
    if (typeof window === "undefined") return;

    const processIdToken = async (idToken: string) => {
      setError(null);
      setLoading(true);
      try {
        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get('returnTo') || '/room/default';
        const token = await googleLogin(idToken);
        await celebrate(setHappy);
        if (returnTo.startsWith('syncbeats://') || returnTo.startsWith('http://localhost:')) {
          window.location.href = `${returnTo}?token=${token}`;
        } else {
          router.push(returnTo);
        }
      } catch (err: any) {
        setError(err.message || "Google sign-in failed");
        setLoading(false);
      }
    };

    // If running inside popup window -> send message to opener & close popup
    if (window.opener && window.location.hash.includes("id_token=")) {
      const hashParams = new URLSearchParams(window.location.hash.replace("#", "?"));
      const idToken = hashParams.get("id_token");
      if (idToken) {
        window.opener.postMessage({ type: "GOOGLE_ID_TOKEN", idToken }, window.location.origin);
        window.close();
        return;
      }
    }

    // Direct hash redirect on main page
    if (window.location.hash.includes("id_token=")) {
      const hashParams = new URLSearchParams(window.location.hash.replace("#", "?"));
      const idToken = hashParams.get("id_token");
      if (idToken) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        processIdToken(idToken);
      }
    }

    // Popup window postMessage listener
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "GOOGLE_ID_TOKEN" && e.data.idToken) {
        processIdToken(e.data.idToken);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [googleLogin, router]);

  return (
    // reducedMotion="user" drops framer's transform animations for viewers who
    // ask for less motion, without a conditional on every element.
    <MotionConfig reducedMotion="user">
      <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-4 py-24 sm:px-6">
        {/* Ambient colour only — the avatar in the panel is the motion graphic
            on this page now. */}
        <AccentEngine reduced={!!reduced} />

        <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-50">
          <Link
            href="/"
            className="group flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-background/90 dark:bg-black/90 backdrop-blur-3xl border border-foreground/15 font-mono text-data uppercase tracking-[0.18em] text-foreground/70 shadow-xl transition-all active:scale-95 hover:border-(--accent-border) hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
            <span>Home</span>
          </Link>
        </div>

        <motion.main
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-lg glass-panel rounded-[2.5rem] border border-foreground/15 p-6 sm:p-10 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={isLogin ? "head-login" : "head-signup"}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className="mb-3 flex items-center gap-2.5 font-mono text-data uppercase tracking-[0.22em] text-foreground/40">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--accent-color)" }}
                  />
                  {isLogin ? "Sign in" : "Create account"}
                </p>
                <h1 className="font-display text-display font-semibold text-foreground">
                  {isLogin ? "Sound, in step." : "Get in step."}
                </h1>
                <p className="mt-3 text-lead text-foreground/55 text-pretty">
                  {isLogin
                    ? "Log in to pick up where your session left off."
                    : "Turn the devices you own into one speaker."}
                </p>
              </motion.div>
            </AnimatePresence>

            <LoginAvatar happy={happy} />
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                role="alert"
                aria-live="assertive"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-6 flex items-start gap-2 text-sm font-medium text-bad-600 dark:text-bad-400 bg-bad-500/10 border border-bad-500/20 rounded-2xl p-4"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.form
              key={isLogin ? "form-login" : "form-signup"}
              onSubmit={handleAuth}
              variants={container}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
              className="mt-7 space-y-4"
            >
              {!isLogin && (
                <Field
                  name="signup-name"
                  label="Full Name"
                  icon={User}
                  value={name}
                  onChange={setName}
                  shakeKey={`signup-name-${shakeNonce}`}
                  shaking={shakeTargets.includes("signup-name")}
                  placeholder="Your name"
                  autoComplete="name"
                  required
                />
              )}

              <Field
                name={isLogin ? "login-email" : "signup-email"}
                label="Email Address"
                icon={Mail}
                type="email"
                value={email}
                onChange={setEmail}
                shakeKey={`${isLogin ? "login" : "signup"}-email-${shakeNonce}`}
                shaking={shakeTargets.includes(isLogin ? "login-email" : "signup-email")}
                placeholder="name@email.com"
                autoComplete="email"
                required
              />

              <Field
                name={isLogin ? "login-password" : "signup-password"}
                label="Password"
                icon={Lock}
                secret
                value={password}
                onChange={setPassword}
                shakeKey={`${isLogin ? "login" : "signup"}-password-${shakeNonce}`}
                shaking={shakeTargets.includes(isLogin ? "login-password" : "signup-password")}
                placeholder={isLogin ? "••••••••" : "Min. 8 characters"}
                autoComplete={isLogin ? "current-password" : "new-password"}
                minLength={isLogin ? undefined : 8}
                required
                action={
                  isLogin ? (
                    <Link href="/forgot-password" className="font-mono text-data uppercase tracking-[0.18em] text-foreground/45 hover:text-foreground transition-colors">
                      Forgot?
                    </Link>
                  ) : undefined
                }
              />

              {!isLogin && (
                <Field
                  name="signup-confirm-password"
                  label="Confirm Password"
                  icon={Lock}
                  secret
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  shakeKey={`signup-confirm-password-${shakeNonce}`}
                  shaking={shakeTargets.includes("signup-confirm-password")}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              )}

              <motion.button
                variants={item}
                whileHover={{ y: -2 }}
                whileTap={{ y: 0, scale: 0.98 }}
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="group mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-background font-semibold shadow-lg disabled:opacity-60 disabled:cursor-wait"
              >
                {loading
                  ? (isLogin ? "Signing in…" : "Creating account…")
                  : (
                    <>
                      <span>{isLogin ? "Sign in" : "Create account"}</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </>
                  )}
              </motion.button>

              <motion.div variants={item} className="flex items-center gap-3 pt-2">
                <span className="h-px flex-1 bg-foreground/10" />
                <span className="font-mono text-data uppercase tracking-[0.2em] text-foreground/30">or</span>
                <span className="h-px flex-1 bg-foreground/10" />
              </motion.div>

              <motion.button
                variants={item}
                whileHover={{ y: -2 }}
                whileTap={{ y: 0, scale: 0.98 }}
                type="button"
                disabled={loading}
                onClick={handleGoogleOAuth}
                className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 text-foreground text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-wait"
              >
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </motion.button>
            </motion.form>
          </AnimatePresence>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="mt-7 pt-6 border-t border-foreground/10 text-center text-sm text-foreground/50"
          >
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => switchMode(!isLogin)}
              className="relative font-semibold text-foreground/90 transition-colors hover:text-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-(--accent-color) after:transition-transform after:duration-300 hover:after:scale-x-100"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </motion.p>
        </motion.main>
      </div>
    </MotionConfig>
  );
}

type FieldProps = {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: LucideIcon;
  /** Changes on every failed submit so the shake replays on a repeated error. */
  shakeKey: string;
  shaking: boolean;
  secret?: boolean;
  action?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "value" | "onChange">;

function Field({
  name, label, value, onChange, shakeKey, shaking,
  secret, action, icon: Icon, type = "text", ...rest
}: FieldProps) {
  const [revealed, setRevealed] = useState(false);

  // Focus state reads through the border plus the ring, the same way every other
  // input in the app does, focusing to the live accent so the form joins the
  // palette the rest of the site is on. Per-field validity styling is gone with
  // the email-existence probe — the error banner above carries the message.
  const edge = 'border-foreground/10 focus:border-(--accent-border) focus:ring-(--accent-border)';

  return (
    <motion.div variants={item} className="space-y-1.5">
      <div className="flex items-center justify-between ml-1">
        <label htmlFor={name} className="font-mono text-data uppercase tracking-[0.18em] text-foreground/45">
          {label}
        </label>
        {action}
      </div>

      <motion.div
        key={shakeKey}
        animate={shaking ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.35 }}
        className="relative"
      >
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Icon className="h-4.5 w-4.5 text-foreground/40" />
        </div>
        <input
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={secret ? (revealed ? "text" : "password") : type}
          className={cn(
            'w-full rounded-2xl border bg-foreground/5 pl-11 pr-4 py-3.5 text-foreground',
            'placeholder:text-foreground/30 transition-all',
            'focus:outline-none focus:ring-1 focus:bg-foreground/7',
            secret && 'pr-12',
            edge
          )}
          suppressHydrationWarning
          {...rest}
        />
        {secret && (
          <button
            type="button"
            aria-label={revealed ? "Hide password" : "Show password"}
            onClick={() => setRevealed((shown) => !shown)}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-foreground/40 hover:text-foreground transition-colors"
          >
            {revealed ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
