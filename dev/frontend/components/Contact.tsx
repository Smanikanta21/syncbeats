"use client";

import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Mail, Link2, AtSign } from "lucide-react";

const CONTACT_EMAIL = "abhi.businesscontact@gmail.com";
const GITHUB_URL = "https://github.com/smanikanta21";
const LINKEDIN_URL = "https://www.linkedin.com/in/siraparapu-shiva-sankar-mani-kanta-622a85323?utm_source=share_via&utm_content=profile&utm_medium=member_ios";

export function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const subject = `SyncBeats inquiry from ${name || "website visitor"}`;
    const body = [
      `Name: ${name || "Not provided"}`,
      `Email: ${email || "Not provided"}`,
      "",
      message || "No message provided.",
    ].join("\n");

    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 relative z-10">
      <div className="max-w-4xl mx-auto group">
        
        {/* Minute ambient background pulse when hovering form - subtle silver */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[120%] bg-transparent group-hover:bg-foreground/5 blur-[100px] transition-all duration-1000 rounded-[5rem] pointer-events-none -z-10" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12 sm:mb-16 relative"
        >
          <h2 className="text-3xl sm:text-4xl md:text-6xl font-black mb-4 sm:mb-6 tracking-tighter text-foreground">
            Get in <span className="text-foreground/70 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">Touch</span>
          </h2>
          <p className="text-foreground/50 text-base sm:text-xl font-medium">Need early access or have a question? Reach me by email or GitHub.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="glass-panel group-hover:border-foreground/10 p-6 sm:p-8 md:p-12 rounded-[2rem] sm:rounded-[3rem] relative overflow-hidden transition-all duration-700 bg-background/60 backdrop-blur-3xl shadow-xl group-hover:shadow-[0_0_40px_rgba(255,255,255,0.02)]"
        >
          {/* Subtle top right silver blur */}
          <div className="absolute top-0 right-0 w-48 sm:w-64 h-48 sm:h-64 bg-foreground/5 group-hover:bg-foreground/10 filter blur-[60px] transition-colors duration-1000" />
          
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="rounded-2xl border border-foreground/10 bg-foreground/5 p-4 text-foreground/80 hover:border-foreground/30 hover:bg-foreground/10 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2 text-foreground font-semibold">
                <Mail className="w-4 h-4" />
                Email
              </div>
              <p className="text-sm text-foreground/60">Send an email</p>
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-foreground/10 bg-foreground/5 p-4 text-foreground/80 hover:border-foreground/30 hover:bg-foreground/10 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2 text-foreground font-semibold">
                <Link2 className="w-4 h-4" />
                GitHub
              </div>
              <p className="text-sm text-foreground/60">View profile</p>
            </a>
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-foreground/10 bg-foreground/5 p-4 text-foreground/80 hover:border-foreground/30 hover:bg-foreground/10 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2 text-foreground font-semibold">
                <AtSign className="w-4 h-4" />
                LinkedIn
              </div>
              <p className="text-sm text-foreground/60">Connect on LinkedIn</p>
            </a>
          </div>

          <form className="relative z-10 space-y-6 sm:space-y-8" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              <div className="space-y-2 sm:space-y-3">
                <label className="text-sm font-semibold text-foreground/60 ml-1">Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-foreground/5 border border-foreground/5 group-hover:border-foreground/10 rounded-[1.5rem] px-5 py-4 text-foreground focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/30 transition-all placeholder:text-foreground/40"
                  placeholder="Your Name"
                />
              </div>
              <div className="space-y-2 sm:space-y-3">
                <label className="text-sm font-semibold text-foreground/60 ml-1">Email</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-foreground/5 border border-foreground/5 group-hover:border-foreground/10 rounded-[1.5rem] px-4 sm:px-5 py-3 sm:py-4 text-foreground focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/30 transition-all placeholder:text-foreground/40"
                  placeholder="example@syncbeats.com"
                />
              </div>
            </div>
            <div className="space-y-2 sm:space-y-3">
              <label className="text-sm font-semibold text-foreground/60 ml-1">Message</label>
              <textarea 
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full bg-foreground/5 border border-foreground/5 group-hover:border-foreground/10 rounded-[1.5rem] px-4 sm:px-5 py-3 sm:py-4 text-foreground focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/30 transition-all placeholder:text-foreground/40 resize-none"
                placeholder="I need this workspace right now..."
              />
            </div>
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full h-14 sm:h-16 bg-foreground text-background font-bold text-base sm:text-lg rounded-[1.5rem] transition-all flex items-center justify-center gap-3 shadow-xl group/btn"
            >
              Send Message <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover/btn:translate-x-1 transition-transform text-currentColor" />
            </motion.button>
          </form>
        </motion.div>
      </div>
    </section>
  );
}
