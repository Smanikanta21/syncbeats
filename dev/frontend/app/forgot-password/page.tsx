"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Disc } from "lucide-react";
import { ForgotPasswordPanel } from "../../components/ForgotPasswordPanel";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const initialEmail = params.get("email") || "";
    setEmail(initialEmail);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 relative">
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

      {/* Main card wrapper */}
      <div className="w-full max-w-md rounded-[2.5rem] bg-background/60 backdrop-blur-2xl border border-foreground/10 shadow-[0_30px_60px_rgba(0,0,0,0.4)] p-8">
        <ForgotPasswordPanel 
          initialEmail={email} 
          onClose={() => router.push("/login")} 
        />
        
        <p className="mt-4 text-xs font-bold uppercase tracking-wider text-foreground/40 hover:text-foreground/80 text-center">
          <Link href="/login" className="transition-colors">
            ← Back to Login
          </Link>
        </p>
      </div>
    </main>
  );
}
