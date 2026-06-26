"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { AuroraBackground } from "./AuroraBackground";
import { CommandCenter } from "./CommandCenter";
import { DiscoveryExperience } from "./DiscoveryExperience";

export default function LandingClient() {
  const { user, loading } = useAuth();

  return (
    <div
      className="landing-scope relative min-h-[100dvh] overflow-x-clip"
      style={{
        background: "#050507",
        color: "#ffffff",
        // Force override any inherited body color from light-mode theme
      }}
    >
      {/* Aurora background — always visible */}
      <AuroraBackground />

      {/* Skip-to-content for accessibility */}
      <a
        href="#landing-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-[#00FFB2] focus:text-[#050507] focus:px-4 focus:py-2 focus:rounded-lg focus:font-bold focus:text-sm"
      >
        Skip to content
      </a>

      {/* Main content */}
      <div id="landing-content" className="relative z-10">
        {loading ? (
          /* Loading state — show a minimal skeleton while auth resolves */
          <div className="min-h-[100dvh] flex items-center justify-center">
            <div
              className="w-1.5 h-1.5 rounded-full bg-[#00FFB2]"
              style={{ animation: "subtle-pulse 2s ease-in-out infinite" }}
            />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {user ? (
              <motion.div
                key="command-center"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              >
                <CommandCenter user={user} />
              </motion.div>
            ) : (
              <motion.div
                key="discovery"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <DiscoveryExperience />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
