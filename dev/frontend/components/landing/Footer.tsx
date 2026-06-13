import Link from "next/link";
import { Disc } from "lucide-react";

const GithubIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
    <path d="M9 18c-4.51 2-5-2-7-2"/>
  </svg>
);

const TwitterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>
  </svg>
);

export function Footer() {
  return (
    <footer className="w-full border-t border-foreground/5 bg-background/50 relative z-10">
      <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
        
        {/* Brand */}
        <div className="flex flex-col items-center md:items-start gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center border border-foreground/5">
              <Disc className="w-4 h-4 text-foreground" aria-hidden="true" />
            </div>
            <span className="font-black tracking-widest text-foreground text-sm">
              SYNC<span className="text-foreground/50">BEATS</span>
            </span>
          </div>
          <p className="text-xs text-foreground/40 font-medium max-w-xs text-center md:text-left leading-relaxed">
            Built for those who want their music everywhere, all at once. No latency, just vibes.
          </p>
        </div>

        {/* Links */}
        <div className="flex items-center gap-6 md:gap-8 text-sm font-semibold tracking-wide text-foreground/60 flex-wrap justify-center">
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link href="/cookies" className="hover:text-foreground transition-colors">Cookies</Link>
          <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
        </div>

        {/* Socials */}
        <div className="flex items-center gap-4">
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-xl bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center transition-colors text-foreground/60 hover:text-foreground" aria-label="Twitter Profile">
            <TwitterIcon />
          </a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-xl bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center transition-colors text-foreground/60 hover:text-foreground" aria-label="GitHub Repository">
            <GithubIcon />
          </a>
        </div>
      </div>
      
      <div className="w-full border-t border-foreground/5 py-6 flex justify-center">
        <p className="text-[10px] uppercase tracking-widest font-bold text-foreground/30">
          &copy; {new Date().getFullYear()} SyncBeats App. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
