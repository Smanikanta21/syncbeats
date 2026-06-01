export function Footer() {
  return (
    <footer className="border-t border-foreground/5 bg-background/40 backdrop-blur-2xl pt-20 pb-10 px-4 sm:px-6 lg:px-8 mt-10 relative z-10">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
        <div className="flex flex-col items-start gap-4">
          <span className="text-3xl font-black tracking-tighter text-foreground">SYNC<span className="text-foreground/50">BEATS</span></span>
          <p className="text-foreground/50 text-sm max-w-xs leading-relaxed">
            The collaborative workspace built specifically for music creators. Ship music faster.
          </p>
          <p className="text-foreground/40 text-sm mt-4">© {new Date().getFullYear()} SyncBeats Inc. All rights reserved.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-12 md:gap-24">
          <div className="flex flex-col gap-4">
            <h4 className="text-foreground font-bold mb-2">Support</h4>
            <a href="https://github.com/Smanikanta21/syncbeats/issues" target="_blank" rel="noreferrer" className="text-foreground/50 hover:text-foreground transition-colors text-sm">Report an Issue</a>
          </div>
          <div className="flex flex-col gap-4">
            <h4 className="text-foreground font-bold mb-2">Legal</h4>
            <a href="/privacy-policy" className="text-foreground/50 hover:text-foreground transition-colors text-sm">Privacy Policy</a>
            <a href="/terms-of-service" className="text-foreground/50 hover:text-foreground transition-colors text-sm">Terms of Service</a>
            <a href="/cookie-settings" className="text-foreground/50 hover:text-foreground transition-colors text-sm">Cookie Settings</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
