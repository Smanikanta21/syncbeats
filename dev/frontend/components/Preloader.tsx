"use client";

import { useEffect, useState } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePathname } from "next/navigation";
import { FullscreenLoader } from "./FullscreenLoader";

export default function Preloader() {
  const [isLoading, setIsLoading] = useState(true);
  const pathname = usePathname();
  const isMainEntry = pathname === "/" || pathname === "/hub";

  useEffect(() => {
    // Force scroll to top on load to prevent GSAP/Framer Motion from breaking if browser restores scroll position
    window.scrollTo(0, 0);
    
    // Keep preloader visible for a moment to hide hydration flashes
    const timer = setTimeout(() => {
      setIsLoading(false);
      // Refresh ScrollTrigger after preloader is gone so pinning dimensions are calculated correctly
      setTimeout(() => {
        ScrollTrigger.refresh();
      }, 100);
    }, 800); 

    return () => clearTimeout(timer);
  }, []);

  let msg = undefined;
  if (pathname === "/login") msg = "Authenticating ...";
  else if (pathname?.startsWith("/room/")) msg = "Preparing Room...";

  return <FullscreenLoader isVisible={isLoading} message={msg} isMainEntry={isMainEntry} />;
}
