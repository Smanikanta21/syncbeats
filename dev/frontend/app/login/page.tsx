"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Lock, Mail, Disc, User, Info, AlertCircle, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../lib/api";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const router  = useRouter();
  const { login, register, googleLogin } = useAuth();
  const [googleReady, setGoogleReady] = useState(false);
  const googleLoginButtonRef = useRef<HTMLDivElement | null>(null);
  const googleSignupButtonRef = useRef<HTMLDivElement | null>(null);

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
  const [googleRedirectLoading, setGoogleRedirectLoading] = useState(false);
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof window !== "undefined") {
      setTheme(localStorage.getItem('theme'));
    }
    const params = new URLSearchParams(window.location.search);
    const cameFromGoogle = document.referrer.includes("accounts.google.");
    const hasGoogleOAuthParams =
      params.has("code") ||
      params.has("state") ||
      params.has("scope") ||
      params.has("authuser") ||
      params.has("error");

    if (!cameFromGoogle && !hasGoogleOAuthParams) return;

    setGoogleRedirectLoading(true);
    const timeoutId = window.setTimeout(() => {
      setGoogleRedirectLoading(false);
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
      if (isLogin) {
        await login(email, password);
        router.push("/hub");
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
    } finally {
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

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    let cancelled = false;

    const initGoogle = () => {
      const google = (window as any).google;
      if (!google?.accounts?.id || cancelled) return;

      console.log("[GSI DEBUG] Initializing Google Auth with:");
      console.log("[GSI DEBUG] Client ID:", clientId);
      console.log("[GSI DEBUG] Origin:", window.location.origin);

      google.accounts.id.initialize({
        client_id: clientId,
        auto_select: false,
        use_fedcm_for_prompt: false,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) return;
          setError(null);
          setGoogleRedirectLoading(true);
          setLoading(true);
          try {
            await googleLogin(response.credential);
            router.push("/hub");
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setLoading(false);
            setGoogleRedirectLoading(false);
          }
        },
      });

      google.accounts.id.prompt();

      setGoogleReady(true);
    };

    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      initGoogle();
      return () => {
        cancelled = true;
        if (typeof window !== "undefined" && (window as any).google?.accounts?.id) {
          (window as any).google.accounts.id.cancel();
        }
      };
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initGoogle;
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      if (typeof window !== "undefined" && (window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.cancel();
      }
    };
  }, [googleLogin, router]);

  // Handle Dynamic Google Button Rendering on Tab Switch
  useEffect(() => {
    if (!googleReady || typeof window === "undefined") return;
    const google = (window as any).google;
    if (!google) return;

    // Small delay allows AnimatePresence to inject the new form into the DOM
    const timer = setTimeout(() => {
      if (isLogin && googleLoginButtonRef.current) {
        googleLoginButtonRef.current.innerHTML = "";
        google.accounts.id.renderButton(googleLoginButtonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: 320,
        });
      } else if (!isLogin && googleSignupButtonRef.current) {
        googleSignupButtonRef.current.innerHTML = "";
        google.accounts.id.renderButton(googleSignupButtonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "signup_with",
          width: 320,
        });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [isLogin, googleReady]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative px-4 sm:px-6 lg:px-8 overflow-hidden z-0">
      {googleRedirectLoading && (
        <div className="fixed inset-0 z-95 bg-background/70 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="rounded-3xl border border-foreground/10 bg-background px-6 py-5 flex items-center gap-3 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
            <LoaderCircle className="w-5 h-5 text-foreground animate-spin" />
            <p className="text-sm font-semibold text-foreground">Completing Google sign in...</p>
          </div>
        </div>
      )}

      <div className={`${theme === 'light' ? 'mesh-bg' : ''}`} />

      {/* Home link */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="absolute top-8 left-8 z-50"
      >
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-full bg-foreground/5 border border-foreground/10 flex items-center justify-center group-hover:bg-foreground/10 transition-colors">
            <Disc className="w-4 h-4 text-foreground/80 animate-[spin_4s_linear_infinite]" />
          </div>
          <span className="text-sm font-bold tracking-widest text-foreground/60 group-hover:text-foreground transition-colors">HOME</span>
        </Link>
      </motion.div>

      {/* Sliding Auth Component */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-5xl min-h-150 sm:h-175 md:h-162.5 glass-panel rounded-[2.5rem] bg-background/80 overflow-y-auto overflow-x-hidden md:overflow-hidden flex border border-foreground/10 shadow-[0_20px_80px_rgba(0,0,0,0.5)] backdrop-blur-3xl"
      >
        <div className="absolute top-0 right-1/2 w-64 h-64 bg-foreground/5 filter blur-[60px] pointer-events-none" />

        {/* PANEL A — Form */}
        <div
          className={`absolute top-0 left-0 w-full md:w-1/2 h-full z-30 flex flex-col justify-center p-6 sm:p-12 md:p-16 bg-background transition-transform duration-700 ease-in-out ${isLogin ? 'translate-x-0' : 'md:translate-x-full'} overflow-y-auto`}
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
                className="w-full max-w-sm mx-auto"
              >
                <div className="mb-10 text-center md:text-left">
                  <h2 className="text-4xl font-black mb-3 text-foreground">Welcome Back</h2>
                  <p className="text-foreground/50 font-medium">Log in to manage your synced sessions.</p>
                </div>

                {error && (
                  <div className="mb-6 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                    <AlertCircle className="w-4 h-4 shrink-0" />{error}
                  </div>
                )}

                <form className="space-y-6" onSubmit={handleAuth}>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground/60 ml-1 uppercase tracking-wider">Email Address</label>
                    <motion.div
                      key={`login-email-${shakeNonce}`}
                      animate={shakeTargets.includes("login-email") ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      className="relative"
                    >
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Mail className="h-5 w-5 text-foreground/50" /></div>
                      <input type="email" tabIndex={1} value={email} onChange={e => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e as any); }} className={getEmailInputClass(inputClass, true)} placeholder="name@email.com" autoComplete="email" suppressHydrationWarning required />
                    </motion.div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">Password</label>
                      <Link href="/forgot-password" tabIndex={4} className="text-xs font-medium text-foreground/50 hover:text-foreground/80 transition-colors">Forgot?</Link>
                    </div>
                    <motion.div
                      key={`login-password-${shakeNonce}`}
                      animate={shakeTargets.includes("login-password") ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      className="relative"
                    >
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-foreground/50" /></div>
                      <input type={showLoginPassword ? "text" : "password"} tabIndex={2} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e as any); }} className={`${inputClass} pr-12`} placeholder="••••••••" autoComplete="current-password" suppressHydrationWarning required />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowLoginPassword((value) => !value)}
                        className="absolute inset-y-0 right-0 pr-4 text-foreground/50 hover:text-foreground"
                      >
                        {showLoginPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </motion.div>
                  </div>

                  <motion.button
                    type="submit"
                    tabIndex={3}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={loading}
                    className="w-full h-14 mt-4 bg-foreground text-background font-bold rounded-2xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.05)] disabled:opacity-60 disabled:cursor-wait"
                  >
                    {loading ? "Signing in…" : <><span>Sign In</span><ArrowRight className="w-5 h-5" /></>}
                  </motion.button>

                  <div className="pt-1 flex justify-center">
                    {!googleReady && <span className="text-xs text-foreground/50">Loading Google...</span>}
                    <div ref={googleLoginButtonRef} />
                  </div>
                </form>

                <p className="mt-8 text-center text-foreground/50 text-sm font-medium md:hidden">
                  Don&apos;t have an account?{" "}
                  <button onClick={() => switchMode(false)} className="text-foreground/80 font-semibold hover:text-foreground transition-colors">Sign up</button>
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
                className="w-full max-w-sm mx-auto"
              >
                <div className="mb-8 text-center md:text-left">
                  <h2 className="text-4xl font-black mb-2 text-foreground">Join SyncBeats</h2>
                  <p className="text-foreground/50 font-medium">Create an account to start syncing audio.</p>
                </div>

                {error && (
                  <div className="mb-5 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                    <AlertCircle className="w-4 h-4 shrink-0" />{error}
                  </div>
                )}

                <form className="space-y-4" onSubmit={handleAuth}>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/60 ml-1 uppercase tracking-wider">Full Name</label>
                    <motion.div
                      key={`signup-name-${shakeNonce}`}
                      animate={shakeTargets.includes("signup-name") ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      className="relative"
                    >
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><User className="h-4 w-4 text-foreground/50" /></div>
                      <input type="text" tabIndex={1} value={name} onChange={e => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e as any); }} className={inputClassSm} placeholder="Your Name" autoComplete="name" suppressHydrationWarning required />
                    </motion.div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/60 ml-1 uppercase tracking-wider">Email Address</label>
                    <motion.div
                      key={`signup-email-${shakeNonce}`}
                      animate={shakeTargets.includes("signup-email") ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      className="relative"
                    >
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Mail className="h-4 w-4 text-foreground/50" /></div>
                      <input type="email" tabIndex={2} value={email} onChange={e => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e as any); }} className={getEmailInputClass(inputClassSm, false)} placeholder="name@email.com" autoComplete="email" suppressHydrationWarning required />
                    </motion.div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/60 ml-1 uppercase tracking-wider">Password</label>
                    <motion.div
                      key={`signup-password-${shakeNonce}`}
                      animate={shakeTargets.includes("signup-password") ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      className="relative"
                    >
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-4 w-4 text-foreground/50" /></div>
                      <input type={showSignupPassword ? "text" : "password"} tabIndex={3} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e as any); }} className={`${inputClassSm} pr-10`} placeholder="Min. 8 characters" autoComplete="new-password" suppressHydrationWarning required minLength={8} />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowSignupPassword((value) => !value)}
                        className="absolute inset-y-0 right-0 pr-3 text-foreground/50 hover:text-foreground"
                      >
                        {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </motion.div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground/60 ml-1 uppercase tracking-wider">Confirm Password</label>
                    <motion.div
                      key={`signup-confirm-password-${shakeNonce}`}
                      animate={shakeTargets.includes("signup-confirm-password") ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                      transition={{ duration: 0.35 }}
                      className="relative"
                    >
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-4 w-4 text-foreground/50" /></div>
                      <input type={showSignupConfirmPassword ? "text" : "password"} tabIndex={4} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAuth(e as any); }} className={`${inputClassSm} pr-10`} placeholder="Confirm password" autoComplete="new-password" suppressHydrationWarning required minLength={8} />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowSignupConfirmPassword((value) => !value)}
                        className="absolute inset-y-0 right-0 pr-3 text-foreground/50 hover:text-foreground"
                      >
                        {showSignupConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </motion.div>
                  </div>

                  <motion.button
                    type="submit"
                    tabIndex={5}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={loading}
                    className="w-full h-12 mt-4 bg-foreground text-background font-bold rounded-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.05)] disabled:opacity-60 disabled:cursor-wait"
                  >
                    {loading ? "Creating account…" : <><span>Create Account</span><ArrowRight className="w-4 h-4" /></>}
                  </motion.button>

                  <div className="pt-2 flex flex-col items-center gap-2">
                    <span className="text-xs uppercase tracking-[0.25em] text-foreground/40">Or use Google</span>
                    {!googleReady && <span className="text-xs text-foreground/50">Loading Google...</span>}
                    <div ref={googleSignupButtonRef} />
                  </div>
                </form>

                <p className="mt-8 text-center text-foreground/50 text-sm font-medium md:hidden">
                  Already have an account?{" "}
                  <button type="button" onClick={() => switchMode(true)} className="text-foreground/80 font-semibold hover:text-foreground transition-colors">Sign in</button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* PANEL B — Branding */}
        <div
          className={`hidden md:flex absolute top-0 left-0 w-1/2 h-full z-20 flex-col items-center justify-center text-center p-12 overflow-hidden border-l border-r border-foreground/10 bg-background transition-transform duration-700 ease-in-out ${isLogin ? 'translate-x-full' : 'translate-x-0'}`}
        >
          <div className="absolute inset-0 flex items-center justify-center opacity-30">
            <div className="absolute w-200 h-200 border border-foreground/5 rounded-full animate-[spin_40s_linear_infinite]" />
            <div className="absolute w-150 h-150 border border-foreground/10 rounded-full animate-[spin_30s_linear_infinite_reverse]" />
            <div className="absolute w-100 h-100 bg-foreground/5 blur-[80px] rounded-full pointer-events-none" />
          </div>

          <AnimatePresence mode="wait">
            {isLogin ? (
              <motion.div key="branding-login" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3 }} className="relative z-10 flex flex-col items-center max-w-sm">
                <Disc className="w-20 h-20 text-foreground/80 mb-8 animate-[spin_10s_linear_infinite]" />
                <h2 className="text-4xl font-black mb-4 text-foreground">New Here?</h2>
                <p className="text-foreground/60 mb-10 text-lg leading-relaxed">Sign up to host rooms, save your history, and turn your devices into the ultimate soundsystem.</p>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => switchMode(false)} className="h-12 px-8 rounded-full border border-white/20 text-foreground font-bold hover:bg-foreground/10 transition-colors">
                  Create an Account
                </motion.button>
              </motion.div>
            ) : (
              <motion.div key="branding-signup" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3 }} className="relative z-10 flex flex-col items-center max-w-sm">
                <Info className="w-16 h-16 text-foreground/80 mb-8" />
                <h2 className="text-4xl font-black mb-4 text-foreground">Welcome Back!</h2>
                <p className="text-foreground/60 mb-10 text-lg leading-relaxed">Already a part of the platform? Log back in to access your synced sessions and continue the party.</p>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => switchMode(true)} className="h-12 px-8 rounded-full border border-white/20 text-foreground font-bold hover:bg-foreground/10 transition-colors">
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
