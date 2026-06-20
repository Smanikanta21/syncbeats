"use client";

import { useEffect, useRef, useState } from "react";
import { useAudio } from "../context/AudioContext";

export function AmbientBackground({ syncWithAudio = false }: { syncWithAudio?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  // Conditionally get audio context. If syncWithAudio is true, we expect to be inside AudioProvider.
  // We can't unconditionally call useAudio() because this component might be used outside AudioProvider (e.g., in landing page).
  let audioContext: ReturnType<typeof useAudio> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    if (syncWithAudio) audioContext = useAudio();
  } catch {
    // Ignore error if not wrapped in AudioProvider
  }

  useEffect(() => {
    if (isMobile) return;
    if (!syncWithAudio || !audioContext) return;
    
    let rafId: number;
    const { getAudioData } = audioContext;

    let smoothedLevel = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      if (!containerRef.current) return;

      const audioLevel = getAudioData(); // Normalized 0 to 1
      // Add smoothing to make it pulse naturally and not jitter
      smoothedLevel = smoothedLevel * 0.8 + audioLevel * 0.2;
      
      const scale = 1 + (smoothedLevel * 0.2); // Reduced from 0.4 for subtlety
      const opacity = 1 + (smoothedLevel * 0.3);

      containerRef.current.style.transform = `scale(${scale})`;
      containerRef.current.style.opacity = `${opacity}`;
    };

    animate();
    return () => cancelAnimationFrame(rafId);
  }, [syncWithAudio, audioContext, isMobile]);

  if (isMobile) {
    return (
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div 
          className="absolute inset-0 w-full h-full opacity-60 animate-[pulse_8s_ease-in-out_infinite_alternate]"
          style={{
            background: "radial-gradient(circle at 30% 30%, rgba(239, 68, 68, 0.1) 0%, transparent 40%), radial-gradient(circle at 80% 60%, rgba(59, 130, 246, 0.1) 0%, transparent 40%), radial-gradient(circle at 40% 90%, rgba(168, 85, 247, 0.1) 0%, transparent 50%)"
          }}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <div 
        ref={containerRef}
        className="absolute inset-0 w-full h-full"
        style={{ transformOrigin: "center center" }}
      >
        <div className="absolute -top-[10%] -left-[10%] w-[50vw] h-[50vw] bg-red-500/5 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute top-[40%] -right-[10%] w-[40vw] h-[40vw] bg-blue-500/5 blur-[100px] rounded-full mix-blend-screen" />
        <div className="absolute -bottom-[10%] left-[20%] w-[60vw] h-[60vw] bg-purple-500/5 blur-[150px] rounded-full mix-blend-screen" />
      </div>
    </div>
  );
}
