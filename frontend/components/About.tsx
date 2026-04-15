"use client";

import { motion } from "framer-motion";

export function About() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative z-10">
      <div className="max-w-6xl mx-auto group">
        
        {/* Minute outer hover glow for entire section - silver */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-white/0 group-hover:bg-white/[0.02] blur-[100px] transition-all duration-1000 rounded-full pointer-events-none -z-10" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="glass-panel border-white/5 group-hover:border-white/10 rounded-[3rem] p-12 md:p-20 relative overflow-hidden transition-all duration-700 shadow-xl group-hover:shadow-[0_0_40px_rgba(255,255,255,0.02)] bg-black/60 backdrop-blur-3xl"
        >
          {/* Decorative glowing border effect pulsating on hover */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-10 group-hover:opacity-30 transition-opacity duration-1000" />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center relative z-10">
            <div>
              <h2 className="text-4xl md:text-6xl font-black mb-8 tracking-tighter text-zinc-300">
                Built because <br />
                <span className="text-zinc-500">Speakers are Expensive.</span>
              </h2>
              <div className="space-y-6 text-zinc-500 text-lg md:text-xl leading-relaxed font-medium group-hover:text-zinc-400 transition-colors duration-700">
                <p>
                  SyncBeats was born out of reality. We were at a friend&apos;s house, the Bluetooth speaker died, and we had 5 phones but no way to play music simultaneously loud enough.
                </p>
                <p>
                  We built this platform to turn any collection of devices into an instant surround sound experience. No cables, no bluetooth un-pairing nightmares, no apps to install. Just scan the code, hit play, and keep the party alive.
                </p>
              </div>
            </div>
            
            <div className="flex justify-center md:justify-end">
              <div className="relative w-72 h-72 md:w-96 md:h-96">
                {/* Silver rings */}
                <div className="absolute inset-0 rounded-full bg-white/5 group-hover:bg-white/[0.08] filter blur-[60px] transition-all duration-1000" />
                <div className="absolute inset-4 rounded-full border border-white/5 group-hover:border-white/10 animate-[spin_20s_linear_infinite] transition-colors" />
                <div className="absolute inset-8 rounded-full border border-white/5 animate-[spin_15s_linear_infinite_reverse]" />
                <div className="absolute inset-16 rounded-full border border-white/5 animate-[spin_10s_linear_infinite]" />
                
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-32 h-32 md:w-40 md:h-40 glass-panel rounded-full flex flex-col items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.05)] bg-black/50 group-hover:scale-110 transition-transform duration-700">
                    <span className="font-bold text-sm tracking-widest text-zinc-500 mb-1">ALL DEVICES</span>
                    <span className="font-black text-2xl md:text-3xl tracking-widest text-zinc-200 drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">IN SYNC</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Ambient internal glow */}
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-white/0 group-hover:bg-white/[0.02] rounded-full filter blur-[120px] pointer-events-none transition-colors duration-1000" />
        </motion.div>
      </div>
    </section>
  );
}
