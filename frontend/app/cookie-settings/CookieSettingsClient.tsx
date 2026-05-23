"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Cookie, CheckCircle2, XCircle, ShieldAlert, Disc } from "lucide-react";

export default function CookieSettingsClient() {
  const [essentialEnabled, setEssentialEnabled] = useState(true);  // Always on
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [marketingEnabled, setMarketingEnabled] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const preferences = localStorage.getItem("cookiePreferences");
    if (preferences) {
      const prefs = JSON.parse(preferences);
      setAnalyticsEnabled(prefs.analytics || false);
      setMarketingEnabled(prefs.marketing || false);
    }
  }, []);

  const handleSave = () => {
    const preferences = {
      essential: true,
      analytics: analyticsEnabled,
      marketing: false, // Currently not in use
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem("cookiePreferences", JSON.stringify(preferences));
    
    if (analyticsEnabled) {
      if (typeof window !== "undefined" && (window as any).gtag) {
        (window as any).gtag("consent", "update", {
          analytics_storage: "granted",
        });
      }
    }
    
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleRejectAll = () => {
    const preferences = { essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() };
    localStorage.setItem("cookiePreferences", JSON.stringify(preferences));
    setAnalyticsEnabled(false);
    setMarketingEnabled(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleAcceptAll = () => {
    setAnalyticsEnabled(true);
    setMarketingEnabled(false); // Currently not in use
    const preferences = { essential: true, analytics: true, marketing: false, timestamp: new Date().toISOString() };
    localStorage.setItem("cookiePreferences", JSON.stringify(preferences));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <main className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Back to Home Button */}
      <Link href="/" className="absolute top-6 left-6 md:top-8 md:left-8 z-50 flex items-center gap-2 group">
        <div className="w-8 h-8 rounded-full bg-foreground/5 border border-foreground/10 flex items-center justify-center group-hover:bg-foreground/10 transition-colors">
          <Disc className="w-4 h-4 text-foreground/80 animate-[spin_4s_linear_infinite]" />
        </div>
        <span className="text-sm font-bold tracking-widest text-foreground/60 group-hover:text-foreground transition-colors">HOME</span>
      </Link>

      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] -left-[10%] w-[500px] h-[500px] bg-red-500/5 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[10%] -right-[10%] w-[400px] h-[400px] bg-blue-500/5 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <div className="max-w-5xl mx-auto px-6 py-24 relative z-10">
        <div className="mb-12 text-center md:text-left flex items-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-foreground/5 border border-foreground/10 flex items-center justify-center shrink-0 shadow-inner">
            <Cookie className="w-8 h-8 text-foreground/80" />
          </div>
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/50">
              Cookie Settings
            </h1>
            <p className="text-foreground/50 font-bold uppercase tracking-widest text-sm mt-1">Manage your privacy</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            
            <div className="glass-panel bg-background/50 backdrop-blur-xl border border-foreground/10 rounded-[2rem] p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)]">
              <h2 className="text-2xl font-bold mb-4 tracking-tight">What are cookies?</h2>
              <p className="text-foreground/70 leading-relaxed font-medium">
                Cookies are small text files stored on your device that help websites remember your preferences and activity. SyncBeats uses cookies to improve your experience, provide analytics, and maintain your session.
              </p>
            </div>

            {/* Essential Cookies */}
            <div className="glass-panel bg-background/50 backdrop-blur-xl border border-foreground/10 rounded-[2rem] p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)] transition-colors hover:bg-foreground/[0.02]">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-emerald-500" /> Essential Cookies</h3>
                  <p className="text-sm text-foreground/50 font-medium mt-1">Required for the service to function</p>
                </div>
                <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-full text-xs font-bold tracking-widest">
                  ALWAYS ON
                </div>
              </div>
              <p className="text-foreground/70 mb-4 font-medium">
                These cookies are necessary for SyncBeats to work. They enable core functionality like keeping you logged in, maintaining room state, and ensuring security.
              </p>
            </div>

            {/* Analytics Cookies */}
            <div className="glass-panel bg-background/50 backdrop-blur-xl border border-foreground/10 rounded-[2rem] p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)] transition-colors hover:bg-foreground/[0.02]">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold">Analytics Cookies</h3>
                  <p className="text-sm text-foreground/50 font-medium mt-1">Help us understand how you use SyncBeats</p>
                </div>
                <button
                  onClick={() => setAnalyticsEnabled(!analyticsEnabled)}
                  className={`relative w-14 h-8 rounded-full transition-colors duration-300 border ${
                    analyticsEnabled ? "bg-foreground border-foreground/20" : "bg-foreground/10 border-foreground/10"
                  }`}
                >
                  <div
                    className={`absolute top-1 w-6 h-6 rounded-full transition-transform duration-300 shadow-sm ${
                      analyticsEnabled ? "translate-x-7 bg-background" : "translate-x-1 bg-foreground/40"
                    }`}
                  />
                </button>
              </div>
              <p className="text-foreground/70 mb-4 font-medium">
                We use Google Analytics to understand how visitors use our website. This helps us improve features and fix issues. No personal information is collected.
              </p>
            </div>

            {/* Marketing Cookies */}
            <div className="glass-panel bg-background/50 backdrop-blur-xl border border-foreground/10 rounded-[2rem] p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)] transition-colors hover:bg-foreground/[0.02]">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-3">
                    Marketing Cookies
                    <span className="px-2 py-0.5 bg-foreground/10 text-foreground/60 rounded-full text-[10px] font-bold tracking-widest uppercase">
                      Coming Soon
                    </span>
                  </h3>
                  <p className="text-sm text-foreground/50 font-medium mt-1">For future advertising</p>
                </div>
                <button
                  disabled
                  className="relative w-14 h-8 rounded-full border bg-foreground/5 border-foreground/5 cursor-not-allowed opacity-50"
                >
                  <div className="absolute top-1 left-1 w-6 h-6 rounded-full bg-foreground/20" />
                </button>
              </div>
              <p className="text-foreground/70 font-medium">
                We may use these cookies in the future to show relevant ads. Currently not in use.
              </p>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              
              <div className="glass-panel bg-background/50 backdrop-blur-xl border border-foreground/10 text-foreground rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-foreground/5 blur-[50px] rounded-full pointer-events-none" />
                
                <h3 className="text-xl font-bold mb-6 tracking-tight relative z-10">Your Selection</h3>
                
                <div className="space-y-4 mb-8 relative z-10 font-medium">
                  <div className="flex justify-between items-center">
                    <span className="text-foreground/80">Essential</span>
                    <span className="flex items-center gap-1 text-emerald-500 font-bold"><CheckCircle2 className="w-4 h-4" /> On</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-foreground/80">Analytics</span>
                    {analyticsEnabled ? 
                      <span className="flex items-center gap-1 text-emerald-500 font-bold"><CheckCircle2 className="w-4 h-4" /> On</span> :
                      <span className="flex items-center gap-1 text-foreground/40 font-bold"><XCircle className="w-4 h-4" /> Off</span>
                    }
                  </div>
                  <div className="flex justify-between items-center opacity-50">
                    <span className="text-foreground/80">Marketing</span>
                    <span className="flex items-center gap-1 text-foreground/40 font-bold"><XCircle className="w-4 h-4" /> Off</span>
                  </div>
                </div>

                <div className="space-y-3 relative z-10">
                  <button onClick={handleAcceptAll} className="w-full py-4 px-4 bg-foreground text-background font-bold rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                    Accept All
                  </button>
                  <button onClick={handleRejectAll} className="w-full py-3 px-4 bg-foreground/10 hover:bg-foreground/20 text-foreground font-bold rounded-xl transition-colors">
                    Reject Optional
                  </button>
                  <button onClick={handleSave} className="w-full py-3 px-4 border border-foreground/20 hover:bg-foreground/5 text-foreground font-bold rounded-xl transition-colors">
                    Save Choices
                  </button>
                </div>

                {saved && (
                  <div className="absolute inset-0 z-20 bg-emerald-500 flex flex-col items-center justify-center text-white animate-in fade-in duration-300">
                    <CheckCircle2 className="w-12 h-12 mb-2" />
                    <span className="font-bold tracking-widest uppercase">Saved</span>
                  </div>
                )}
              </div>

              <p className="text-sm text-foreground/50 text-center font-medium px-4">
                For more details, please review our <a href="/privacy-policy" className="text-foreground underline underline-offset-2 hover:opacity-80 transition-opacity">Privacy Policy</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
