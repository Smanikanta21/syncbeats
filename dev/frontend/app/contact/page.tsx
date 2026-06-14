"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, Mail, MessageSquare } from "lucide-react";
import { Footer } from "../../components/Footer";
import { ThemeToggle } from "../../components/ThemeToggle";

const GithubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.24c3-.34 6-1.53 6-6.76a5.5 5.5 0 0 0-1.5-3.89 5.06 5.06 0 0 0-.14-3.83s-1.18-.38-3.91 1.4a13.48 13.48 0 0 0-7 0c-2.73-1.78-3.91-1.4-3.91-1.4a5.06 5.06 0 0 0-.14 3.83A5.5 5.5 0 0 0 2 8.76c0 5.23 3 6.42 6 6.76a4.8 4.8 0 0 0-1 3.24v4" />
  </svg>
);

const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[30%] -left-[10%] w-[70vw] h-[70vw] bg-foreground/5 blur-[120px] rounded-full" />
        <div className="absolute top-[40%] -right-[20%] w-[60vw] h-[60vw] bg-foreground/5 blur-[100px] rounded-full" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-8 md:px-12 md:py-10">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-4"
        >
          <Link href="/" className="w-10 h-10 rounded-xl bg-foreground/10 flex items-center justify-center hover:bg-foreground/20 transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <span className="text-xl font-black tracking-widest text-foreground">
            SYNC<span className="text-foreground/50">BEATS</span>
          </span>
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-6"
        >
          <ThemeToggle />
        </motion.div>
      </nav>

      {/* Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-6 pt-12 pb-24 max-w-4xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full text-center mb-16"
        >
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-6">Get in Touch</h1>
          <p className="text-lg text-foreground/60 max-w-2xl mx-auto">
            Have a question, feedback, or just want to say hi? We'd love to hear from you. 
            Reach out using any of the platforms below.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full"
        >
          <a href="mailto:siraparapuabhinay21@gmail.com" className="group p-8 rounded-3xl bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 hover:border-foreground/20 transition-all text-center flex flex-col items-center backdrop-blur-xl">
            <div className="w-16 h-16 rounded-2xl bg-foreground/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Mail className="w-8 h-8 text-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-2">Email</h3>
            <p className="text-foreground/60">Drop us a line anytime</p>
            <p className="mt-4 font-mono text-sm">siraparapuabhinay21@gmail.com</p>
          </a>

          <a href="https://github.com/Smanikanta21/syncbeats/issues" target="_blank" rel="noreferrer" className="group p-8 rounded-3xl bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 hover:border-foreground/20 transition-all text-center flex flex-col items-center backdrop-blur-xl">
            <div className="w-16 h-16 rounded-2xl bg-foreground/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <GithubIcon className="w-8 h-8 text-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-2">GitHub</h3>
            <p className="text-foreground/60">Report bugs or request features</p>
            <p className="mt-4 font-mono text-sm">@Smanikanta21/syncbeats</p>
          </a>

          <a href="https://www.linkedin.com/in/siraparapu-shiva-sankar-mani-kanta-622a85323/" target="_blank" rel="noreferrer" className="group p-8 rounded-3xl bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 hover:border-foreground/20 transition-all text-center flex flex-col items-center backdrop-blur-xl md:col-span-2 max-w-xl mx-auto w-full">
            <div className="w-16 h-16 rounded-2xl bg-foreground/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <LinkedinIcon className="w-8 h-8 text-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-2">LinkedIn</h3>
            <p className="text-foreground/60">Connect professionally</p>
            <p className="mt-4 font-mono text-sm">Abhinay Siraparapu</p>
          </a>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
