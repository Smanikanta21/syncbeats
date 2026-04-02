"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function Contact() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative z-10">
      <div className="max-w-4xl mx-auto group">
        
        {/* Minute ambient background pulse when hovering form - subtle silver */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[120%] bg-white/0 group-hover:bg-white/[0.03] blur-[100px] transition-all duration-1000 rounded-[5rem] pointer-events-none -z-10" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16 relative"
        >
          <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tighter text-zinc-300">
            Get in <span className="text-zinc-500 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">Touch</span>
          </h2>
          <p className="text-zinc-500 text-xl font-medium">Need early access or have a question? Drop us a line.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="glass-panel group-hover:border-white/10 p-8 md:p-12 rounded-[3rem] relative overflow-hidden transition-all duration-700 bg-black/60 backdrop-blur-3xl shadow-xl group-hover:shadow-[0_0_40px_rgba(255,255,255,0.02)]"
        >
          {/* Subtle top right silver blur */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 group-hover:bg-white/10 filter blur-[60px] transition-colors duration-1000" />
          
          <form className="relative z-10 space-y-8" onSubmit={(e) => e.preventDefault()}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-sm font-semibold text-zinc-400 ml-1">Name</label>
                <input 
                  type="text" 
                  className="w-full bg-white/5 border border-white/5 group-hover:border-white/10 rounded-[1.5rem] px-5 py-4 text-zinc-200 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all placeholder:text-zinc-600"
                  placeholder="Rick Rubin"
                />
              </div>
              <div className="space-y-3">
                <label className="text-sm font-semibold text-zinc-400 ml-1">Email</label>
                <input 
                  type="email" 
                  className="w-full bg-white/5 border border-white/5 group-hover:border-white/10 rounded-[1.5rem] px-5 py-4 text-zinc-200 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all placeholder:text-zinc-600"
                  placeholder="rick@defjam.com"
                />
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-semibold text-zinc-400 ml-1">Message</label>
              <textarea 
                rows={5}
                className="w-full bg-white/5 border border-white/5 group-hover:border-white/10 rounded-[1.5rem] px-5 py-4 text-zinc-200 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all placeholder:text-zinc-600 resize-none"
                placeholder="I need this workspace right now..."
              />
            </div>
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full h-16 bg-zinc-200 text-black font-bold text-lg rounded-[1.5rem] hover:bg-white transition-all flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(255,255,255,0.05)] group/btn"
            >
              Send Message <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform text-black" />
            </motion.button>
          </form>
        </motion.div>
      </div>
    </section>
  );
}
