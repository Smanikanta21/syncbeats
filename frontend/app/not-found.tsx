import Link from 'next/link';
import { Disc } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground relative overflow-hidden px-6">
      {/* Dynamic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[20%] left-[30%] w-[500px] h-[500px] bg-red-500/10 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[20%] right-[30%] w-[400px] h-[400px] bg-blue-500/10 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-lg mx-auto glass-panel bg-background/50 backdrop-blur-3xl border border-foreground/10 rounded-[3rem] p-12 shadow-[0_20px_80px_rgba(0,0,0,0.2)]">
        <div className="w-24 h-24 rounded-3xl bg-foreground/5 border border-foreground/10 flex items-center justify-center mb-8 shadow-inner relative overflow-hidden group">
          <Disc className="w-12 h-12 text-foreground/50 group-hover:text-foreground transition-colors duration-500 animate-[spin_8s_linear_infinite]" />
        </div>
        
        <h1 className="text-7xl sm:text-9xl font-black mb-2 tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/30">
          404
        </h1>
        <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-foreground/90 tracking-tight">
          Track Not Found
        </h2>
        
        <p className="text-base text-foreground/50 mb-10 leading-relaxed font-medium max-w-xs">
          The page you're looking for has been skipped, the room expired, or it never existed.
        </p>
        
        <Link 
          href="/"
          className="group relative h-14 px-8 rounded-2xl bg-foreground text-background font-bold flex items-center justify-center overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(0,0,0,0.2)] dark:shadow-[0_0_30px_rgba(255,255,255,0.1)] w-full sm:w-auto"
        >
          <span className="relative z-10 flex items-center gap-2">
            Return to Hub <span className="opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all">→</span>
          </span>
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
        </Link>
      </div>
    </main>
  );
}
