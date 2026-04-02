"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Lock, Mail, Disc, User, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const router = useRouter();

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/hub");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative px-4 sm:px-6 lg:px-8 overflow-hidden z-0">
      {/* Subtle silver ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-[500px] bg-white/[0.02] blur-[120px] rounded-full pointer-events-none -z-10" />

      {/* Floating minimal logo to go back */}
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

      {/* The Mega Sliding Auth Component */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-5xl h-[700px] md:h-[650px] glass-panel rounded-[2.5rem] bg-black/60 overflow-hidden flex border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.5)] backdrop-blur-3xl"
      >
        {/* Subtle interior glow */}
        <div className="absolute top-0 right-1/2 w-64 h-64 bg-white/5 filter blur-[60px] pointer-events-none" />

        {/* =========================================
            PANEL A: THE FORM CONTAINER 
            (Slides Left & Right on Desktop)
            ========================================= */}
        <motion.div
          initial={false}
          animate={{ x: isLogin ? "0%" : "100%" }}
          transition={{ type: "spring", stiffness: 60, damping: 20 }}
          className="absolute top-0 left-0 w-full md:w-1/2 h-full z-30 flex flex-col justify-center p-8 sm:p-12 md:p-16 bg-black"
        >
          <AnimatePresence mode="wait">
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

                <form className="space-y-6" onSubmit={handleAuth}>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-400 ml-1 uppercase tracking-wider">Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-zinc-500" />
                      </div>
                      <input 
                        type="email" 
                        className="w-full bg-white/5 border border-white/5 focus:border-white/20 rounded-2xl pl-11 pr-4 py-3.5 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all placeholder:text-zinc-600"
                        placeholder="name@email.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Password</label>
                      <a href="#" className="text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors">Forgot?</a>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-zinc-500" />
                      </div>
                      <input 
                        type="password" 
                        className="w-full bg-white/5 border border-white/5 focus:border-white/20 rounded-2xl pl-11 pr-4 py-3.5 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all placeholder:text-zinc-600"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                  </div>

                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full h-14 mt-4 bg-zinc-200 text-black font-bold rounded-2xl hover:bg-white transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.05)] group/btn"
                  >
                    Sign In <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform text-black" />
                  </motion.button>
                </form>

                {/* Mobile-only toggle */}
                <p className="mt-8 text-center text-zinc-500 text-sm font-medium md:hidden">
                  Don't have an account?{" "}
                  <button onClick={() => setIsLogin(false)} className="text-zinc-300 font-semibold hover:text-white transition-colors">Sign up</button>
                </p>
              </motion.div>
            ) : (
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

                <form className="space-y-4" onSubmit={handleAuth}>
                  <div className="space-y-1.5 flex gap-4">
                     <div className="w-full">
                      <label className="text-xs font-semibold text-zinc-400 ml-1 uppercase tracking-wider">Full Name</label>
                      <div className="relative mt-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <User className="h-4 w-4 text-zinc-500" />
                        </div>
                        <input 
                          type="text" 
                          className="w-full bg-white/5 border border-white/5 focus:border-white/20 rounded-xl pl-9 pr-4 py-3 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all placeholder:text-zinc-600"
                          placeholder="Rick Rubin"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-400 ml-1 uppercase tracking-wider">Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-4 w-4 text-zinc-500" />
                      </div>
                      <input 
                        type="email" 
                        className="w-full bg-white/5 border border-white/5 focus:border-white/20 rounded-xl pl-9 pr-4 py-3 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all placeholder:text-zinc-600"
                        placeholder="name@email.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-400 ml-1 uppercase tracking-wider">Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-4 w-4 text-zinc-500" />
                      </div>
                      <input 
                        type="password" 
                        className="w-full bg-white/5 border border-white/5 focus:border-white/20 rounded-xl pl-9 pr-4 py-3 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all placeholder:text-zinc-600"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                  </div>

                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full h-12 mt-4 bg-zinc-200 text-black font-bold rounded-xl hover:bg-white transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.05)] group/btn"
                  >
                    Create Account <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform text-black" />
                  </motion.button>
                </form>

                {/* Mobile-only toggle */}
                <p className="mt-8 text-center text-zinc-500 text-sm font-medium md:hidden">
                  Already have an account?{" "}
                  <button onClick={() => setIsLogin(true)} className="text-zinc-300 font-semibold hover:text-white transition-colors">Sign in</button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* =========================================
            PANEL B: THE BRANDING CONTAINER 
            (Slides opposite direction on Desktop)
            ========================================= */}
        <motion.div
          initial={false}
          animate={{ x: isLogin ? "100%" : "0%" }}
          transition={{ type: "spring", stiffness: 60, damping: 20 }}
          className="hidden md:flex absolute top-0 left-0 w-1/2 h-full z-20 flex-col items-center justify-center text-center p-12 overflow-hidden border-l border-r border-white/10 bg-zinc-950"
        >
           {/* Abstract spinning rings branding background */}
           <div className="absolute inset-0 flex items-center justify-center opacity-30">
              <div className="absolute w-[800px] h-[800px] border border-white/5 rounded-full animate-[spin_40s_linear_infinite]" />
              <div className="absolute w-[600px] h-[600px] border border-white/10 rounded-full animate-[spin_30s_linear_infinite_reverse]" />
              <div className="absolute w-[400px] h-[400px] bg-white/5 blur-[80px] rounded-full pointer-events-none" />
           </div>

           <AnimatePresence mode="wait">
             {isLogin ? (
               <motion.div
                 key="branding-login"
                 initial={{ opacity: 0, scale: 0.9 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 0.9 }}
                 transition={{ duration: 0.3 }}
                 className="relative z-10 flex flex-col items-center max-w-sm"
               >
                 <Disc className="w-20 h-20 text-zinc-300 mb-8 animate-[spin_10s_linear_infinite]" />
                 <h2 className="text-4xl font-black mb-4 text-white">New Here?</h2>
                 <p className="text-zinc-400 mb-10 text-lg leading-relaxed">
                   Sign up to host rooms, save your history, and turn your devices into the ultimate soundsystem.
                 </p>
                 <motion.button 
                   whileHover={{ scale: 1.05 }}
                   whileTap={{ scale: 0.95 }}
                   onClick={() => setIsLogin(false)}
                   className="h-12 px-8 rounded-full border border-white/20 text-white font-bold hover:bg-white/10 transition-colors"
                 >
                   Create an Account
                 </motion.button>
               </motion.div>
             ) : (
               <motion.div
                 key="branding-signup"
                 initial={{ opacity: 0, scale: 0.9 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 0.9 }}
                 transition={{ duration: 0.3 }}
                 className="relative z-10 flex flex-col items-center max-w-sm"
               >
                 <Info className="w-16 h-16 text-zinc-300 mb-8" />
                 <h2 className="text-4xl font-black mb-4 text-white">Welcome Back!</h2>
                 <p className="text-zinc-400 mb-10 text-lg leading-relaxed">
                   Already a part of the platform? Log back in to access your synced sessions and continue the party.
                 </p>
                 <motion.button 
                   whileHover={{ scale: 1.05 }}
                   whileTap={{ scale: 0.95 }}
                   onClick={() => setIsLogin(true)}
                   className="h-12 px-8 rounded-full border border-white/20 text-white font-bold hover:bg-white/10 transition-colors"
                 >
                   Sign In Instead
                 </motion.button>
               </motion.div>
             )}
           </AnimatePresence>
        </motion.div>

      </motion.div>
    </div>
  );
}
