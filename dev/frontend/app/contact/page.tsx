import { LandingNavbar } from "../../components/landing/LandingNavbar";
import { Footer } from "../../components/landing/Footer";
import { Mail, MessageSquare, Send } from "lucide-react";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden relative selection:bg-foreground/20 selection:text-foreground">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[30%] -left-[10%] w-[70vw] h-[70vw] bg-foreground/5 blur-[120px] rounded-full" />
        <div className="absolute top-[40%] -right-[20%] w-[60vw] h-[60vw] bg-foreground/5 blur-[100px] rounded-full" />
      </div>

      <LandingNavbar />

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-stretch">
          
          {/* Left Column: Info */}
          <div className="glass-panel p-10 md:p-12 rounded-[3rem] border border-foreground/5 shadow-[0_10px_40px_rgba(0,0,0,0.15)] bg-background/40 flex flex-col justify-between">
            <div>
              <h1 className="text-4xl md:text-5xl font-black mb-6 tracking-tighter">Get in touch.</h1>
              <p className="text-foreground/60 font-medium leading-relaxed mb-10">
                Have a question about SyncBeats, want to report a bug, or just want to chat about web audio engineering? We're all ears.
              </p>
            </div>

            <div className="space-y-6">
              <a href="mailto:hello@syncbeats.app" className="flex items-center gap-4 group">
                <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center group-hover:bg-foreground/10 transition-colors border border-foreground/5">
                  <Mail className="w-5 h-5 text-foreground/70 group-hover:text-foreground transition-colors" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-foreground/40 mb-1">Email Us</p>
                  <p className="text-sm font-semibold text-foreground group-hover:underline underline-offset-4">hello@syncbeats.app</p>
                </div>
              </a>

              <a href="https://x.com/Smanikanta21" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 group">
                <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center group-hover:bg-foreground/10 transition-colors border border-foreground/5">
                  <MessageSquare className="w-5 h-5 text-foreground/70 group-hover:text-foreground transition-colors" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-foreground/40 mb-1">DM on X</p>
                  <p className="text-sm font-semibold text-foreground group-hover:underline underline-offset-4">@Smanikanta21</p>
                </div>
              </a>
            </div>
          </div>

          {/* Right Column: Form */}
          <div className="glass-panel p-10 md:p-12 rounded-[3rem] border border-foreground/5 shadow-[0_10px_40px_rgba(0,0,0,0.15)] bg-foreground/5 backdrop-blur-xl">
            <form className="flex flex-col gap-6 h-full justify-center">
              <div className="space-y-2">
                <label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-foreground/60 pl-2">Name</label>
                <input 
                  type="text" 
                  id="name" 
                  placeholder="John Doe"
                  className="w-full bg-background/50 border border-foreground/10 hover:border-foreground/20 focus:border-accent-primary/40 rounded-2xl px-5 py-4 text-sm font-medium text-foreground focus:outline-none transition-all placeholder:text-foreground/20"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-foreground/60 pl-2">Email</label>
                <input 
                  type="email" 
                  id="email" 
                  placeholder="john@example.com"
                  className="w-full bg-background/50 border border-foreground/10 hover:border-foreground/20 focus:border-accent-primary/40 rounded-2xl px-5 py-4 text-sm font-medium text-foreground focus:outline-none transition-all placeholder:text-foreground/20"
                />
              </div>

              <div className="space-y-2 flex-1 flex flex-col">
                <label htmlFor="message" className="text-xs font-bold uppercase tracking-widest text-foreground/60 pl-2">Message</label>
                <textarea 
                  id="message" 
                  placeholder="How can we help?"
                  className="w-full flex-1 min-h-[120px] bg-background/50 border border-foreground/10 hover:border-foreground/20 focus:border-accent-primary/40 rounded-2xl px-5 py-4 text-sm font-medium text-foreground focus:outline-none transition-all placeholder:text-foreground/20 resize-none"
                />
              </div>

              <button 
                type="button"
                className="w-full h-14 mt-2 flex items-center justify-center gap-2 rounded-2xl bg-foreground text-background text-sm font-black tracking-widest uppercase hover:scale-[1.02] active:scale-95 transition-all shadow-lg"
              >
                Send Message <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
