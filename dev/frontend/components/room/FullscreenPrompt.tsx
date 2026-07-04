"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize, X } from "lucide-react";

export function FullscreenPrompt() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if we are already in fullscreen
    const checkFullscreen = () => {
      const isFullscreen = document.fullscreenElement != null;
      // Also check if screen is small (mobile/tablet)
      const isSmallScreen = window.innerWidth <= 1024;
      
      if (!isFullscreen && isSmallScreen) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    // Show prompt after a short delay on enter
    const timer = setTimeout(checkFullscreen, 1500);

    const handleFullscreenChange = () => checkFullscreen();
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const requestFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setIsVisible(false);
    } catch (err) {
      console.warn("Fullscreen request failed", err);
      setIsVisible(false);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm pointer-events-auto"
        >
          <div className="bg-background/80 backdrop-blur-xl border border-white/10 p-5 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.5)] overflow-hidden relative">
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 50% 0%, rgba(255,255,255,1) 0%, transparent 70%)",
              }}
            />
            
            <button 
              onClick={() => setIsVisible(false)}
              className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center text-center mt-2">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mb-4 border border-blue-500/30">
                <Maximize className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-sm font-bold text-white mb-2">Switch to Fullscreen</h3>
              <p className="text-xs text-white/60 mb-6 leading-relaxed">
                For the best spatial audio experience on this device, we recommend switching to fullscreen mode so the room layout fits perfectly.
              </p>
              <button
                onClick={requestFullscreen}
                className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] active:scale-95 uppercase tracking-widest"
              >
                Enter Fullscreen
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
