"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DynamicAuroraButton } from "./DynamicAuroraButton";

export function ContactForm() {
  const [contactForm, setContactForm] = useState({ name: "", email: "", message: "" });
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      toast.error("Please fill in all fields before sending.");
      return;
    }
    setIsSubmittingContact(true);
    setTimeout(() => {
      toast.success("Thank you! Your message has been sent successfully.");
      setContactForm({ name: "", email: "", message: "" });
      setIsSubmittingContact(false);
    }, 600);
  };

  return (
    <form onSubmit={handleContactSubmit} className="glass-panel p-6 md:p-12 rounded-3xl md:rounded-[2.5rem] border border-foreground/10 flex flex-col gap-4 md:gap-6 shadow-lg hover:bg-background/20 dark:hover:bg-black/20 hover:backdrop-blur-3xl hover:shadow-2xl transition-all duration-500">
      <div>
        <label htmlFor="name" className="block text-xs font-bold uppercase tracking-widest text-foreground/60 mb-2">Name</label>
         <input type="text" id="name" required value={contactForm.name} onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3.5 text-foreground text-base outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/30 transition-all placeholder:text-foreground/40" placeholder="Your name" />
      </div>
      <div>
        <label htmlFor="email" className="block text-xs font-bold uppercase tracking-widest text-foreground/60 mb-2">Email</label>
         <input type="email" id="email" required value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3.5 text-foreground text-base outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/30 transition-all placeholder:text-foreground/40" placeholder="your@email.com" />
      </div>
      <div>
        <label htmlFor="message" className="block text-xs font-bold uppercase tracking-widest text-foreground/60 mb-2">Message</label>
         <textarea id="message" rows={4} required value={contactForm.message} onChange={e => setContactForm(f => ({ ...f, message: e.target.value }))} className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3.5 text-foreground text-base outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/30 transition-all resize-none placeholder:text-foreground/40" placeholder="How can we help?" />
      </div>
       <DynamicAuroraButton type="submit" disabled={isSubmittingContact} className="w-full h-14 rounded-2xl gap-3 text-xs md:text-sm mt-2">
         <Send className="w-4 h-4 text-foreground fill-foreground/80" /> {isSubmittingContact ? "Sending..." : "Send Message"}
       </DynamicAuroraButton>
    </form>
  );
}
