"use client";

import { useState, FormEvent, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Lock, Mail, Disc, User, Info, AlertCircle, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { FullscreenLoader } from "../../components/FullscreenLoader";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { authApi, roomsApi } from "../../lib/api";
import { cn } from "@/lib/utils";

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
          else router.replace("/hub");
        })
        .catch(() => router.replace("/hub"));
    }
  }, [user, authLoading, router]);
  const [googleReady, setGoogleReady] = useState(false);
  const googleLoginButtonRef  = useRef<HTMLDivElement>(null);
  const googleSignupButtonRef = useRef<HTMLDivElement>(null);

  // Form state
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [emailExists, setEmailExists] = useState<boolean | null>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [shakeNonce, setShakeNonce] = useState(0);
  const [shakeTargets, setShakeTargets] = useState<string[]>([]);
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window !== "undefined") {
      setTheme(localStorage.getItem('theme'));
    }
    const params = new URLSearchParams(window.location.search);
    
    if (params.get('mode') === 'register') {
      setIsLogin(false);
    }
    
    const cameFromGoogle = document.referrer.includes("accounts.google.");
    const hasGoogleOAuthParams =
      params.has("code") ||
      params.has("state") ||
      params.has("scope") ||
      params.has("authuser") ||
      params.has("error");

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
      const returnTo = params.get('returnTo') || '/hub';
      
      if (isLogin) {
        const token = await login(email, password);
        if (returnTo.startsWith('syncbeats://')) {
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

  const inputClass = "w-full bg-foreground/5 border border-foreground/5 focus:border-accent-primary/40 rounded-2xl pl-11 pr-4 py-3.5 text-foreground focus:outline-none focus:ring-1 focus:ring-accent-primary/40 transition-all placeholder:text-foreground/40";
  const inputClassSm = "w-full bg-foreground/5 border border-foreground/5 focus:border-accent-primary/40 rounded-xl pl-9 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent-primary/40 transition-all placeholder:text-foreground/40";

  const getEmailInputClass = (baseClass: string, isLoginField: boolean) => {
    if (emailExists === true) {
      if (isLoginField) {
        return baseClass.replace('border-foreground/5', 'border-emerald-500/50').replace('focus:border-accent-primary/40', 'focus:border-emerald-500/80').replace('focus:ring-accent-primary/40', 'focus:ring-emerald-500/80');
      } else {
        return baseClass.replace('border-foreground/5', 'border-red-500/50').replace('focus:border-accent-primary/40', 'focus:border-red-500/80').replace('focus:ring-accent-primary/40', 'focus:ring-red-500/80');
      }
    } else if (emailExists === false && email.includes('@')) {
      if (isLoginField) {
        return baseClass.replace('border-foreground/5', 'border-red-500/50').replace('focus:border-accent-primary/40', 'focus:border-red-500/80').replace('focus:ring-accent-primary/40', 'focus:ring-red-500/80');
      } else {
        return baseClass.replace('border-foreground/5', 'border-emerald-500/50').replace('focus:border-accent-primary/40', 'focus:border-emerald-500/80').replace('focus:ring-accent-primary/40', 'focus:ring-emerald-500/80');
      }
    }
    return baseClass;
  };

  // Handle Google OAuth 2.0 Popup & Redirect Flow
  const handleGoogleOAuth = useCallback(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError("Google Client ID is not configured.");
      return;
    }

    let redirectUri = window.location.origin;
    if (redirectUri.includes("www.syncbeats.app")) {
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
        const returnTo = params.get('returnTo') || '/hub';
        const token = await googleLogin(idToken);
        if (returnTo.startsWith('syncbeats://')) {
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
    <div className={cn('min-h-screen', 'flex', 'flex-col', 'items-center', 'justify-center', 'relative', 'px-4', 'sm:px-6', 'lg:px-8', 'overflow-hidden', 'z-0')}>
      <FullscreenLoader isVisible={loading} message={isLogin ? "Authenticating ..." : "Signing Up..."} />

      {/* Background ambient lighting removed (now in layout) */}

      {/* Home link */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className={cn('absolute', 'top-8', 'left-8', 'z-50')}
      >
        <Link href="/" className={cn('flex', 'items-center', 'gap-2', 'group')}>
          <div className={cn('w-8', 'h-8', 'rounded-full', 'bg-foreground/5', 'border', 'border-foreground/10', 'flex', 'items-center', 'justify-center', 'group-hover:bg-foreground/10', 'transition-colors')}>
            <Disc className={cn('w-4', 'h-4', 'text-foreground/80', 'animate-[spin_4s_linear_infinite]')} />
          </div>
          <span className={cn('text-sm', 'font-bold', 'tracking-widest', 'text-foreground/60', 'group-hover:text-foreground', 'transition-colors')}>HOME</span>
        </Link>
      </motion.div>

      {/* Sliding Auth Component */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`relative w-full max-w-5xl ${isLogin ? 'min-h-[650px]' : 'min-h-[850px]'} sm:h-[700px] md:h-[650px] glass-panel rounded-[2.5rem] bg-transparent overflow-y-auto overflow-x-hidden md:overflow-hidden flex shadow-[0_20px_80px_rgba(0,0,0,0.5)] transition-all duration-500`}
      >


        <div
          className={`absolute top-0 left-0 w-full md:w-1/2 h-full z-30 flex flex-col justify-center p-6 sm:p-12 md:p-16 bg-transparent transition-transform duration-700 ease-in-out ${isLogin ? 'translate-x-0' : 'md:translate-x-full'} overflow-y-auto`}
        >
          <AnimatePresence mode="wait">
            {/* ── LOGIN FORM ── */}
            {isLogin ? (
              <motion.div
                key="login-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className={cn('w-full', 'max-w-sm', 'mx-auto')}
              >
                <div className={cn('mb-10', 'text-center', 'md:text-left')}>
                  <h2 className={cn('text-4xl', 'font-black', 'mb-3', 'text-foreground')}>Welcome Back</h2>
                  <p className={cn('text-foreground/50', 'font-medium')}>Log in to manage your synced sessions.</p>
                </div>

                {error && (
                  <div className={cn('mb-6', 'flex', 'items-center', 'gap-2', 'text-sm', 'text-red-400', 'bg-red-500/10', 'border', 'border-red-500/20', 'rounded-2xl', 'p-4')}>
                    <AlertCircle className={cn('w-4', 'h-4', 'shrink-0')} />{error}
                  </div>
                )}

                <form className="space-y-6" onSubmit={handleAuth}>
                  <div className="space-y-2">
                    <label className={cn('text-xs', 'font-semibold', 'text-foreground/60', 'ml-1', 'uppercase', 'tracking-wider')}>Email Address</label>
                    <motion.div
                      key={`login-email-${shakeNonce}`}
                      animate={shakeTargets.includes("login-email") ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      className="relative"
                    >
                      <div className={cn('absolute', 'inset-y-0', 'left-0', 'pl-4', 'flex', 'items-center', 'pointer-events-none')}><Mail className={cn('h-5', 'w-5', 'text-foreground/50')} /></div>
                      <input type="email" tabIndex={1} value={email} onChange={e => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e as any); }} className={getEmailInputClass(inputClass, true)} placeholder="name@email.com" autoComplete="email" suppressHydrationWarning required />
                    </motion.div>
                  </div>

                  <div className="space-y-2">
                    <div className={cn('flex', 'items-center', 'justify-between', 'ml-1')}>
                      <label className={cn('text-xs', 'font-semibold', 'text-foreground/60', 'uppercase', 'tracking-wider')}>Password</label>
                      <Link href="/forgot-password" tabIndex={4} className={cn('text-xs', 'font-medium', 'text-foreground/50', 'hover:text-foreground/80', 'transition-colors')}>Forgot?</Link>
                    </div>
                    <motion.div
                      key={`login-password-${shakeNonce}`}
                      animate={shakeTargets.includes("login-password") ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      className="relative"
                    >
                      <div className={cn('absolute', 'inset-y-0', 'left-0', 'pl-4', 'flex', 'items-center', 'pointer-events-none')}><Lock className={cn('h-5', 'w-5', 'text-foreground/50')} /></div>
                      <input type={showLoginPassword ? "text" : "password"} tabIndex={2} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e as any); }} className={`${inputClass} pr-12`} placeholder="••••••••" autoComplete="current-password" suppressHydrationWarning required />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowLoginPassword((value) => !value)}
                        className={cn('absolute', 'inset-y-0', 'right-0', 'pr-4', 'text-foreground/50', 'hover:text-foreground')}
                      >
                        {showLoginPassword ? <EyeOff className={cn('h-5', 'w-5')} /> : <Eye className={cn('h-5', 'w-5')} />}
                      </button>
                    </motion.div>
                  </div>

                  <motion.button
                    type="submit"
                    tabIndex={3}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={loading}
                    className={cn('w-full', 'h-14', 'mt-4', 'bg-black', 'text-white', 'font-bold', 'rounded-2xl', 'hover:scale-[1.02]', 'transition-all', 'flex', 'items-center', 'justify-center', 'gap-2', 'shadow-[0_0_20px_rgba(255,255,255,0.05)]', 'disabled:opacity-60', 'disabled:cursor-wait')}
                  >
                    {loading ? "Signing in…" : <><span>Sign In</span><ArrowRight className={cn('w-5', 'h-5')} /></>}
                  </motion.button>

                  <GoogleButton refEl={googleLoginButtonRef} onGoogleOAuth={handleGoogleOAuth} loading={loading} />
                </form>

                <p className={cn('mt-8', 'text-center', 'text-foreground/50', 'text-sm', 'font-medium', 'md:hidden')}>
                  Don&apos;t have an account?{" "}
                  <button onClick={() => switchMode(false)} className={cn('text-foreground/80', 'font-semibold', 'hover:text-foreground', 'transition-colors')}>Sign up</button>
                </p>
              </motion.div>
            ) : (
            /* ── SIGNUP FORM ── */
              <motion.div
                key="signup-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className={cn('w-full', 'max-w-sm', 'mx-auto')}
              >
                <div className={cn('mb-8', 'text-center', 'md:text-left')}>
                  <h2 className={cn('text-4xl', 'font-black', 'mb-2', 'text-foreground')}>Join SyncBeats</h2>
                  <p className={cn('text-foreground/50', 'font-medium')}>Create an account to start syncing audio.</p>
                </div>

                {error && (
                  <div className={cn('mb-5', 'flex', 'items-center', 'gap-2', 'text-sm', 'text-red-400', 'bg-red-500/10', 'border', 'border-red-500/20', 'rounded-2xl', 'p-4')}>
                    <AlertCircle className={cn('w-4', 'h-4', 'shrink-0')} />{error}
                  </div>
                )}

                <form className="space-y-4" onSubmit={handleAuth}>
                  <div className="space-y-1.5">
                    <label className={cn('text-xs', 'font-semibold', 'text-foreground/60', 'ml-1', 'uppercase', 'tracking-wider')}>Full Name</label>
                    <motion.div
                      key={`signup-name-${shakeNonce}`}
                      animate={shakeTargets.includes("signup-name") ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      className="relative"
                    >
                      <div className={cn('absolute', 'inset-y-0', 'left-0', 'pl-3', 'flex', 'items-center', 'pointer-events-none')}><User className={cn('h-4', 'w-4', 'text-foreground/50')} /></div>
                      <input type="text" tabIndex={1} value={name} onChange={e => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e as any); }} className={inputClassSm} placeholder="Your Name" autoComplete="name" suppressHydrationWarning required />
                    </motion.div>
                  </div>

                  <div className="space-y-1.5">
                    <label className={cn('text-xs', 'font-semibold', 'text-foreground/60', 'ml-1', 'uppercase', 'tracking-wider')}>Email Address</label>
                    <motion.div
                      key={`signup-email-${shakeNonce}`}
                      animate={shakeTargets.includes("signup-email") ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      className="relative"
                    >
                      <div className={cn('absolute', 'inset-y-0', 'left-0', 'pl-3', 'flex', 'items-center', 'pointer-events-none')}><Mail className={cn('h-4', 'w-4', 'text-foreground/50')} /></div>
                      <input type="email" tabIndex={2} value={email} onChange={e => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e as any); }} className={getEmailInputClass(inputClassSm, false)} placeholder="name@email.com" autoComplete="email" suppressHydrationWarning required />
                    </motion.div>
                  </div>

                  <div className="space-y-1.5">
                    <label className={cn('text-xs', 'font-semibold', 'text-foreground/60', 'ml-1', 'uppercase', 'tracking-wider')}>Password</label>
                    <motion.div
                      key={`signup-password-${shakeNonce}`}
                      animate={shakeTargets.includes("signup-password") ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      className="relative"
                    >
                      <div className={cn('absolute', 'inset-y-0', 'left-0', 'pl-3', 'flex', 'items-center', 'pointer-events-none')}><Lock className={cn('h-4', 'w-4', 'text-foreground/50')} /></div>
                      <input type={showSignupPassword ? "text" : "password"} tabIndex={3} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e as any); }} className={`${inputClassSm} pr-10`} placeholder="Min. 8 characters" autoComplete="new-password" suppressHydrationWarning required minLength={8} />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowSignupPassword((value) => !value)}
                        className={cn('absolute', 'inset-y-0', 'right-0', 'pr-3', 'text-foreground/50', 'hover:text-foreground')}
                      >
                        {showSignupPassword ? <EyeOff className={cn('h-4', 'w-4')} /> : <Eye className={cn('h-4', 'w-4')} />}
                      </button>
                    </motion.div>
                  </div>

                  <div className="space-y-1.5">
                    <label className={cn('text-xs', 'font-semibold', 'text-foreground/60', 'ml-1', 'uppercase', 'tracking-wider')}>Confirm Password</label>
                    <motion.div
                      key={`signup-confirm-password-${shakeNonce}`}
                      animate={shakeTargets.includes("signup-confirm-password") ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      className="relative"
                    >
                      <div className={cn('absolute', 'inset-y-0', 'left-0', 'pl-3', 'flex', 'items-center', 'pointer-events-none')}><Lock className={cn('h-4', 'w-4', 'text-foreground/50')} /></div>
                      <input type={showSignupConfirmPassword ? "text" : "password"} tabIndex={4} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e as any); }} className={`${inputClassSm} pr-10`} placeholder="Confirm password" autoComplete="new-password" suppressHydrationWarning required minLength={8} />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowSignupConfirmPassword((value) => !value)}
                        className={cn('absolute', 'inset-y-0', 'right-0', 'pr-3', 'text-foreground/50', 'hover:text-foreground')}
                      >
                        {showSignupConfirmPassword ? <EyeOff className={cn('h-4', 'w-4')} /> : <Eye className={cn('h-4', 'w-4')} />}
                      </button>
                    </motion.div>
                  </div>

                  <motion.button
                    type="submit"
                    tabIndex={5}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={loading}
                    className={cn('w-full', 'h-12', 'mt-4', 'bg-black', 'text-white', 'font-bold', 'rounded-xl', 'hover:scale-[1.02]', 'transition-all', 'flex', 'items-center', 'justify-center', 'gap-2', 'shadow-[0_0_20px_rgba(255,255,255,0.05)]', 'disabled:opacity-60', 'disabled:cursor-wait')}
                  >
                    {loading ? "Creating account…" : <><span>Create Account</span><ArrowRight className={cn('w-4', 'h-4')} /></>}
                  </motion.button>

                  <GoogleButton refEl={googleSignupButtonRef} onGoogleOAuth={handleGoogleOAuth} loading={loading} />
                </form>

                <p className={cn('mt-8', 'text-center', 'text-foreground/50', 'text-sm', 'font-medium', 'md:hidden')}>
                  Already have an account?{" "}
                  <button type="button" onClick={() => switchMode(true)} className={cn('text-foreground/80', 'font-semibold', 'hover:text-foreground', 'transition-colors')}>Sign in</button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* PANEL B — Branding */}
        <div
          className={`hidden md:flex absolute top-0 left-0 w-1/2 h-full z-20 flex-col items-center justify-center text-center p-12 overflow-hidden border-l border-r border-foreground/10 bg-background/5 backdrop-blur-xl transition-transform duration-700 ease-in-out ${isLogin ? 'translate-x-full' : 'translate-x-0'}`}
        >
          <div className={cn('absolute', 'inset-0', 'flex', 'items-center', 'justify-center', 'opacity-30')}>
            <div className={cn('absolute', 'w-200', 'h-200', 'border', 'border-foreground/5', 'rounded-full', 'animate-[spin_40s_linear_infinite]')} />
            <div className={cn('absolute', 'w-150', 'h-150', 'border', 'border-foreground/10', 'rounded-full', 'animate-[spin_30s_linear_infinite_reverse]')} />
            <div className={cn('absolute', 'w-100', 'h-100', 'bg-foreground/5', 'blur-[80px]', 'rounded-full', 'pointer-events-none')} />
          </div>

          <AnimatePresence mode="wait">
            {isLogin ? (
              <motion.div key="branding-login" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3 }} className={cn('relative', 'z-10', 'flex', 'flex-col', 'items-center', 'max-w-sm')}>
                <Disc className={cn('w-20', 'h-20', 'text-foreground/80', 'mb-8', 'animate-[spin_10s_linear_infinite]')} />
                <h2 className={cn('text-4xl', 'font-black', 'mb-4', 'text-foreground')}>New Here?</h2>
                <p className={cn('text-foreground/60', 'mb-10', 'text-lg', 'leading-relaxed')}>Sign up to host rooms, save your history, and turn your devices into the ultimate soundsystem.</p>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => switchMode(false)} className={cn('h-12', 'px-8', 'rounded-full', 'border', 'border-white/20', 'text-foreground', 'font-bold', 'hover:bg-foreground/10', 'transition-colors')}>
                  Create an Account
                </motion.button>
              </motion.div>
            ) : (
              <motion.div key="branding-signup" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3 }} className={cn('relative', 'z-10', 'flex', 'flex-col', 'items-center', 'max-w-sm')}>
                <Info className={cn('w-16', 'h-16', 'text-foreground/80', 'mb-8')} />
                <h2 className={cn('text-4xl', 'font-black', 'mb-4', 'text-foreground')}>Welcome Back!</h2>
                <p className={cn('text-foreground/60', 'mb-10', 'text-lg', 'leading-relaxed')}>Already a part of the platform? Log back in to access your synced sessions and continue the party.</p>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => switchMode(true)} className={cn('h-12', 'px-8', 'rounded-full', 'border', 'border-white/20', 'text-foreground', 'font-bold', 'hover:bg-foreground/10', 'transition-colors')}>
                  Sign In Instead
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function GoogleButton({
  onGoogleOAuth,
  loading
}: {
  refEl?: React.RefObject<HTMLDivElement | null>;
  onGoogleOAuth: () => void;
  loading: boolean;
}) {
  return (
    <div className={cn('flex', 'flex-col', 'items-center', 'gap-3', 'w-full', 'my-4', 'py-2')}>
      {/* Divider */}
      <div className={cn('flex', 'items-center', 'gap-3', 'w-full')}>
        <div className={cn('flex-1', 'h-px', 'bg-foreground/10')} />
        <span className={cn('text-[11px]', 'font-semibold', 'uppercase', 'tracking-widest', 'text-foreground/30')}>or</span>
        <div className={cn('flex-1', 'h-px', 'bg-foreground/10')} />
      </div>

      {/* Primary OAuth Button */}
      <div className={cn('relative', 'w-full')}>
        <button
          type="button"
          disabled={loading}
          onClick={onGoogleOAuth}
          className={cn('w-full', 'h-14', 'flex', 'items-center', 'justify-center', 'gap-3', 'rounded-full', 'bg-foreground/5', 'border', 'border-foreground/10', 'hover:bg-foreground/10', 'active:scale-[0.98]', 'text-foreground', 'text-sm', 'font-semibold', 'transition-all', 'disabled:opacity-50', 'disabled:cursor-wait', 'shadow-sm', 'cursor-pointer')}
        >
          <svg className={cn('w-5', 'h-5', 'shrink-0')} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
