"use client";

import { useState, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Lock, Mail, Disc, User, Info, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const router  = useRouter();
  const { login, register } = useAuth();

  // Form state
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const resetForm = () => { setName(""); setEmail(""); setPassword(""); setError(null); };

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      router.push("/hub");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (toLogin: boolean) => {
    setIsLogin(toLogin);
    resetForm();
  };

  const inputClass = "w-full bg-white/5 border border-white/5 focus:border-white/20 rounded-2xl pl-11 pr-4 py-3.5 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all placeholder:text-zinc-600";
  const inputClassSm = "w-full bg-white/5 border border-white/5 focus:border-white/20 rounded-xl pl-9 pr-4 py-3 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all placeholder:text-zinc-600";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative px-4 sm:px-6 lg:px-8 overflow-hidden z-0">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-[500px] bg-white/[0.02] blur-[120px] rounded-full pointer-events-none -z-10" />

      {/* Home link */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="absolute top-8 left-8 z-50"
      >
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-colors">
            <Disc className="w-4 h-4 text-zinc-300 animate-[spin_4s_linear_infinite]" />
          </div>
          <span className="text-sm font-bold tracking-widest text-zinc-400 group-hover:text-white transition-colors">HOME</span>
        </Link>
      </motion.div>

      {/* Sliding Auth Component */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-5xl min-h-[600px] sm:h-[700px] md:h-[650px] glass-panel rounded-[2.5rem] bg-black/60 overflow-y-auto overflow-x-hidden md:overflow-hidden flex border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.5)] backdrop-blur-3xl"
      >
        <div className="absolute top-0 right-1/2 w-64 h-64 bg-white/5 filter blur-[60px] pointer-events-none" />

        {/* PANEL A — Form */}
        <div
          className={`absolute top-0 left-0 w-full md:w-1/2 h-full z-30 flex flex-col justify-center p-6 sm:p-12 md:p-16 bg-black transition-transform duration-700 ease-in-out ${isLogin ? 'translate-x-0' : 'md:translate-x-full'} overflow-y-auto`}
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
                  <h2 className="text-4xl font-black mb-3 text-zinc-200">Welcome Back</h2>
                  <p className="text-zinc-500 font-medium">Log in to manage your synced sessions.</p>
                </div>

                {error && (
                  <div className="mb-6 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                    <AlertCircle className="w-4 h-4 shrink-0" />{error}
                  </div>
                )}

                <form className="space-y-6" onSubmit={handleAuth}>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-400 ml-1 uppercase tracking-wider">Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Mail className="h-5 w-5 text-zinc-500" /></div>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="name@email.com" required />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Password</label>
                      <a href="#" className="text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors">Forgot?</a>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-zinc-500" /></div>
                      <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} placeholder="••••••••" required />
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={loading}
                    className="w-full h-14 mt-4 bg-zinc-200 text-black font-bold rounded-2xl hover:bg-white transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.05)] disabled:opacity-60 disabled:cursor-wait"
                  >
                    {loading ? "Signing in…" : <><span>Sign In</span><ArrowRight className="w-5 h-5" /></>}
                  </motion.button>
                </form>

                <p className="mt-8 text-center text-zinc-500 text-sm font-medium md:hidden">
                  Don&apos;t have an account?{" "}
                  <button onClick={() => switchMode(false)} className="text-zinc-300 font-semibold hover:text-white transition-colors">Sign up</button>
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
                  <h2 className="text-4xl font-black mb-2 text-zinc-200">Join SyncBeats</h2>
                  <p className="text-zinc-500 font-medium">Create an account to start syncing audio.</p>
                </div>

                {error && (
                  <div className="mb-5 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                    <AlertCircle className="w-4 h-4 shrink-0" />{error}
                  </div>
                )}

                <form className="space-y-4" onSubmit={handleAuth}>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-400 ml-1 uppercase tracking-wider">Full Name</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><User className="h-4 w-4 text-zinc-500" /></div>
                      <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClassSm} placeholder="Rick Rubin" required />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-400 ml-1 uppercase tracking-wider">Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Mail className="h-4 w-4 text-zinc-500" /></div>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClassSm} placeholder="name@email.com" required />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-400 ml-1 uppercase tracking-wider">Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-4 w-4 text-zinc-500" /></div>
                      <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputClassSm} placeholder="Min. 8 characters" required minLength={8} />
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={loading}
                    className="w-full h-12 mt-4 bg-zinc-200 text-black font-bold rounded-xl hover:bg-white transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.05)] disabled:opacity-60 disabled:cursor-wait"
                  >
                    {loading ? "Creating account…" : <><span>Create Account</span><ArrowRight className="w-4 h-4" /></>}
                  </motion.button>
                </form>

                <p className="mt-8 text-center text-zinc-500 text-sm font-medium md:hidden">
                  Already have an account?{" "}
                  <button onClick={() => switchMode(true)} className="text-zinc-300 font-semibold hover:text-white transition-colors">Sign in</button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* PANEL B — Branding */}
        <div
          className={`hidden md:flex absolute top-0 left-0 w-1/2 h-full z-20 flex-col items-center justify-center text-center p-12 overflow-hidden border-l border-r border-white/10 bg-zinc-950 transition-transform duration-700 ease-in-out ${isLogin ? 'translate-x-full' : 'translate-x-0'}`}
        >
          <div className="absolute inset-0 flex items-center justify-center opacity-30">
            <div className="absolute w-[800px] h-[800px] border border-white/5 rounded-full animate-[spin_40s_linear_infinite]" />
            <div className="absolute w-[600px] h-[600px] border border-white/10 rounded-full animate-[spin_30s_linear_infinite_reverse]" />
            <div className="absolute w-[400px] h-[400px] bg-white/5 blur-[80px] rounded-full pointer-events-none" />
          </div>

          <AnimatePresence mode="wait">
            {isLogin ? (
              <motion.div key="branding-login" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3 }} className="relative z-10 flex flex-col items-center max-w-sm">
                <Disc className="w-20 h-20 text-zinc-300 mb-8 animate-[spin_10s_linear_infinite]" />
                <h2 className="text-4xl font-black mb-4 text-white">New Here?</h2>
                <p className="text-zinc-400 mb-10 text-lg leading-relaxed">Sign up to host rooms, save your history, and turn your devices into the ultimate soundsystem.</p>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => switchMode(false)} className="h-12 px-8 rounded-full border border-white/20 text-white font-bold hover:bg-white/10 transition-colors">
                  Create an Account
                </motion.button>
              </motion.div>
            ) : (
              <motion.div key="branding-signup" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3 }} className="relative z-10 flex flex-col items-center max-w-sm">
                <Info className="w-16 h-16 text-zinc-300 mb-8" />
                <h2 className="text-4xl font-black mb-4 text-white">Welcome Back!</h2>
                <p className="text-zinc-400 mb-10 text-lg leading-relaxed">Already a part of the platform? Log back in to access your synced sessions and continue the party.</p>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => switchMode(true)} className="h-12 px-8 rounded-full border border-white/20 text-white font-bold hover:bg-white/10 transition-colors">
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
