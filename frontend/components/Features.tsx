"use client";

import { motion } from "framer-motion";
import { Zap, Globe, Smartphone, Music4, Wifi, QrCode, ArrowUpRight } from "lucide-react";
import { Variants } from "framer-motion";

const FEATURES = [
  { icon: <Zap className="w-6 h-6" />, title: "Zero Latency", desc: "Advanced clock synchronization ensures every beat drops at the exact same millisecond across all devices." },
  { icon: <Globe className="w-6 h-6" />, title: "Fully Web-Based", desc: "No downloads, no app stores. Anyone with a web browser can join your session instantly." },
  { icon: <Wifi className="w-6 h-6" />, title: "Works on Any Network", desc: "Whether you're on the same Wi-Fi network or connected via 5G, the sync remains flawless." },
  { icon: <Music4 className="w-6 h-6" />, title: "High Fidelity", desc: "Streams rich, uncompressed audio so you never sacrifice quality for synchronization." },
  { icon: <Smartphone className="w-6 h-6" />, title: "Unlimited Devices", desc: "Connect 2 phones in the dorm or 100 laptops in a hall. Scale your makeshift soundsystem." },
  { icon: <QrCode className="w-6 h-6" />, title: "Scan & Join", desc: "Generate a massive QR code on the host device. Friends scan it with their camera and join in seconds." }
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } as any }
};

export function Features() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative z-10">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="text-center mb-20 relative"
        >
          {/* Subtle silver glow behind Section Title */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-32 bg-white/5 blur-[50px] rounded-full pointer-events-none" />
          
          <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tighter relative z-10 text-zinc-300">
            Everything you need for the <br className="hidden md:block" />
            <span className="text-zinc-400">Perfect Party</span>
          </h2>
          <p className="text-zinc-500 max-w-2xl mx-auto text-xl relative z-10">
            Engineered to turn any group of friends into a synced soundsystem.
          </p>
        </motion.div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative"
        >
          {/* Ambient floor glow underneath the grid - subtle silver */}
          <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-4/5 h-48 bg-white/5 blur-[80px] pointer-events-none rounded-full" />

          {FEATURES.map((feature, i) => (
            <motion.div
              key={i}
              variants={itemVariants}
              whileHover={{ y: -8, scale: 1.02 }}
              className="group relative p-8 rounded-[2rem] flex flex-col items-start gap-6 cursor-pointer overflow-hidden glass-panel transition-all duration-300 z-10"
            >
              {/* Massive hover glow UNDERNEATH the border inside the card - subtle silver */}
              <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.03] transition-all duration-500 pointer-events-none" />
              
              {/* Outer bottom glow that emits outside the card on hover - minute silver */}
              <div className="absolute -inset-1 bg-white/[0.03] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10 rounded-[2.5rem]" />

              <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 -translate-y-4 group-hover:translate-x-0 group-hover:translate-y-0">
                <ArrowUpRight className="w-6 h-6 text-zinc-300" />
              </div>
              
              <div className="p-4 bg-zinc-800/50 text-zinc-300 rounded-2xl group-hover:scale-110 group-hover:bg-white/10 shadow-[0_0_10px_rgba(255,255,255,0)] group-hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all duration-300 relative z-10">
                {feature.icon}
              </div>
              
              <div className="relative z-10">
                <h4 className="text-2xl font-bold mb-3 text-zinc-200 tracking-tight">{feature.title}</h4>
                <p className="text-zinc-500 text-base leading-relaxed group-hover:text-zinc-400 transition-colors">{feature.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
