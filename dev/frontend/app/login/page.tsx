"use client";

import { useState, FormEvent, useEffect, useCallback, ReactNode, InputHTMLAttributes } from "react";
import { motion, AnimatePresence, MotionConfig, Variants } from "framer-motion";
import { ArrowRight, ArrowLeft, AlertCircle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { authApi, roomsApi } from "../../lib/api";
import { cn } from "@/lib/utils";
import { logger } from "../../lib/logger";
import { PhaseField } from "../../components/auth/PhaseField";

/**
 * The page composes itself once on load, the same way the traces behind it do:
 * headline, then fields, then actions. Switching mode replays both.
 */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.08 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
};

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const router  = useRouter();
  const { user, loading: authLoading, login, register, googleLogin } = useAuth();

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
  const [emailExists, setEmailExists] = useState<boolean | null>(null);
  const [shakeNonce, setShakeNonce] = useState(0);
  const [shakeTargets, setShakeTargets] = useState<string[]>([]);
  /** Bumped on every mode switch to re-scatter the traces behind the form. */
  const [perturb, setPerturb] = useState(0);

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

  useEffect(() => {
    if (!email.trim() || !email.includes('@')) {
      setEmailExists(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await authApi.checkEmail(email.trim());
        setEmailExists(result.exists);
      } catch (err) {
        setEmailExists(null);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [email]);

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
    setPerturb((value) => value + 1);
    resetForm();
  };

  // An email that already exists is good news on the login form and bad news on
  // signup — hence the comparison against which form is asking. The hint text
  // carries the same meaning as the colour, so it isn't a colour-only signal.
  const emailKnown = email.includes('@') ? emailExists : null;
  const emailTone = emailKnown === null ? undefined : emailKnown === isLogin ? "ok" : "bad";
  const emailHint =
    emailKnown === null
      ? ""
      : isLogin
        ? (emailKnown ? "Recognised." : "No account with this email yet.")
        : (emailKnown ? "Already registered — sign in instead." : "Available.");

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
        logger.info("GOOGLE_OAUTH_SUBMIT", "Google OAuth credential submitted");
        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get('returnTo') || '/room/default';
        const token = await googleLogin(idToken);
        logger.success("GOOGLE_OAUTH_SUCCESS", "Google OAuth authentication succeeded");
        if (returnTo.startsWith('syncbeats://') || returnTo.startsWith('http://localhost:')) {
          window.location.href = `${returnTo}?token=${token}`;
        } else {
          router.push(returnTo);
        }
      } catch (err: any) {
        logger.error("GOOGLE_OAUTH_FAILED", err.message || "Google sign-in failed");
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
      <div className="relative min-h-screen overflow-hidden">
        <PhaseField perturb={perturb} />
        {/* Pulls the page colour back over the middle so the traces read as
            atmosphere behind the form rather than noise through it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0"
          style={{ background: "radial-gradient(ellipse 58% 52% at 50% 42%, var(--background) 25%, transparent 100%)" }}
        />

        <Link
          href="/"
          className={cn(
            'group absolute top-6 left-6 sm:top-8 sm:left-8 z-20 inline-flex items-center gap-2',
            'text-sm text-foreground/40 hover:text-foreground transition-colors'
          )}
        >
          <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" />
          Home
        </Link>

        <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-24">
          <AnimatePresence mode="wait">
            <motion.div
              key={isLogin ? "head-login" : "head-signup"}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <h1 className="text-[clamp(2.5rem,9vw,3.5rem)] font-light leading-[0.95] -tracking-[0.035em] text-foreground">
                {isLogin ? "Sound, in step." : "Get in step."}
              </h1>
              <p className="mt-4 text-foreground/45">
                {isLogin
                  ? "Pick up where your session left off."
                  : "Turn the devices you own into one speaker."}
              </p>
            </motion.div>
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-8 flex items-start gap-2 border-l-2 border-red-500/60 pl-3 text-sm text-red-400"
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
              className="mt-10 space-y-5"
            >
              {!isLogin && (
                <Field
                  name="signup-name"
                  label="Name"
                  value={name}
                  onChange={setName}
                  shakeKey={`signup-name-${shakeNonce}`}
                  shaking={shakeTargets.includes("signup-name")}
                  placeholder="What should we call you?"
                  autoComplete="name"
                  required
                />
              )}

              <Field
                name={isLogin ? "login-email" : "signup-email"}
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                shakeKey={`${isLogin ? "login" : "signup"}-email-${shakeNonce}`}
                shaking={shakeTargets.includes(isLogin ? "login-email" : "signup-email")}
                placeholder="name@email.com"
                autoComplete="email"
                tone={emailTone}
                hint={emailHint}
                required
              />

              <Field
                name={isLogin ? "login-password" : "signup-password"}
                label="Password"
                secret
                value={password}
                onChange={setPassword}
                shakeKey={`${isLogin ? "login" : "signup"}-password-${shakeNonce}`}
                shaking={shakeTargets.includes(isLogin ? "login-password" : "signup-password")}
                placeholder={isLogin ? "••••••••" : "At least 8 characters"}
                autoComplete={isLogin ? "current-password" : "new-password"}
                minLength={isLogin ? undefined : 8}
                required
                action={
                  isLogin ? (
                    <Link href="/forgot-password" className="text-xs text-foreground/40 transition-colors hover:text-foreground">
                      Forgot?
                    </Link>
                  ) : undefined
                }
              />

              {!isLogin && (
                <Field
                  name="signup-confirm-password"
                  label="Confirm password"
                  secret
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  shakeKey={`signup-confirm-password-${shakeNonce}`}
                  shaking={shakeTargets.includes("signup-confirm-password")}
                  placeholder="Type it again"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              )}

              <motion.button
                variants={item}
                whileHover={{ y: -2 }}
                whileTap={{ y: 0, scale: 0.99 }}
                type="submit"
                disabled={loading}
                className={cn(
                  'group mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-full',
                  'bg-foreground text-background text-sm font-medium tracking-wide',
                  'disabled:opacity-50 disabled:cursor-wait'
                )}
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

              <motion.div variants={item} className="flex items-center gap-4 pt-2">
                <span className="h-px flex-1 bg-foreground/10" />
                <span className="text-[11px] text-foreground/30">or</span>
                <span className="h-px flex-1 bg-foreground/10" />
              </motion.div>

              <motion.button
                variants={item}
                whileHover={{ y: -2 }}
                whileTap={{ y: 0, scale: 0.99 }}
                type="button"
                disabled={loading}
                onClick={handleGoogleOAuth}
                className={cn(
                  'flex h-14 w-full items-center justify-center gap-3 rounded-full',
                  'border border-foreground/12 text-sm text-foreground/80',
                  'hover:border-foreground/30 hover:text-foreground transition-colors',
                  'disabled:opacity-50 disabled:cursor-wait'
                )}
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
            className="mt-10 text-sm text-foreground/40"
          >
            {isLogin ? "New here? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => switchMode(!isLogin)}
              className={cn(
                'relative text-foreground/80 transition-colors hover:text-foreground',
                'after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0',
                'after:bg-foreground after:transition-transform after:duration-300 hover:after:scale-x-100'
              )}
            >
              {isLogin ? "Create an account" : "Sign in"}
            </button>
          </motion.p>
        </main>
      </div>
    </MotionConfig>
  );
}

type FieldProps = {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Changes on every failed submit so the shake replays on a repeated error. */
  shakeKey: string;
  shaking: boolean;
  secret?: boolean;
  tone?: "ok" | "bad";
  hint?: string;
  action?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "value" | "onChange">;

function Field({
  name, label, value, onChange, shakeKey, shaking,
  secret, tone, hint, action, type = "text", ...rest
}: FieldProps) {
  const [revealed, setRevealed] = useState(false);

  const rule = tone === "ok" ? "bg-emerald-500" : tone === "bad" ? "bg-red-500" : "bg-foreground";
  const hairline =
    tone === "ok" ? "border-emerald-500/50" : tone === "bad" ? "border-red-500/50" : "border-foreground/15";

  return (
    <motion.div variants={item}>
      <motion.div
        key={shakeKey}
        animate={shaking ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex items-baseline justify-between">
          <label htmlFor={name} className="text-xs text-foreground/45">{label}</label>
          {action}
        </div>

        <div className="relative mt-1">
          <input
            id={name}
            name={name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            type={secret ? (revealed ? "text" : "password") : type}
            className={cn(
              'peer w-full rounded-none border-0 border-b bg-transparent px-0 py-2.5',
              'text-foreground transition-colors placeholder:text-foreground/25 focus:outline-none',
              secret && 'pr-9',
              hairline
            )}
            suppressHydrationWarning
            {...rest}
          />
          {/* The focus indicator: focus:outline-none is set, so this rule sweeping
              in from the left is what tells you where the caret is. */}
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left scale-x-0',
              'transition-transform duration-500 ease-out peer-focus:scale-x-100',
              rule
            )}
          />
          {secret && (
            <button
              type="button"
              aria-label={revealed ? "Hide password" : "Show password"}
              onClick={() => setRevealed((shown) => !shown)}
              className="absolute inset-y-0 right-0 flex items-center text-foreground/35 transition-colors hover:text-foreground"
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Rendered even when empty so the field below doesn't jump as the
            email check resolves. */}
        {hint !== undefined && (
          <p className={cn(
            'mt-1.5 h-3.5 text-[11px] leading-[0.875rem] transition-colors',
            tone === "bad" ? 'text-red-400/80' : tone === "ok" ? 'text-emerald-400/80' : 'text-transparent'
          )}>
            {hint}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
