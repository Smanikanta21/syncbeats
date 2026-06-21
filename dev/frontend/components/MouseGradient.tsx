"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export function MouseGradient() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Skip mousemove listener entirely on mobile
    if (typeof window !== "undefined" && window.innerWidth < 768) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <motion.div 
      className="fixed w-[40vw] h-[40vw] rounded-full bg-accent-primary/5 blur-[100px] pointer-events-none z-0 hidden md:block"
      animate={{
        x: mousePos.x - (typeof window !== "undefined" ? window.innerWidth / 2 : 0),
        y: mousePos.y - (typeof window !== "undefined" ? window.innerHeight / 2 : 0),
      }}
      transition={{ type: "tween", ease: "easeOut", duration: 0.5 }}
    />
  );
}
