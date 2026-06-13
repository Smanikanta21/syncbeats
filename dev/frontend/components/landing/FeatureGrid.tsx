"use client";

import { motion } from "framer-motion";
import { Headphones, Radio, Play } from "lucide-react";

export function FeatureGrid() {
  return (
    <section aria-labelledby="features-heading" className="w-full flex justify-center px-6 mb-32">
      <h2 id="features-heading" className="sr-only">Platform Features</h2>
      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl mx-auto"
      >
        <div className="glass-panel p-8 rounded-[2rem] border border-foreground/5 bg-background/40 shadow-[0_10px_40px_rgba(0,0,0,0.15)] text-left hover:-translate-y-1 transition-transform duration-300">
          <div className="w-14 h-14 rounded-2xl bg-foreground/10 flex items-center justify-center mb-6 border border-foreground/5">
            <Radio className="w-6 h-6 text-foreground" aria-hidden="true" />
          </div>
          <h3 className="text-xl font-black mb-3 text-foreground tracking-tight">Sub-millisecond Sync</h3>
          <p className="text-foreground/50 font-medium text-sm leading-relaxed">
            Our advanced WebAudio engine continuously calculates clock drift to ensure every device fires at the exact same millisecond.
          </p>
        </div>

        <div className="glass-panel p-8 rounded-[2rem] border border-foreground/5 bg-background/40 shadow-[0_10px_40px_rgba(0,0,0,0.15)] text-left hover:-translate-y-1 transition-transform duration-300">
          <div className="w-14 h-14 rounded-2xl bg-foreground/10 flex items-center justify-center mb-6 border border-foreground/5">
            <Headphones className="w-6 h-6 text-foreground" aria-hidden="true" />
          </div>
          <h3 className="text-xl font-black mb-3 text-foreground tracking-tight">Lossless P2P Streaming</h3>
          <p className="text-foreground/50 font-medium text-sm leading-relaxed">
            Upload FLAC or WAV files directly from your device. Tracks are seeded peer-to-peer using WebTorrent, bypassing slow servers.
          </p>
        </div>

        <div className="glass-panel p-8 rounded-[2rem] border border-foreground/5 bg-background/40 shadow-[0_10px_40px_rgba(0,0,0,0.15)] text-left hover:-translate-y-1 transition-transform duration-300">
          <div className="w-14 h-14 rounded-2xl bg-foreground/10 flex items-center justify-center mb-6 border border-foreground/5">
            <Play className="w-6 h-6 text-foreground" aria-hidden="true" />
          </div>
          <h3 className="text-xl font-black mb-3 text-foreground tracking-tight">YouTube Integration</h3>
          <p className="text-foreground/50 font-medium text-sm leading-relaxed">
            Paste a YouTube link and SyncBeats automatically proxies the audio stream to every phone in the room instantly.
          </p>
        </div>
      </motion.div>
    </section>
  );
}
