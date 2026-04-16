import { Navbar } from "../components/Navbar";
import { Hero } from "../components/Hero";
import { HowItWorks } from "../components/HowItWorks";
import { Features } from "../components/Features";
import { About } from "../components/About";
import { Contact } from "../components/Contact";
import { Footer } from "../components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-accent-primary/30 selection:text-white">
      {/* Global Ambient Background */}
      <div className="mesh-bg" />
      
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
