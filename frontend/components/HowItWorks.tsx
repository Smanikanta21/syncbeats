"use client";

import { motion } from "framer-motion";
import { Link2, Sparkles, MonitorSmartphone } from "lucide-react";

const STEPS = [
  {
    icon: <Sparkles className="w-10 h-10 text-zinc-300" />,
    title: "Create a Room",
    description: "Start a session from your browser. Pick your music and instantly get a unique room code or shareable link.",
  },
  {
    icon: <Link2 className="w-10 h-10 text-zinc-300" />,
    title: "Friends Join In",
    description: "Anyone can scan the QR code or tap the link to join. No app downloads required—it just works in Safari or Chrome.",
  },
  {
    icon: <MonitorSmartphone className="w-10 h-10 text-zinc-300" />,
    title: "Play in Perfect Sync",
    description: "Hit play. The music streams to all connected devices simultaneously with zero audible latency. Instant surround sound.",
  }
];

export function HowItWorks() {
  return (
    <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16 sm:mb-20 px-2 sm:px-0"
        >
          <h2 className="text-3xl sm:text-4xl md:text-6xl font-black mb-4 sm:mb-6 tracking-tighter text-zinc-300">
            Seamless <span className="text-zinc-400">Setup</span>
          </h2>
          <p className="text-zinc-500 max-w-2xl mx-auto text-base sm:text-xl">
            Bringing the party together shouldn't require downloading apps or un-pairing bluetooth speakers.
          </p>
        </motion.div>

        <div className="relative">
          {/* Connecting Line background - minute silver */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/10 to-transparent hidden lg:block -translate-y-1/2" />
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-16 sm:gap-12 lg:gap-8 relative z-10">
            {STEPS.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.7, delay: index * 0.2, type: "spring" }}
                className="relative flex flex-col items-center text-center group"
              >
                {/* Minute subtle hover glow behind the component */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 sm:w-48 h-32 sm:h-48 bg-white/0 group-hover:bg-white/[0.03] blur-[40px] rounded-full transition-colors duration-700 pointer-events-none -z-10" />

                <div className="w-20 h-20 sm:w-24 sm:h-24 mb-6 sm:mb-8 rounded-[1.5rem] sm:rounded-[2rem] glass-panel flex items-center justify-center relative overflow-hidden group-hover:scale-110 group-hover:border-white/20 transition-all duration-500 z-10 bg-black/40">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent border border-white/5 rounded-[1.5rem] sm:rounded-[2rem]" />
                  {/* Using standard icon classes here, assuming they scale or we adjust manually */}
                  <div className="scale-75 sm:scale-100 flex items-center justify-center">{step.icon}</div>
                </div>
                
                {/* Step Number Badge */}
                <div className="absolute top-0 right-[15%] text-[6rem] sm:text-[8rem] font-black text-white/[0.02] leading-none z-0 pointer-events-none group-hover:text-white/[0.04] transition-colors">
                  {index + 1}
                </div>

                <h3 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-zinc-200 tracking-tight relative z-10 group-hover:text-white transition-colors">{step.title}</h3>
                <p className="text-sm sm:text-lg text-zinc-500 leading-relaxed relative z-10 max-w-sm group-hover:text-zinc-400 transition-colors px-4 sm:px-0">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
