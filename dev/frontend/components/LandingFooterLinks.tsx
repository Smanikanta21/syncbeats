"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { InstagramIcon } from "./InstagramFollowButton";

export function LandingFooterLinks() {
  const router = useRouter();

  return (
    <div className="flex items-center gap-4 sm:gap-6">
      <motion.div whileHover={{ y: -2, scale: 1.05 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
        <Link href="/privacy-policy" prefetch={true} className="hover:text-foreground transition-colors inline-block">Privacy</Link>
      </motion.div>
      <motion.div whileHover={{ y: -2, scale: 1.05 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
        <Link href="/terms-of-service" prefetch={true} className="hover:text-foreground transition-colors inline-block">Terms</Link>
      </motion.div>
      <motion.div whileHover={{ y: -2, scale: 1.05 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
        <Link href="/cookie-settings" prefetch={true} className="hover:text-foreground transition-colors inline-block">Cookies</Link>
      </motion.div>
      <motion.div whileHover={{ y: -2, scale: 1.05 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
        <a
           href="#contact"
           onClick={(e) => {
             e.preventDefault();
             const el = document.getElementById("contact");
             if (el) {
               el.scrollIntoView({ behavior: "smooth" });
             } else {
               router.push("/contact");
             }
           }}
           className="hover:text-foreground transition-colors cursor-pointer inline-block"
         >
           Contact
         </a>
      </motion.div>
      <div className="flex items-center gap-3 ml-2 border-l border-foreground/10 pl-4 sm:pl-6">
        <motion.a 
          href="https://www.instagram.com/syncbeats.in/" 
          target="_blank" 
          rel="noopener noreferrer" 
          whileHover={{ y: -2, scale: 1.15 }} 
          whileTap={{ scale: 0.9 }} 
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          className="hover:text-pink-400 transition-colors p-1 rounded-lg hover:bg-pink-500/10" 
          title="Instagram @syncbeats.in"
        >
          <InstagramIcon className="w-4 h-4" />
        </motion.a>
        <motion.a 
          href="https://github.com/smanikanta21" 
          target="_blank" 
          rel="noopener noreferrer" 
          whileHover={{ y: -2, scale: 1.15 }} 
          whileTap={{ scale: 0.9 }} 
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          className="hover:text-foreground transition-colors p-1 rounded-lg hover:bg-foreground/10" 
          title="GitHub"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.02c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A4.8 4.8 0 0 0 8 18v4"></path></svg>
        </motion.a>
        <motion.a 
          href="https://www.linkedin.com/in/siraparapu-shiva-sankar-mani-kanta-622a85323?utm_source=share_via&utm_content=profile&utm_medium=member_ios" 
          target="_blank" 
          rel="noopener noreferrer" 
          whileHover={{ y: -2, scale: 1.15 }} 
          whileTap={{ scale: 0.9 }} 
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          className="hover:text-foreground transition-colors p-1 rounded-lg hover:bg-foreground/10" 
          title="LinkedIn"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
        </motion.a>
      </div>
    </div>
  );
}
