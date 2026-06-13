import { LandingNavbar } from "../components/landing/LandingNavbar";
import { HeroSection } from "../components/landing/HeroSection";
import { FeatureGrid } from "../components/landing/FeatureGrid";
import { Footer } from "../components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden relative selection:bg-foreground/20 selection:text-foreground">
      {/* Dynamic Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[30%] -left-[10%] w-[70vw] h-[70vw] bg-foreground/5 blur-[120px] rounded-full" />
        <div className="absolute top-[40%] -right-[20%] w-[60vw] h-[60vw] bg-foreground/5 blur-[100px] rounded-full" />
      </div>

      <LandingNavbar />
      
      <main className="flex-1 flex flex-col w-full relative z-10">
        <HeroSection />
        <FeatureGrid />
      </main>

      <Footer />
    </div>
  );
}
