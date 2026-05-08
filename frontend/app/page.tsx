"use client"
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {Navbar} from "../components/Navbar";
import { Hero } from "../components/Hero";

// Lazy-load below-the-fold sections to reduce initial JS bundle and TBT
const HowItWorks = dynamic(() => import("../components/HowItWorks").then(m => m.HowItWorks), { ssr: false });
const Features   = dynamic(() => import("../components/Features").then(m => m.Features),     { ssr: false });
const About      = dynamic(() => import("../components/About").then(m => m.About),           { ssr: false });
const Contact    = dynamic(() => import("../components/Contact").then(m => m.Contact),        { ssr: false });
const Footer     = dynamic(() => import("../components/Footer").then(m => m.Footer),          { ssr: false });

export default function Home() {
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setTheme(localStorage.getItem('theme'));
    }
  }, []);

  return (
    <div className="min-h-screen text-foreground selection:bg-accent-primary/30">
      {/* Global Ambient Background */}
      <div className={`${theme === 'light' ? 'mesh-bg' : ''}`} />
      
      <Navbar />
      <main className="relative z-10 flex flex-col pb-20">
        <div id="hero">
          <Hero />
        </div>
        <div id="how-it-works">
          <HowItWorks />
        </div>
        <div id="features">
          <Features />
        </div>
        <div id="about">
          <About />
        </div>
        <div id="contact">
          <Contact />
        </div>
      </main>
      <Footer />
    </div>
  );
}
