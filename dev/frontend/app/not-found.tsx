import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LandingNavbar } from "../components/landing/LandingNavbar";
import { Footer } from "../components/landing/Footer";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden relative selection:bg-foreground/20 selection:text-foreground">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[30%] -left-[10%] w-[70vw] h-[70vw] bg-foreground/5 blur-[120px] rounded-full" />
        <div className="absolute top-[40%] -right-[20%] w-[60vw] h-[60vw] bg-foreground/5 blur-[100px] rounded-full" />
      </div>

      <LandingNavbar />

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-2xl mx-auto flex flex-col items-center glass-panel p-16 rounded-[3rem] border border-foreground/5 shadow-[0_10px_40px_rgba(0,0,0,0.15)] bg-background/40">
          <h1 className="text-8xl md:text-9xl font-black tracking-tighter mb-6 text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/20">
            404
          </h1>
          <p className="text-xl md:text-2xl text-foreground/60 font-medium mb-12">
            The track you're looking for couldn't be found.
          </p>
          <Link href="/" className="h-14 px-8 flex items-center justify-center gap-2 rounded-2xl bg-foreground text-background text-sm font-black tracking-widest uppercase hover:scale-[1.02] active:scale-95 transition-all shadow-[0_10px_40px_rgba(0,0,0,0.15)]">
            <ArrowLeft className="w-4 h-4" /> Go Back Home
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
